/**
 * 引擎心跳 —— start/stop/dt 分支路由直测。
 *
 * 这是整个游戏推进所经的唯一主干(1s 心跳),此前没有任何直接单测 ——
 * double-start 会开出两个 interval、停止不净、暂停/未开始/离线边界误路由,
 * 全都静默过去。本组用例钉三件事:双开只开一个、停就净、dt 大/小/0 各走各的路。
 *
 * 实现要点:spy 掉 window.setInterval 并接管回调(不真计时,手动拨钟),用
 * vi.setSystemTime 控制 Date.now —— 这样 dt 的每个分支都能确定性地踩到。
 */
import { beforeEach, afterEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { engine } from './engine'
import { settleOffline } from './offline'
import type * as OfflineMod from './offline'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { TICK_MS, OFFLINE_MIN_SECONDS } from '@/data/constants'

// 把 settleOffline 换成可观测的 spy,断言「大 dt 走离线结算」;其余实现保持真实
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
    // node 测试环境没有 document/window —— 给引擎一个最小的桩(监听器只记不派发)
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
    // 接管 setInterval:记下回调、返回伪 id,不真排程 —— 由我们手动拨钟触发
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
    vi.setSystemTime(t0 + TICK_MS * 1000) // 有 dt,但未开始就不该动
    const gainExpSpy = vi.spyOn(usePlayerStore(), 'gainExp')
    capturedTick!()
    expect(gainExpSpy, '未开始不应推进').not.toHaveBeenCalled()
    expect(settle, '未开始不应离线结算').not.toHaveBeenCalled()
  })

  it('暂停(paused)的 tick 只推平时间基准,不结算', () => {
    const { t0, gainExpSpy } = startStarted()
    engine.pause()
    vi.setSystemTime(t0 + (OFFLINE_MIN_SECONDS + 60) * 1000) // 即便 dt 很大
    capturedTick!()
    expect(gainExpSpy, '暂停不应推进').not.toHaveBeenCalled()
    expect(settle, '暂停不应离线结算').not.toHaveBeenCalled()
  })

  it('dt=0 (同一拍)不结算、不推进', () => {
    const { t0, gainExpSpy } = startStarted()
    vi.setSystemTime(t0) // 时钟不动,dt = 0
    capturedTick!()
    expect(gainExpSpy, 'dt=0 不应推进').not.toHaveBeenCalled()
    expect(settle, 'dt=0 不应离线结算').not.toHaveBeenCalled()
  })

  it('小 dt → 走 advance(在线推进:玩家修为增长)', () => {
    const { t0, gainExpSpy } = startStarted()
    vi.setSystemTime(t0 + TICK_MS) // ≈1s(TICK_MS 已是毫秒),远小于离线阈值 120s
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
})
