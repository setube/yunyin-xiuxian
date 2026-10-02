import { describe, expect, it } from 'vitest'
import {
  artifactCapToast,
  artifactDoneToast,
  batchDecomposeToast,
  decomposeToast,
  salvageYieldText,
  upgradeBatchDoneToast,
  upgradeCapToast,
  upgradeDoneToast,
  upgradeShortToast
} from './forgeText'

describe('炼器提示 · 文言仍报清尘与石', () => {
  it('强化到顶、料不足、成功,三句各说一件事', () => {
    expect(upgradeCapToast()).toContain('锤炼之极')
    expect(upgradeCapToast()).not.toContain('上限')
    expect(upgradeShortToast()).toContain('器灵尘')
    expect(upgradeShortToast()).toContain('灵石')
    expect(upgradeDoneToast('玄铁剑', 3)).toBe('「玄铁剑」再经一锤,已至 +3')
  })

  it('连升只报一次总况:级数、现阶、尘、石都在', () => {
    expect(upgradeBatchDoneToast(3, 4, 60, '120')).toBe('连升 3 级,如今 +4,共耗器灵尘×60 · 灵石 120')
    expect(upgradeBatchDoneToast(1, 1, 10, '0')).toContain('连升 1 级')
  })

  it('分解单件与批量都报器灵尘,有石才提退还', () => {
    expect(decomposeToast(12)).toBe('此器化尘,得器灵尘×12')
    expect(decomposeToast(12, '1.2万', '八成')).toContain('灵石退还 1.2万(八成)')
    expect(salvageYieldText(4)).toBe('器灵尘×4')
    expect(batchDecomposeToast(3, salvageYieldText(9))).toBe('炉中化去 3 件,得器灵尘×9')
  })

  it('法宝祭炼不叫炼化', () => {
    expect(artifactCapToast()).toContain('再祭无益')
    expect(artifactDoneToast('紫电')).toContain('祭炼')
    expect(artifactDoneToast('紫电')).not.toContain('炼化')
  })
})
