/**
 * 可冻结倒计时读数与到期结算共用 `gameNow()`;读真实墙钟会先跑到 0、恢复后又跳回。
 *
 * 另一半是**共表**:全站只该有一枚 1 秒的表。地界卡是列表里逐张渲染的,
 * 每张各起一枚的话,同一次「现在」会被推进好几遍,每遍都触发一次自己的调度与渲染。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, type App, type RendererOptions } from 'vue'
import { gameNow, setEnginePaused } from '@/core/enginePause'

/** 最小渲染器:只够挂上一个返回 now 的组件 */
interface FakeNode {
  tag: string
  children: FakeNode[]
  parent: FakeNode | null
}
function makeNode(tag: string): FakeNode {
  return { tag, children: [], parent: null }
}
const nodeOps: RendererOptions<FakeNode, FakeNode> = {
  patchProp() {
    /* 无属性 */
  },
  insert(child, parent, anchor) {
    const siblings = child.parent?.children
    if (siblings) {
      const at = siblings.indexOf(child)
      if (at >= 0) siblings.splice(at, 1)
    }
    child.parent = parent
    const at = anchor ? parent.children.indexOf(anchor) : -1
    if (at >= 0) parent.children.splice(at, 0, child)
    else parent.children.push(child)
  },
  remove(child) {
    const siblings = child.parent?.children
    const at = siblings?.indexOf(child) ?? -1
    if (siblings && at >= 0) siblings.splice(at, 1)
    child.parent = null
  },
  createElement: makeNode,
  createText: () => makeNode('#text'),
  createComment: () => makeNode('#comment'),
  setText() {
    /* 无文本 */
  },
  setElementText() {
    /* 无文本 */
  },
  parentNode: node => node.parent,
  nextSibling(node) {
    const siblings = node.parent?.children ?? []
    return siblings[siblings.indexOf(node) + 1] ?? null
  },
  insertStaticContent(_content, parent, anchor) {
    const node = makeNode('#static')
    nodeOps.insert(node, parent, anchor)
    return [node, node]
  }
}
const { createApp } = createRenderer(nodeOps)

/** 订阅者:setup 里调一次 useNow,把读数挂到根节点上以便外部读取 */
let latest: (() => number) | null = null
const Probe = defineComponent({
  setup() {
    const now = useNow()
    latest = () => now.value
    return () => h('div')
  }
})

import { useNow } from './useNow'

const mounted: App<FakeNode>[] = []

function mount(): App<FakeNode> {
  const app = createApp(Probe)
  app.mount(makeNode('#root'))
  mounted.push(app)
  return app
}

describe('useNow · 读数随游戏时钟冻结且全站共表', () => {
  let intervals: number

  /**
   * 共表是模块级状态,跨用例活着。每个用例先挂一个探针再卸掉,把计数与表都归零 ——
   * 否则上个用例留下的表会让本用例「推进了却没走」,看着像实现坏了。
   * 注意模块级的 now 初值是**导入时的真墙钟**(早于 fake timers),故读数一律先 tick 再断言。
   */
  function resetModuleState(): void {
    const probe = mount()
    probe.unmount()
    mounted.splice(mounted.indexOf(probe), 1)
    intervals = 0
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    latest = null
    intervals = 0
    setEnginePaused(false)
    // 计数器包在真 setInterval 外面:同一次挂载起了几枚表,直接数
    const real = globalThis.setInterval.bind(globalThis)
    vi.stubGlobal('window', {
      setInterval: (cb: () => void, ms: number) => {
        intervals += 1
        return real(cb, ms) as unknown as number
      },
      clearInterval: (id: number) => globalThis.clearInterval(id)
    })
    resetModuleState()
  })

  afterEach(() => {
    for (const app of mounted.splice(0)) app.unmount()
    setEnginePaused(false)
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('多个订阅者共起一枚表,读数同一份', () => {
    mount()
    mount()
    mount()
    expect(intervals, '三个订阅者起了不止一枚表').toBe(1)
    // 三处读的是同一个 ref:推进一拍,读数走到结算那一把尺上
    vi.advanceTimersByTime(1000)
    expect(latest!()).toBe(gameNow())
    vi.advanceTimersByTime(1000)
    expect(latest!()).toBe(gameNow())
  })

  it('暂停时读数冻住,恢复后与 gameNow 同步', () => {
    mount()
    vi.advanceTimersByTime(1000)
    expect(latest!()).toBe(gameNow())

    setEnginePaused(true)
    const frozen = latest!()
    vi.advanceTimersByTime(10_000)
    expect(latest!(), '暂停时倒计时不该继续往下跑').toBe(frozen)

    setEnginePaused(false)
    vi.advanceTimersByTime(1000)
    expect(latest!()).toBe(gameNow())
  })

  it('最后一个订阅者卸载才收表;中途卸一个不收', () => {
    const a = mount()
    const b = mount()
    expect(intervals).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(latest!()).toBe(gameNow())

    a.unmount()
    mounted.splice(mounted.indexOf(a), 1)
    vi.advanceTimersByTime(3000)
    expect(latest!(), '还剩一个订阅者,表不该收').toBe(gameNow())

    b.unmount()
    mounted.splice(mounted.indexOf(b), 1)
    const after = latest!()
    vi.advanceTimersByTime(5000)
    expect(latest!(), '全卸完还留着表在空转').toBe(after)
  })

  it('卸载后再挂载会重新起表 —— 收表不是把秒表钉死', () => {
    const a = mount()
    a.unmount()
    mounted.splice(mounted.indexOf(a), 1)
    const reads = latest!()
    vi.advanceTimersByTime(2000)
    expect(latest!()).toBe(reads)

    mount()
    expect(intervals, '第二次挂载该再起一枚').toBe(2)
    vi.advanceTimersByTime(2000)
    expect(latest!()).toBe(gameNow())
  })
})
