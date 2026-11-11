/** 引擎心跳 start/stop/dt 路由直测:双开只开一个、停就净、dt 大/小/0 各走各的路 */
import { beforeEach, afterEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { engine } from './engine'
import { enginePaused, setEnginePaused } from './enginePause'
import { settleOffline } from './offline'
import type * as OfflineMod from './offline'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { useCultivationStore } from '@/stores/cultivation'
import { useAdventureStore } from '@/stores/adventure'
import { useUiStore } from '@/stores/ui'
import { TICK_MS, OFFLINE_MIN_SECONDS, ACTIVE_STAMP_MS } from '@/data/constants'

vi.mock('./offline', async importOriginal => {
  const actual = await importOriginal<typeof OfflineMod>()
  return { ...actual, settleOffline: vi.fn(() => null) }
})

const settle = vi.mocked(settleOffline)

describe('引擎心跳 · start/stop/dt 路由直测', () => {
  let capturedTick: (() => void) | null
  let setIntervalSpy: MockInstance
  let clearIntervalSpy: MockInstance

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    // node 环境无 document/window,给最小桩
    vi.stubGlobal('document', {
      addEventListener: vi.fn(() => {}),
      removeEventListener: vi.fn(() => {}),
      visibilityState: 'visible'
    })
    vi.stubGlobal('window', {
      addEventListener: vi.fn(() => {}),
      removeEventListener: vi.fn(() => {}),
      setInterval: () => 0,
      clearInterval: () => {}
    })
    capturedTick = null
    setIntervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((cb: () => void) => {
      capturedTick = cb
      return 1 as never
    })
    clearIntervalSpy = vi.spyOn(window, 'clearInterval').mockImplementation(() => {})
    settle.mockClear()
  })

  afterEach(() => {
    engine.stop()
    engine.resume() // 复位暂停与时间基准,防单例状态跨用例泄漏
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function startStarted(): { t0: number; gainExpSpy: MockInstance } {
    const game = useGameStore()
    game.started = true
    const t0 = Date.now()
    engine.start()
    return { t0, gainExpSpy: vi.spyOn(usePlayerStore(), 'gainExp') }
  }

  it('start() 连开两次只注册一个 interval(防双心跳)', () => {
    useGameStore().started = false
    engine.start()
    engine.start()
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it('stop() 清掉 interval(不再有排程中的 tick)', () => {
    useGameStore().started = false
    engine.start()
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    engine.stop()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('未开始(game.started=false)的 tick 不结算也不推进', () => {
    useGameStore().started = false
    const t0 = Date.now()
    engine.start()
    vi.setSystemTime(t0 + TICK_MS * 1000)
    const gainExpSpy = vi.spyOn(usePlayerStore(), 'gainExp')
    capturedTick!()
    expect(gainExpSpy, '未开始不应推进').not.toHaveBeenCalled()
    expect(settle, '未开始不应离线结算').not.toHaveBeenCalled()
  })

  it('暂停(paused)的 tick 只推平时间基准,不结算', () => {
    const { t0, gainExpSpy } = startStarted()
    engine.pause()
    vi.setSystemTime(t0 + (OFFLINE_MIN_SECONDS + 60) * 1000)
    capturedTick!()
    expect(gainExpSpy, '暂停不应推进').not.toHaveBeenCalled()
    expect(settle, '暂停不应离线结算').not.toHaveBeenCalled()
  })

  it('dt=0 (同一拍)不结算、不推进', () => {
    const { t0, gainExpSpy } = startStarted()
    vi.setSystemTime(t0)
    capturedTick!()
    expect(gainExpSpy, 'dt=0 不应推进').not.toHaveBeenCalled()
    expect(settle, 'dt=0 不应离线结算').not.toHaveBeenCalled()
  })

  it('时钟回拨后引擎要立刻恢复,而不是停摆到真实时间追平', () => {
    /*
     * `lastTickAt` 是上一拍的时刻。系统时钟往回拨之后它停在「未来」,
     * 于是 `dt <= 0` 每一拍都成立、`lastTickAt` 永不更新 ——
     * 引擎会一直停摆到真实时间追平那个未来时刻(回拨 5 分钟就停 5 分钟)。
     * `start()` 与 `offline` 早就有同一处理,`tick` 这一处先前漏了。
     */
    const { t0, gainExpSpy } = startStarted()

    // 先正常走一拍,把 lastTickAt 推到 t0 + TICK_MS
    vi.setSystemTime(t0 + TICK_MS)
    capturedTick!()
    gainExpSpy.mockClear()

    // 时钟往回拨 5 分钟:这一拍不该推进,但必须重锚
    vi.setSystemTime(t0 + TICK_MS - 300_000)
    capturedTick!()
    expect(gainExpSpy, '回拨那一拍不该推进(dt 为负)').not.toHaveBeenCalled()

    // 再走一拍(回拨后的下一秒):若未重锚,此刻 dt 仍是负的、不会推进
    vi.setSystemTime(t0 + TICK_MS - 300_000 + TICK_MS)
    capturedTick!()
    expect(gainExpSpy, '回拨后引擎没恢复 —— lastTickAt 停在未来时刻没被重锚').toHaveBeenCalled()
  })

  it('时钟回拨后活跃时长仍要累计 —— lastStampAt 也要重锚', () => {
    /*
     * `lastStampAt` 是上一次记游玩时长的时刻。回拨后它停在「未来」,
     * 于是 `now - lastStampAt` 恒为负、`>= ACTIVE_STAMP_MS` 永不成立 ——
     * **游玩时长不再累计**,`game.totalPlaySec` 停住。
     * 与 lastTickAt 是同一件事的两半:只重锚一个就只修好一半。
     */
    const { t0 } = startStarted()
    const game = useGameStore()
    const addPlayTimeSpy = vi.spyOn(game, 'addPlayTime')

    // 正常跑到一个盖章周期之后
    vi.setSystemTime(t0 + ACTIVE_STAMP_MS + TICK_MS)
    capturedTick!()
    expect(addPlayTimeSpy, '正常拍该记游玩时长').toHaveBeenCalled()
    addPlayTimeSpy.mockClear()

    // 时钟往回拨 5 分钟
    vi.setSystemTime(t0 + ACTIVE_STAMP_MS + TICK_MS - 300_000)
    capturedTick!()

    // 回拨后再走一个盖章周期:若 lastStampAt 未重锚,这里仍不会记
    vi.setSystemTime(t0 + ACTIVE_STAMP_MS + TICK_MS - 300_000 + ACTIVE_STAMP_MS + TICK_MS)
    capturedTick!()
    expect(addPlayTimeSpy, 'lastStampAt 停在未来时刻没被重锚 —— 游玩时长不再累计').toHaveBeenCalled()
  })

  it('小 dt → 走 advance(在线推进:玩家修为增长)', () => {
    const { t0, gainExpSpy } = startStarted()
    vi.setSystemTime(t0 + TICK_MS) // TICK_MS 已是毫秒,远小于离线阈值
    capturedTick!()
    expect(gainExpSpy, '在线 tick 应推进修为').toHaveBeenCalled()
    expect(settle, '小 dt 不该走离线结算').not.toHaveBeenCalled()
  })

  it('大 dt(≥ OFFLINE_MIN_SECONDS)→ 走离线结算,不前推', () => {
    const { t0, gainExpSpy } = startStarted()
    vi.setSystemTime(t0 + (OFFLINE_MIN_SECONDS + 5) * 1000)
    capturedTick!()
    expect(settle, '大 dt 应走离线结算').toHaveBeenCalled()
    expect(gainExpSpy, '大 dt 不再按单拍 advance 前推').not.toHaveBeenCalled()
  })

  it('暂停恢复:按墙钟到期的 Buff / 历练 / 卦 / 突破准备一并顺延暂停时长', () => {
    const cult = useCultivationStore()
    const adv = useAdventureStore()
    const player = usePlayerStore()
    const { t0 } = startStarted()

    cult.buffs = [{ defId: 'buff_juling', endsAt: t0 + 60_000, added: 60_000 }]
    adv.session = {
      regionId: 'qingyun',
      mode: 'normal',
      startedAt: t0,
      endsAt: t0 + 120_000,
      nextBattleAt: t0 + 30_000,
      wins: 0,
      losses: 0,
      events: 0,
      itemGain: 0,
      stoneGain: { m: 0, e: 0 },
      expGain: { m: 0, e: 0 }
    }
    player.setDivination({
      hexagram: '乾',
      upper: 'qian',
      lower: 'qian',
      changed: null,
      changing: 0,
      lines: [7, 8, 7, 8, 7, 8],
      changingAt: [],
      castAt: t0,
      expiresAt: t0 + 300_000
    })
    player.regionEvent = { regionId: 'qingyun', eventId: 'yaochao', endsAt: t0 + 900_000 }
    player.setBreakthroughPrep({ bonus: 0.08, readyAt: t0 + 180_000, kind: 'meditate' })

    engine.pause()
    vi.setSystemTime(t0 + 300_000)
    engine.resume()

    expect(cult.buffs[0]!.endsAt, '丹药不该在确认窗背后过期').toBe(t0 + 360_000)
    expect(adv.session!.endsAt, '历练不该在确认窗背后走完').toBe(t0 + 420_000)
    expect(adv.session!.nextBattleAt).toBe(t0 + 330_000)
    expect(player.divination?.expiresAt, '卦不该在确认窗背后散掉').toBe(t0 + 600_000)
    expect(player.regionEvent?.endsAt, '区域事件不该在确认窗背后翻篇').toBe(t0 + 1_200_000)
    expect(player.breakthroughPrep!.readyAt, '调息不该在确认窗背后变得过久').toBe(t0 + 480_000)
  })
})

/**
 * 未暂停时调用 `resume()` 什么也不该做。
 *
 * 调用点都在设置页的两个确认窗(重置 / 导入):关闭时无条件 `engine.resume()`。
 * 若玩家先点了「再想想」、弹窗又被别处关掉,`resume()` 会再跑一次 —— 那时引擎并没有暂停。
 *
 * 守卫去掉的后果不是「少顺延几毫秒 Buff」:`lastActiveAt` 会被重戳到当前时刻,
 * 而它是离线结算的起点 —— 重戳一段,下一次回归时这段离线收益就不算数了。
 * 变异扫描点名这条守卫没有判据盯着。
 */
describe('引擎 · 未暂停时 resume 是空操作', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    setEnginePaused(false)
  })

  afterEach(() => {
    setEnginePaused(false)
    vi.useRealTimers()
  })

  it('未暂停时调 resume:不重戳 lastActiveAt,也不动时间基准', () => {
    const game = useGameStore()
    const t0 = new Date(2026, 10, 8, 12, 0, 0).getTime()
    vi.setSystemTime(t0)
    game.stampActive(t0)
    const stamped = game.lastActiveAt

    // 挂机五分钟后再误调一次 resume
    vi.setSystemTime(t0 + 300_000)
    engine.resume()

    expect(enginePaused.value, '本来就没暂停,调完也不该变成暂停').toBe(false)
    expect(game.lastActiveAt, 'lastActiveAt 被重戳了 —— 这段离线收益会不算数').toBe(stamped)
  })

  it('未暂停时连调多次 resume 都无害', () => {
    const game = useGameStore()
    const t0 = new Date(2026, 10, 8, 12, 0, 0).getTime()
    vi.setSystemTime(t0)
    game.stampActive(t0)
    const stamped = game.lastActiveAt
    vi.setSystemTime(t0 + 60_000)
    for (let i = 0; i < 5; i += 1) engine.resume()
    expect(game.lastActiveAt, '连调五次也不该重戳').toBe(stamped)
  })

  it('真暂停过再 resume 才该重戳(与空操作形成对照)', () => {
    const game = useGameStore()
    const t0 = new Date(2026, 10, 8, 12, 0, 0).getTime()
    vi.setSystemTime(t0)
    game.stampActive(t0)
    const stamped = game.lastActiveAt
    engine.pause()
    vi.setSystemTime(t0 + 60_000)
    engine.resume()
    expect(game.lastActiveAt, '暂停后恢复该重戳').toBeGreaterThan(stamped)
  })
})

describe('引擎 · 死亡边界', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.stubGlobal('document', {
      addEventListener: vi.fn(() => {}),
      removeEventListener: vi.fn(() => {}),
      visibilityState: 'visible'
    })
    vi.stubGlobal('window', {
      addEventListener: vi.fn(() => {}),
      removeEventListener: vi.fn(() => {}),
      setInterval: () => 0,
      clearInterval: () => {}
    })
    vi.spyOn(window, 'setInterval').mockImplementation((cb: () => void) => {
      void cb
      return 1 as never
    })
    vi.spyOn(window, 'clearInterval').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('读档为已死之身时,start() 重新亮出轮回入口(防低境界软锁)', () => {
    const game = useGameStore()
    const player = usePlayerStore()
    const ui = useUiStore()
    game.started = true
    player.dead = true
    engine.start()
    // ui.deathDialog 不持久化,死者的 checkDeath 提前 return;start() 不重开则低境界软锁
    expect(ui.deathDialog, '读档已死应重新打开轮回入口').toBe(true)
  })
})
