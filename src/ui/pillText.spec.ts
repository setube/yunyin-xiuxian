import { describe, expect, it } from 'vitest'
import { craftOkToast, craftShortToast, pillGoneToast, pillTakenToast } from './pillText'

describe('丹药提示 · 文言仍报清药力与枚数', () => {
  it('囊中无丹、入口化开,不说不足', () => {
    expect(pillGoneToast()).toBe('囊中无此丹')
    expect(pillGoneToast()).not.toContain('不足')
    expect(pillTakenToast('凝神丹', '药力化开,状态加身')).toBe('服下「凝神丹」,药力化开,状态加身')
  })

  it('开炉缺料与成丹枚数都说清', () => {
    expect(craftShortToast()).toContain('灵草')
    expect(craftShortToast()).toContain('灵石')
    expect(craftShortToast({ herb: 3 })).toBe('灵草尚差 3 株,难开此炉')
    expect(craftShortToast({ stone: '12' })).toBe('灵石尚差 12,难开此炉')
    expect(craftShortToast({ herb: 3, stone: '12' })).toBe('灵草尚差 3 株 · 灵石尚差 12,难开此炉')
    expect(craftOkToast('护心丹', false)).toBe('炉开丹成,得「护心丹」一枚')
    expect(craftOkToast('护心丹', true)).toBe('一炉双丹,「护心丹」品相极佳')
    expect(craftOkToast('护心丹', false)).not.toContain('×1')
  })
})
