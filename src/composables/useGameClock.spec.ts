/**
 * 游戏时钟的暂停守卫契约(useGameClock / gameClock)。
 *
 * 语义原型是 useNow 那条:心跳停着(重置 / 导入确认)时冻结读数。
 * 组合式只是生命周期薄壳(挂载起表、卸载收表),守卫全在命令式的
 * gameClock 里 —— 故这里直接钉 gameClock。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameClock } from './useGameClock'
import { setEnginePaused } from '@/core/enginePause'

describe('gameClock · 暂停冻结的游戏时钟', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {
      setInterval: (cb: () => void, ms: number) => setInterval(cb, ms) as unknown as number,
      clearInterval: (id: number) => clearInterval(id)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    // enginePause 是模块级单例:恢复心跳,别把暂停态漏给下一个用例
    setEnginePaused(false)
  })

  it('每 tick 调一次 cb', () => {
    const cb = vi.fn()
    const stop = gameClock(cb, 1000)
    vi.advanceTimersByTime(3500)
    expect(cb).toHaveBeenCalledTimes(3)
    stop()
  })

  it('心跳停着就冻结:cb 不跑;恢复后接着跑 —— 与 useNow 同一条口径', () => {
    const cb = vi.fn()
    const stop = gameClock(cb, 1000)
    vi.advanceTimersByTime(2000)
    expect(cb).toHaveBeenCalledTimes(2)
    setEnginePaused(true)
    vi.advanceTimersByTime(5000)
    expect(cb, '暂停期间一格都不该多跑').toHaveBeenCalledTimes(2)
    setEnginePaused(false)
    vi.advanceTimersByTime(2000)
    expect(cb, '恢复后照常走表').toHaveBeenCalledTimes(4)
    stop()
  })

  it('stop() 收表:收后不再跑', () => {
    const cb = vi.fn()
    const stop = gameClock(cb, 1000)
    vi.advanceTimersByTime(1000)
    stop()
    vi.advanceTimersByTime(5000)
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
