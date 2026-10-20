/**
 * GameEngine —— 游戏心跳
 * 所有推进均基于时间戳差值,切后台/休眠/关闭均不丢进度
 */
import { gn, mulN } from '@/utils/gnum'
import { ACTIVE_STAMP_MS, AGE_YEARS_PER_HOUR, OFFLINE_MIN_SECONDS, TICK_MS } from '@/data/constants'
import { buffDef } from '@/data/buffs'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useDongfuStore } from '@/stores/dongfu'
import { useCultivationStore } from '@/stores/cultivation'
import { useAdventureStore } from '@/stores/adventure'
import { useUiStore } from '@/stores/ui'
import { tickExploration, stopExploration } from './exploration'
import { settleOffline, sanitizeOfflineInputs } from './offline'
import { checkStateAchievements, rolloverDailyIfNeeded } from './progress'
import { mayTriggerEnlightenment, mayTriggerCaveEvent } from './earlyGameService'
import { settleSuppressedRegions } from './suppress'
import { studyTick, seedLoreIfNeeded } from './loreService'
import { flushSaveWrites } from '@/utils/storage'
import { enginePaused, pauseElapsedMs, setEnginePaused } from './enginePause'
import { shiftEarlyGameWindows } from './earlyGameService'

const PERIODIC_CHECK_SEC = 30

class GameEngine {
  private timer: number | undefined
  private lastTickAt = 0
  private lastStampAt = 0
  private periodicAccum = 0
  private deathAnnounced = false

  start(): void {
    const now = Date.now()
    const game = useGameStore()
    try {
      sanitizeOfflineInputs()
      // 旧存档补种:把过去凭丹炉等级"能炼"的方子折算成掌握度(幂等)
      if (game.started) seedLoreIfNeeded()
      // 先翻日再结算离线:跨午夜归来时,离线收益记入"归来之日"的日课,
      // 而不是先攒进昨日 delta(可能顺手领走昨日未领奖励)再被 rollover 重置
      rolloverDailyIfNeeded()
      if (game.started && game.lastActiveAt > 0) {
        settleOffline(now)
      }
      // 离线结算只加寿元、不判生死:这里补一道死亡判定 —— 跨离线寿元耗尽当场拉闸,
      // 角色从此进入死亡态,不再推进
      if (game.started) {
        this.checkDeath()
        // 读档若是已死之身(大限处停机 / 离线跨寿元),必须重新亮出轮回入口:
        // ui.deathDialog 非持久化,不重开则低境界(无法手动转世)被软锁在原地
        if (usePlayerStore().dead) {
          this.deathAnnounced = true
          useUiStore().deathDialog = true
        }
      }
      // 加载即补扫成就:老档/导入档纵使从未 track 过,已满足的成就当场解锁
      if (game.started) checkStateAchievements()
    } catch (err) {
      console.error('[引擎] 离线结算异常', err)
    }
    game.stampActive(now)
    this.lastTickAt = now
    this.lastStampAt = now

    if (this.timer === undefined) {
      this.timer = window.setInterval(() => this.tickSafe(), TICK_MS)
    }
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('beforeunload', this.onUnload)
  }

