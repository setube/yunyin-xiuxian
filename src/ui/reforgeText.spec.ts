import { describe, expect, it } from 'vitest'
import { gn, gnZero } from '@/utils/gnum'
import {
  reforgeDoneToast,
  reforgeEmptyToast,
  reforgeGapText,
  reforgeShortToast,
  sealDoneToast,
  sealMustLeaveToast,
  sealShortToast,
  unsealDoneToast
} from './reforgeText'

describe('重铸与封存提示 · 只报结果,仍报清条数与尘石', () => {
  it('缺料、成铸、封存只报结果与差额', () => {
    expect(reforgeEmptyToast()).toBe('无可重铸词条')
    // 缺哪样只说哪样
    expect(reforgeShortToast('stone')).toContain('灵石')
    expect(reforgeShortToast('stone')).not.toContain('器灵尘')
    expect(reforgeShortToast('dust')).toContain('器灵尘')
    expect(reforgeShortToast('dust')).not.toContain('灵石')
    // 只报差额,不附来处
    expect(reforgeShortToast('stone')).not.toContain('历练')
    expect(reforgeShortToast('dust')).not.toContain('分解')
    expect(reforgeShortToast('stone', { stone: '7', dust: 0 })).toBe('灵石尚差 7')
    expect(reforgeShortToast('dust', { stone: '0', dust: 2 })).toBe('器灵尘尚差 2')
    // 无差额时与全仓同词:「X不足」
    expect(reforgeShortToast('stone')).toBe('灵石不足')
    expect(reforgeShortToast('dust')).toBe('器灵尘不足')
    expect(reforgeDoneToast('2 → 4 条')).toBe('已重铸 · 词条 2 → 4 条')
    expect(sealMustLeaveToast()).toBe('不可封存')
    expect(sealShortToast()).toBe('灵石不足')
    expect(sealShortToast('12')).toBe('灵石尚差 12')
    expect(sealDoneToast('破军')).toBe('「破军」已封存')
    expect(unsealDoneToast('破军')).toBe('「破军」已解封')
  })
})

/**
 * 重铸缺口句:灵石与器灵尘两样并列,缺哪样报哪样。
 *
 * 这两个句子原先在两个组件里各写一遍(AutoReforgePanel 与 EquipReforgeFooter),
 * 连 push 顺序都一样。`reforgeShortToast` 只管单样,并列这种得单独一个入口。
 */
describe('重铸缺料句 · 两样并列', () => {
  it('两样都缺时用「 · 」并列,顺序固定为灵石在前', () => {
    expect(reforgeGapText(gn(120), 7)).toBe('灵石尚差 120 · 器灵尘尚差 7')
  })

  it('只缺一样时只报那样', () => {
    expect(reforgeGapText(gn(120), 0)).toBe('灵石尚差 120')
    expect(reforgeGapText(gnZero(), 7)).toBe('器灵尘尚差 7')
  })

  it('两样都不缺时是空串(调用方据此不挂这一行)', () => {
    expect(reforgeGapText(gnZero(), 0)).toBe('')
  })
})
