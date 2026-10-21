import { describe, expect, it } from 'vitest'
import {
  artifactBatchDoneToast,
  artifactCapToast,
  artifactDoneToast,
  artifactShortToast,
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
    // 缺哪一样就说哪一样:尘靠分解、石靠历练,指错方向只会再缺一次
    expect(upgradeShortToast('dust')).toContain('器灵尘')
    expect(upgradeShortToast('dust')).not.toContain('灵石')
    expect(upgradeShortToast('dust')).toContain('分解')
    expect(upgradeShortToast('stone')).toContain('灵石')
    expect(upgradeShortToast('stone')).not.toContain('器灵尘')
    expect(upgradeShortToast('stone')).toContain('历练')
    expect(upgradeShortToast('stone', { stone: '7', dust: 0 })).toContain('尚差 7')
    expect(upgradeShortToast('dust', { stone: '0', dust: 2 })).toContain('尚差 2')
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

  it('祭炼缺料分得清悟道点与灵石,提示不再两头都说', () => {
    expect(artifactShortToast('wudao')).toContain('悟道点')
    expect(artifactShortToast('wudao')).not.toContain('灵石')
    expect(artifactShortToast('wudao')).toContain('藏经阁')
    expect(artifactShortToast('stone')).toContain('灵石')
    expect(artifactShortToast('stone')).not.toContain('悟道点')
    expect(artifactShortToast('stone')).toContain('历练')
  })

  it('祭炼连升只报一次总况:重数、现重、悟道、石都在', () => {
    expect(artifactBatchDoneToast(3, 5, 32, '240')).toBe('连炼 3 重,已至第 5 重,共耗悟道×32 · 灵石 240')
  })
})
