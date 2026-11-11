/** GameEngine 游戏心跳:推进均基于时间戳差值,切后台/休眠/关闭不丢进度 */
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
    // 启动分段:engine.start 里的离线结算与成就补扫是进页面那块长任务的主要来源
    performance.mark('boot:engineStart')
    try {
      sanitizeOfflineInputs()
      performance.mark('boot:offlineInputs')
      // 旧存档补种:丹炉等级"能炼"的方子折算成掌握度(幂等)
      if (game.started) seedLoreIfNeeded()
      // 先翻日再结算离线:跨午夜的离线收益记入"归来之日"的日课
      rolloverDailyIfNeeded()
      if (game.started && game.lastActiveAt > 0) {
        settleOffline(now)
      }
      performance.mark('boot:offlineSettled')
      // 离线结算只加寿元、不判生死,死亡判定在此补
      if (game.started) {
        this.checkDeath()
        // 已死存档须重开轮回入口:ui.deathDialog 不持久化,不重开则低境界软锁
        if (usePlayerStore().dead) {
          this.deathAnnounced = true
          useUiStore().deathDialog = true
        }
      }
      // 补扫成就:老档/导入档未 track 过的已满足成就当场解锁
      if (game.started) checkStateAchievements()
      performance.mark('boot:achievements')
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
      // 盖章后须自行刷盘:storage 的 visibilitychange 监听注册更早、先于此处跑完,这次盖章会留在待刷队列
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
      this.lastTickAt = now
      return
    }
    if (!game.started) {
      this.lastTickAt = now
      return
    }
    /*
     * 时钟回拨要**重锚**,不能直接 return。
     *
     * `lastTickAt` 是上一次 tick 的时刻;系统时钟往回拨之后,它会停在「未来」,
     * 于是 `dt <= 0` 每一拍都成立、`lastTickAt` 永不更新 ——
     * 引擎会一直停摆到真实时间追平那个未来时刻(回拨 5 分钟就停 5 分钟)。
     * `start()` 与 `offline` 都有同一处理(`lastActiveAt > now` 时重锚),
     * tick 这里先前漏了。
     */
    /*
     * 时钟回拨:两个基准都要重锚。
     *
     * `lastTickAt` 不重锚 → 引擎停摆到真实时间追平(前一处);
     * `lastStampAt` 不重锚 → `now - lastStampAt` 恒为负,
     * `>= ACTIVE_STAMP_MS` 永不成立,**游玩时长不再累计**(审查意见指出的)。
     * 两者是同一件事的两半,漏一个就只修好一半。
     */
    if (now < this.lastTickAt) this.lastTickAt = now
    if (now < this.lastStampAt) this.lastStampAt = now
    const dt = (now - this.lastTickAt) / 1000
    if (dt <= 0) return

    if (dt > OFFLINE_MIN_SECONDS) {
      // 长时间停摆(休眠/后台冻结)走离线结算;先翻日再结算,同 start
      rolloverDailyIfNeeded()
      settleOffline(now)
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
      // 天时已并入 finalStats.mods,此处再乘 weatherCult/weatherQi 会重复叠加
      player.gainExp(mulN(gn(player.cultPerSec), dt))
      resources.setQi(resources.qi + player.qiRegenPerSec * dt, player.qiCapValue)
      dongfu.produce(dt)
      // 到期 Buff 须在 prune 前记下,prune 后无从得知
      const expiring = cultivation.buffs.filter(b => b.endsAt <= now)
      if (expiring.length > 0) {
        cultivation.pruneBuffs(now)
        const names = expiring.map(b => buffDef(b.defId)?.name).filter((n): n is string => n !== undefined)
        if (names.length > 0) useUiStore().toast(`「${names.join('、')}」已到期`, 'info')
      } else {
        cultivation.pruneBuffs(now)
      }
      tickExploration(now)
      mayTriggerEnlightenment()
      settleSuppressedRegions(dt)
      studyTick(dt)
      player.addAge((dt / 3600) * AGE_YEARS_PER_HOUR)
      this.checkDeath()
    }

    this.periodicAccum += dt
    if (this.periodicAccum >= PERIODIC_CHECK_SEC) {
      this.periodicAccum = 0
      rolloverDailyIfNeeded()
      checkStateAchievements()
      // 洞府巡游(每日一次)
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
      ui.toast('大限已至', 'warn')
    }
  }

  /** 转世后复位死亡提示 */
  resetDeathFlag(): void {
    this.deathAnnounced = false
  }

  /** 暂停心跳(如重置确认弹窗期间):不结算、不写档 */
  pause(): void {
    if (enginePaused.value) return
    useGameStore().stampActive(Date.now())
    setEnginePaused(true)
  }

  /** 恢复心跳;暂停时长补回所有按墙钟到期的状态(Buff、卦、区域事件、突破准备、历练窗口),与 gameNow() 冻结语义一致 */
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
