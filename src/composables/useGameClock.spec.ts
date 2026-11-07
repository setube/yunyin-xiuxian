/**
 * 游戏时钟的暂停守卫:心跳停着(重置 / 导入确认)时冻结。
 * 守卫全在 gameClock;useGameClock 是它的生命周期薄壳,这里两层都钉。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
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
    // enginePause 是模块级单例,须复位
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


/**
 * `useGameClock` 薄壳只在组件 setup 里可用 —— 组件外调用它一声不响地什么都不做。
 *
 * 实测:在无 active instance 的上下文里调 useGameClock,推进 5 个心跳周期 cb 执行 0 次,
 * 且 Vue **连警告都不打**(onMounted 在非组件上下文被静默忽略)。
 * 也就是说误用不会报错、不会崩,只会让某个倒计时从此静止 —— 最难查的那类。
 * 故这里做两件事:钉住「组件外不启动」这个事实,并守住「调用点必须在组件或 composable 里」。
 */
describe('useGameClock 薄壳 · 只该在组件 setup 里用', () => {
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
    setEnginePaused(false)
  })

  it('组件外调用:不启动、不报错(误用会静默失效,故调用点须守着)', async () => {
    const { useGameClock } = await import('./useGameClock')
    const cb = vi.fn()
    useGameClock(cb, 1000)
    vi.advanceTimersByTime(5000)
    expect(cb, '组件外调用本就不会起表,这条是把事实钉住').not.toHaveBeenCalled()
  })

  it('调用点都在 .vue 组件或 composable 里(不在普通 core/store 模块里)', () => {
    const offenders: string[] = []
    let scanned = 0
    const walk = (dir: string): void => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, ent.name)
        if (ent.isDirectory()) {
          if (ent.name === 'composables' || ent.name === '__probe') continue
          walk(full)
        } else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.spec.ts')) {
          scanned += 1
          if (readFileSync(full, 'utf-8').includes('useGameClock(')) offenders.push(full)
        }
      }
    }
    walk('src')
    /*
     * 防空转:walk('src') 是**相对路径**,读的是测试进程的 cwd。
     * 若 cwd 不是仓库根,或者 src 结构变了导致一个 .ts 都没扫到,
     * offenders 天然为空,上面那条 toEqual([]) 便恒真 —— 它只证明了「什么都没看见」。
     * 实测 src 下有数百个 .ts,取 100 为下限,留足余量。
     */
    expect(scanned, '没扫到任何 .ts —— 判据没跑到东西').toBeGreaterThan(100)
    expect(offenders, `这些普通模块里调了 useGameClock,组件外它会静默不起表:\n${offenders.join('\n')}`).toEqual([])
  })
})
})
