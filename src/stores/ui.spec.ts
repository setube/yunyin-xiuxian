import { describe, it, expect, beforeEach } from 'vitest'
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
})
