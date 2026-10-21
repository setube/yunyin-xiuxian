import { describe, expect, it } from 'vitest'
import {
  reforgeDoneToast,
  reforgeEmptyToast,
  reforgeSealedNote,
  reforgeShortToast,
  sealDoneToast,
  sealMustLeaveToast,
  sealShortToast,
  unsealDoneToast
} from './reforgeText'

describe('重铸与封存提示 · 文言仍报清条数与尘石', () => {
  it('缺料、成铸、封存不说不足', () => {
    expect(reforgeEmptyToast()).toContain('余地')
    // 缺哪一样就只说哪一样:两种料的去路相反,一句「或」会把玩家指得两头跑
    expect(reforgeShortToast('stone')).toContain('灵石')
    expect(reforgeShortToast('stone')).not.toContain('器灵尘')
    expect(reforgeShortToast('stone')).toContain('历练')
    expect(reforgeShortToast('dust')).toContain('器灵尘')
    expect(reforgeShortToast('dust')).not.toContain('灵石')
    expect(reforgeShortToast('dust')).toContain('分解')
    expect(reforgeShortToast('stone', { stone: '7', dust: 0 })).toContain('灵石尚差 7')
    expect(reforgeShortToast('dust', { stone: '0', dust: 2 })).toContain('器灵尘尚差 2')
    expect(reforgeDoneToast('2 → 4 条', reforgeSealedNote(1))).toBe(
      '天机重铸,词条 2 → 4 条(封存 1 条未动)'
    )
    expect(sealMustLeaveToast()).toContain('天意')
    expect(sealShortToast()).not.toContain('不足')
    expect(sealShortToast('12')).toContain('灵石尚差 12')
    expect(sealDoneToast('破军')).toBe('「破军」已封存,重铸不移')
    expect(unsealDoneToast('破军')).toBe('「破军」已解封,重铸可再替')
  })
})
