import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  artifactSlotReplacedToast,
  decomposeEmptyToast,
  loadoutApplyToast,
  loadoutFullToast,
  loadoutSavedToast,
  smartCleanToast
} from './inventoryText'

describe('行囊提示 · 文言仍报清件数与尘石', () => {
  it('法宝位、化尘、收纳不说分解替换', () => {
    expect(artifactSlotReplacedToast()).toContain('祭炼')
    expect(artifactSlotReplacedToast()).not.toContain('替换')
    expect(decomposeEmptyToast()).toContain('化尘')
    expect(decomposeEmptyToast()).not.toContain('分解')
    expect(smartCleanToast(0, '器灵尘×1')).toContain('有缘')
    expect(smartCleanToast(3, '器灵尘×9')).toBe('收纳既毕,3 件无缘之物化尘,器灵尘×9')
  })

  it('构筑满套、存入、换上仍报套数与阙件', () => {
    expect(loadoutFullToast(5)).toContain('5 套')
    expect(loadoutSavedToast('杀伐')).toContain('「杀伐」')
    expect(loadoutApplyToast('杀伐', 0, [])).toBe('已换上「杀伐」')
    // 阙件有名有姓:说不清是哪几件时,至少还把个数带上
    expect(loadoutApplyToast('杀伐', 2, ['灵鹤诀', '清霜剑'])).toBe('已换上「杀伐」,阙 2 件:灵鹤诀、清霜剑')
    expect(loadoutApplyToast('杀伐', 2, [])).toBe('已换上「杀伐」,阙 2 件')
    expect(loadoutApplyToast('杀伐', 2, ['灵鹤诀'])).not.toContain('切换')
  })
})

describe('行囊页与提示同源', () => {
  it('法宝位、化尘空、收纳走 inventoryText', () => {
    const view = readFileSync(new URL('../views/InventoryView.vue', import.meta.url), 'utf8')
    expect(view).toContain('artifactSlotReplacedToast()')
    expect(view).toContain('decomposeEmptyToast()')
    expect(view).toContain('smartCleanToast(')
    expect(view).not.toContain('无可分解之物')
    expect(view).not.toContain('法宝位已满')
  })
})