  stop(): void {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer)
      this.timer = undefined
    }
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('beforeunload', this.onUnload)
  }

  private onVisibility = (): void => {
    const game = useGameStore()
    if (document.visibilityState === 'hidden') {
      if (!enginePaused.value) game.stampActive(Date.now())
      // 盖完时间戳再刷盘。storage 模块也监听了 visibilitychange,但它注册得更早,
      // 先跑完就轮到这里盖章,那一次盖章会留在待刷队列里没人写
      flushSaveWrites()
    } else {
      this.tickSafe()
    }
  }

  private onUnload = (): void => {
    useGameStore().stampActive(Date.now())
    flushSaveWrites()
  }

  private tickSafe(): void {
    try {
      this.tick()
    } catch (err) {
      console.error('[引擎] Tick 异常', err)
    }
  }

  private tick(): void {
    const game = useGameStore()
    const now = Date.now()
    if (enginePaused.value) {
      // 暂停期间只推平时间基准,不结算、不写档
      this.lastTickAt = now
      return
    }
    if (!game.started) {
      this.lastTickAt = now
      return
    }
    const dt = (now - this.lastTickAt) / 1000
    if (dt <= 0) return

    if (dt > OFFLINE_MIN_SECONDS) {
      // 长时间停摆(休眠/后台冻结):走离线结算。与 start 同理,先翻日再结算,
      // 冻结跨午夜恢复时离线收益归"归来之日"
      rolloverDailyIfNeeded()
      settleOffline(now)
      // 与 start 同:离线结算只加寿元、不判生死,这里补死亡判定
      this.checkDeath()
    } else {
      this.advance(dt, now)
    }
    this.lastTickAt = now

    if (now - this.lastStampAt >= ACTIVE_STAMP_MS) {
      game.addPlayTime((now - this.lastStampAt) / 1000)
      game.stampActive(now)
      this.lastStampAt = now
    }
  }

  private advance(dt: number, now: number): void {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const dongfu = useDongfuStore()
    const cultivation = useCultivationStore()

    if (!player.dead) {
      // 天时已并入 finalStats.mods(player store),修炼/灵气/战斗/掉落/渡劫全链路生效,
      // 这里不再手动乘 weatherCult/weatherQi,否则与 mods 中的天时重复叠加
      // 修为增长
      player.gainExp(mulN(gn(player.cultPerSec), dt))
      // 灵气恢复
      resources.setQi(resources.qi + player.qiRegenPerSec * dt, player.qiCapValue)
      // 建筑产出
      dongfu.produce(dt)
      // Buff 过期:先记下本次要过期的(否则 prune 后无从得知),到期即一次性提示,
      // 免得玩家人在别页(主页/历练/坊市)时修速无声回落、还找不到原因
      const expiring = cultivation.buffs.filter(b => b.endsAt <= now)
      if (expiring.length > 0) {
        cultivation.pruneBuffs(now)
        const names = expiring.map(b => buffDef(b.defId)?.name).filter((n): n is string => n !== undefined)
        if (names.length > 0) useUiStore().toast(`「${names.join('、')}」已到期`, 'info')
      } else {
        cultivation.pruneBuffs(now)
      }
      // 历练推进
      tickExploration(now)
      // Phase 28: 悟道顿悟触发(修炼时随机)
      mayTriggerEnlightenment()
      // Phase 30: 镇压区域被动收益
      settleSuppressedRegions(dt)
      // Phase 32.3: 藏经阁日夜翻检,学问自己在长
      studyTick(dt)
      // 寿元流逝
      player.addAge((dt / 3600) * AGE_YEARS_PER_HOUR)
      this.checkDeath()
    }

    this.periodicAccum += dt
    if (this.periodicAccum >= PERIODIC_CHECK_SEC) {
      this.periodicAccum = 0
      rolloverDailyIfNeeded()
      checkStateAchievements()
      // Phase 28/29: 洞府巡游触发(每日一次)
      mayTriggerCaveEvent()
    }
  }

  private checkDeath(): void {
    const player = usePlayerStore()
    const adventure = useAdventureStore()
    const ui = useUiStore()
    if (player.dead || player.age < player.lifespanMax) {
      return
    }
    player.markDead()
    if (adventure.session) stopExploration('manual')
    if (!this.deathAnnounced) {
      this.deathAnnounced = true
      ui.deathDialog = true
      ui.toast('油尽灯枯,大限已至……', 'warn')
    }
  }

  /** 转世后复位死亡提示 */
  resetDeathFlag(): void {
    this.deathAnnounced = false
  }

  /** 暂停心跳(如重置确认弹窗期间):不结算、不写档;入停前记录一次活跃时刻 */
  pause(): void {
    if (enginePaused.value) return
    useGameStore().stampActive(Date.now())
    setEnginePaused(true)
  }

  /**
   * 恢复心跳,并把暂停这段时长补回所有按墙钟到期的状态。
   *
   * 只停心跳不够:Buff、卦、区域事件、突破准备、历练窗口都拿 `Date.now()`
   * 判到期,暂停五分钟就会「在确认窗背后」自己过期。补回后与 `gameNow()`
   * 的冻结语义一致 —— 暂停的那段时间不算进游戏时间。
   */
  resume(): void {
    if (!enginePaused.value) return
    const now = Date.now()
    const pausedMs = pauseElapsedMs(now)
    if (pausedMs > 0) {
      useCultivationStore().shiftBuffEnds(pausedMs)
      usePlayerStore().shiftTimedState(pausedMs)
      useAdventureStore().shiftTimedState(pausedMs)
      shiftEarlyGameWindows(pausedMs)
    }
    this.lastTickAt = now
    this.lastStampAt = now
    useGameStore().stampActive(now)
    setEnginePaused(false)
  }
}

export const engine = new GameEngine()
