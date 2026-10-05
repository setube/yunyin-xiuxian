import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUiStore } from './ui'

describe('ui store · Toast', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('toast 落队列并自动生成 id', () => {
    const ui = useUiStore()
    ui.toast('第一条', 'info')
    ui.toast('第二条', 'rare')
    expect(ui.toasts).toHaveLength(2)
    expect(ui.toasts[1]!.kind).toBe('rare')
    expect(ui.toasts[0]!.id).not.toBe(ui.toasts[1]!.id)
  })

  it('手动关闭只撤走目标 toast,不影响其他', () => {
    const ui = useUiStore()
    ui.toast('甲')
    ui.toast('乙')
    ui.toast('丙')
    const target = ui.toasts[1]!.id
    ui.dismissToast(target)
    expect(ui.toasts.some(t => t.id === target)).toBe(false)
    expect(ui.toasts).toHaveLength(2)
  })

  it('toast 队列封顶,超出挤掉最旧', () => {
    const ui = useUiStore()
    for (let i = 0; i < 8; i += 1) ui.toast(`第${i}条`)
    expect(ui.toasts).toHaveLength(5)
  })

  it('关闭不存在的 id 静默无事', () => {
    const ui = useUiStore()
    ui.toast('唯一')
    ui.dismissToast(99999)
    expect(ui.toasts).toHaveLength(1)
  })

  it('同文案去重:连弹两条一模一样的只留一条,并刷新到队尾', () => {
    const ui = useUiStore()
    ui.toast('道源不足 10', 'warn')
    ui.toast('道源不足 10', 'warn')
    expect(ui.toasts).toHaveLength(1)
    expect(ui.toasts[0]!.text).toBe('道源不足 10')
    // 第三种更长的失败文案另起一条
    ui.toast('道源不足 100', 'warn')
    expect(ui.toasts).toHaveLength(2)
  })

  it('仅文案同、类别不同不算重复(正式与警示各留一条)', () => {
    const ui = useUiStore()
    ui.toast('结算完毕', 'info')
    ui.toast('结算完毕', 'rare')
    expect(ui.toasts).toHaveLength(2)
  })

  it('去重刷新后按新 TTL 存活:旧计时器不会提前收走刷新那条', () => {
    vi.useFakeTimers()
    try {
      const ui = useUiStore()
      ui.toast('提示', 'info') // ttl 2600ms,旧计时器将在 t=2600 触发
      vi.advanceTimersByTime(1000)
      ui.toast('提示', 'info') // 原位刷新,新 TTL 触点在 t=3600
      vi.advanceTimersByTime(600)
      expect(ui.toasts.some(t => t.text === '提示')).toBe(true)
      vi.advanceTimersByTime(1001) // t=2601:旧触点已过 —— 若旧计时器没撤,刷新那条就该被收走了
      expect(ui.toasts.some(t => t.text === '提示')).toBe(true)
      vi.advanceTimersByTime(999) // t=3600:新触点才到
      expect(ui.toasts.some(t => t.text === '提示')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('手动关闭与超时收起同路:点掉后计时器撤除,不再有空转回调', () => {
    vi.useFakeTimers()
    try {
      const ui = useUiStore()
      ui.toast('点掉我', 'info')
      const id = ui.toasts[0]!.id
      ui.dismissToast(id)
      vi.advanceTimersByTime(10_000) // 早过了原 TTL,队列不应有任何动静
      expect(ui.toasts).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
