/**
 * GameEngine —— 游戏心跳
 * 所有推进均基于时间戳差值,切后台/休眠/关闭均不丢进度
 */
import { gn, mulN } from '@/utils/gnum'
import { ACTIVE_STAMP_MS, AGE_YEARS_PER_HOUR, OFFLINE_MIN_SECONDS, TICK_MS } from '@/data/constants'
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
import { todayWeather } from './weather'

const PERIODIC_CHECK_SEC = 30

class GameEngine {
  private timer: number | undefined
  private lastTickAt = 0
  private lastStampAt = 0
  private periodicAccum = 0
  private deathAnnounced = false
  private paused = false

  start(): void {
    const now = Date.now()
    const game = useGameStore()
    try {
      sanitizeOfflineInputs()
      if (game.started && game.lastActiveAt > 0) {
        settleOffline(now)
      }
    } catch (err) {
      console.error('[引擎] 离线结算异常', err)
    }
    game.stampActive(now)
    this.lastTickAt = now
    this.lastStampAt = now
    rolloverDailyIfNeeded()

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
      if (!this.paused) game.stampActive(Date.now())
    } else {
      this.tickSafe()
    }
  }

  private onUnload = (): void => {
    useGameStore().stampActive(Date.now())
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
    if (this.paused) {
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
      // 长时间停摆(休眠/后台冻结):走离线结算
      settleOffline(now)
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
      // Phase 31 A1:天时环境(当天天时,确定性)
      const weather = todayWeather()
      const weatherCult = 1 + (weather.mods.cultivationSpeed ?? 0)
      const weatherQi = 1 + (weather.mods.qiRegen ?? 0)
      // 修为增长(天时修正)
      player.gainExp(mulN(gn(player.cultPerSec), dt * weatherCult))
      // 灵气恢复(天时修正)
      resources.setQi(resources.qi + player.qiRegenPerSec * weatherQi * dt, player.qiCapValue)
      // 建筑产出
      dongfu.produce(dt)
      // Buff 过期
      cultivation.pruneBuffs(now)
      // 探索推进
      tickExploration(now)
      // Phase 28: 悟道顿悟触发(修炼时随机)
      mayTriggerEnlightenment()
      // Phase 30: 镇压区域被动收益
      settleSuppressedRegions(dt)
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
    useGameStore().stampActive(Date.now())
    this.paused = true
  }

  resume(): void {
    const now = Date.now()
    this.lastTickAt = now
    this.lastStampAt = now
    useGameStore().stampActive(now)
    this.paused = false
  }
}

export const engine = new GameEngine()
