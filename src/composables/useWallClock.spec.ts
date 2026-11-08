/**
 * 墙钟契约:暂停引擎时照常走,与 useGameClock 相反。
 *
 * 两类东西分开钉:
 *  · `wallClock` 是命令式薄壳,每 tick 调一次 cb;
 *  · `useWallNow` 的默认档**共用一份读数与一枚表** —— 坊市页上悬赏投影与寄卖倒计时
 *    读的是同一把墙钟,各起一枚就是同一次 Date.now() 被推好几遍。
 *    非默认间隔仍各起各的(那是另一种节奏)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { wallClock, useWallNow } from './useWallClock'
import { setEnginePaused } from '@/core/enginePause'

describe('wallClock · 暂停时仍走墙钟', () => {
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

  it('每 tick 调一次 cb', () => {
    const cb = vi.fn()
    const stop = wallClock(cb, 1000)
    vi.advanceTimersByTime(3500)
    expect(cb).toHaveBeenCalledTimes(3)
    stop()
  })

  it('引擎暂停时照常推进 —— 与 useGameClock 的冻结形成对照', () => {
    const cb = vi.fn()
    const stop = wallClock(cb, 1000)
    setEnginePaused(true)
    vi.advanceTimersByTime(5000)
    expect(cb, '墙钟域不该被暂停守卫冻住').toHaveBeenCalledTimes(5)
    setEnginePaused(false)
    vi.advanceTimersByTime(1000)
    expect(cb).toHaveBeenCalledTimes(6)
    stop()
  })

  it('stop() 收表:收后不再跑', () => {
    const cb = vi.fn()
    const stop = wallClock(cb, 1000)
    vi.advanceTimersByTime(1000)
    stop()
    vi.advanceTimersByTime(5000)
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

/**
 * `useWallNow` 共表。与 `useNow` 同一套收法,但**不读 enginePaused** —— 暂停时照走。
 * 故障注入:把默认档改回每次各起一枚表,首条红。
 */
describe('useWallNow · 默认档共用一枚表', () => {
  let intervals: number

  interface FakeApp {
    unmount: () => void
  }
  const mounted: FakeApp[] = []

  /** 最小渲染器:只够挂上一个读墙钟的组件 */
  const makeRenderer = () => {
    // 复用 useNow.spec 的思路,但这里只需要「挂上/卸下」
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createRenderer } = require('vue') as typeof import('vue')
    interface FakeNode { tag: string; children: FakeNode[]; parent: FakeNode | null }
    const mk = (tag: string): FakeNode => ({ tag, children: [], parent: null })
    const nodeOps = {
      patchProp() {},
      insert(child: FakeNode, parent: FakeNode, anchor: FakeNode | null) {
        const sibs = child.parent?.children
        if (sibs) { const i = sibs.indexOf(child); if (i >= 0) sibs.splice(i, 1) }
        child.parent = parent
        const i = anchor ? parent.children.indexOf(anchor) : -1
        if (i >= 0) parent.children.splice(i, 0, child); else parent.children.push(child)
      },
      remove(child: FakeNode) {
        const sibs = child.parent?.children; const i = sibs?.indexOf(child) ?? -1
        if (sibs && i >= 0) sibs.splice(i, 1); child.parent = null
      },
      createElement: mk, createText: () => mk('#text'), createComment: () => mk('#comment'),
      setText() {}, setElementText() {},
      parentNode: (n: FakeNode) => n.parent,
      nextSibling(n: FakeNode) { const s = n.parent?.children ?? []; return s[s.indexOf(n) + 1] ?? null },
      insertStaticContent(_c: string, parent: FakeNode, anchor: FakeNode | null) {
        const n = mk('#static'); nodeOps.insert(n, parent, anchor); return [n, n] as const
      }
    }
    return createRenderer<FakeNode, FakeNode>(nodeOps as never)
  }

  let latest: (() => number) | null = null
  const Probe = { setup() { const n = useWallNow(); latest = () => n.value; return () => null } }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000)
    intervals = 0
    latest = null
    const real = globalThis.setInterval.bind(globalThis)
    vi.stubGlobal('window', {
      setInterval: (cb: () => void, ms: number) => { intervals += 1; return real(cb, ms) as unknown as number },
      clearInterval: (id: number) => globalThis.clearInterval(id)
    })
  })

  afterEach(() => {
    for (const a of mounted.splice(0)) a.unmount()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('两个订阅者共起一枚表,读数随墙钟推进', () => {
    const { createApp } = makeRenderer()
    const mk = () => {
      const app = createApp(Probe as never)
      // 假节点根
      app.mount({ tag: '#root', children: [], parent: null } as never)
      mounted.push(app as unknown as FakeApp)
      return app
    }
    mk(); mk()
    expect(intervals, '两个订阅者起了不止一枚表').toBe(1)
    vi.advanceTimersByTime(1000)
    expect(latest!()).toBe(Date.now())
  })
})
