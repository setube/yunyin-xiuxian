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
    expect(reforgeShortToast()).toContain('器灵尘')
    expect(reforgeShortToast()).toContain('灵石')
    expect(reforgeShortToast()).not.toContain('不足')
    expect(reforgeDoneToast('2 → 4 条', reforgeSealedNote(1))).toBe(
      '天机重铸,词条 2 → 4 条(封存 1 条未动)'
    )
    expect(sealMustLeaveToast()).toContain('天意')
    expect(sealShortToast()).not.toContain('不足')
    expect(sealDoneToast('破军')).toBe('「破军」已封存,重铸不移')
    expect(unsealDoneToast('破军')).toBe('「破军」已解封,重铸可再替')
  })
})
