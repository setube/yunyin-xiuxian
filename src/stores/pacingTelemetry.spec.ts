/**
 * 节奏遥测的公共写入与报告边界。
 *
 * 这条链路每次互动都会走,但它不是游戏进度:坏调用或坏档不该让互动本身抛错,
 * 也不该把密度报告写成一份看似有效、其实混着垃圾的读数。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePacingTelemetry, type InteractionEvent } from './pacingTelemetry'

const NOW = 1_700_000_000_000

describe('节奏遥测 · 公共写入与报告边界', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('record 只收非空字符串与已知 kind,坏调用不抛也不落盘', () => {
    const t = usePacingTelemetry()
    expect(() => {
      t.record('', 'modal', '空类型')
      t.record(7 as never, 'modal', '非字符串类型')
      t.record('cave_event', 'burst' as never, '野 kind')
      t.record('cave_event', 'modal', null as never)
      t.record('cave_event', 'modal', '   ')
    }).not.toThrow()
    expect(t.events).toEqual([])
  })

  it('坏表上的下一次 record 先剔垃圾再记录,不让坏条目继续留在存档里', () => {
    const t = usePacingTelemetry()
    t.$patch({
      events: [
        null,
        { type: 'old', kind: 'burst', label: '野 kind', at: NOW - 1000 },
        { type: 'old', kind: 'modal', label: '坏时刻', at: Number.NaN }
      ] as never
    })
    t.record('enlightenment', 'modal', '顿悟')
    expect(t.events).toEqual([{ type: 'enlightenment', kind: 'modal', label: '顿悟', at: NOW }])
  })

  it('buildReport 只按合法事件出数,坏条目/null 不抛也不冒充样本', () => {
    const t = usePacingTelemetry()
    t.$patch({
      events: [
        null,
        { type: 'ghost', kind: 'burst', label: '野 kind', at: NOW - 20_000 },
        { type: 'ghost', kind: 'modal', label: '坏时刻', at: Number.POSITIVE_INFINITY },
        { type: 'a', kind: 'modal', label: '甲', at: NOW - 30_000 },
        { type: 'b', kind: 'notify', label: '乙', at: NOW - 20_000 },
        { type: 'c', kind: 'ambient', label: '丙', at: NOW - 10_000 }
      ] as never
    })
    const report = t.buildReport()
    expect(report).not.toBeNull()
    expect(report!.total).toBe(3)
    expect(report!.byKind).toEqual({ modal: 1, notify: 1, ambient: 1 })
    expect(report!.minInterval).toBe(10_000)
  })

  it('burstCount 数「连弹簇」而不是相邻对数,maxConsecutive 数簇内弹窗数', () => {
    const t = usePacingTelemetry()
    const events: InteractionEvent[] = [
      { type: 'a', kind: 'modal', label: '甲', at: NOW - 300_000 },
      { type: 'b', kind: 'modal', label: '乙', at: NOW - 290_000 },
      { type: 'c', kind: 'modal', label: '丙', at: NOW - 280_000 },
      { type: 'd', kind: 'modal', label: '丁', at: NOW - 120_000 },
      { type: 'e', kind: 'modal', label: '戊', at: NOW - 100_000 }
    ]
    t.$patch({ events })
    const report = t.buildReport()!
    expect(report.burstCount, '三连是第一簇、两连是第二簇').toBe(2)
    expect(report.maxConsecutive, '最长一簇有三次弹窗').toBe(3)
  })

  it('events 被写成 null 时报告返回 null,而不是抛在调用方', () => {
    const t = usePacingTelemetry()
    t.$patch({ events: null as never })
    expect(() => t.buildReport()).not.toThrow()
    expect(t.buildReport()).toBeNull()
  })
})
