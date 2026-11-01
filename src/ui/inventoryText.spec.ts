import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  artifactSlotReplacedToast,
  artifactToggleToast,
  decomposeEmptyToast,
  loadoutApplyToast,
  loadoutFullToast,
  loadoutSavedToast,
  smartCleanToast
} from './inventoryText'

describe('行囊提示 · 只报结果,仍报清件数与尘石', () => {
  it('法宝位、化尘、收纳不说分解替换', () => {
    // 祭炼/收回都要有回执:按钮是同一颗,不回执就分不出点成哪一种
    expect(artifactToggleToast('神魔镜', true)).toBe('已祭炼「神魔镜」')
    expect(artifactToggleToast('神魔镜', false)).toBe('已收回「神魔镜」')
    expect(artifactSlotReplacedToast()).toContain('祭炼')
    expect(artifactSlotReplacedToast()).not.toContain('替换')
    expect(artifactSlotReplacedToast(['墨玉葫芦'])).toBe('已替下「墨玉葫芦」')
    expect(decomposeEmptyToast()).toContain('化尘')
    expect(decomposeEmptyToast()).not.toContain('分解')
    // 清理行囊一件没化与一键分解落空同词
    expect(smartCleanToast(0, '器灵尘×1')).toBe(decomposeEmptyToast())
    expect(smartCleanToast(3, '器灵尘×9')).toBe('已化尘 3 件 · 得器灵尘×9')
  })

  it('构筑满套、存入、换上仍报套数与阙件', () => {
    expect(loadoutFullToast(5)).toContain('5 套')
    expect(loadoutFullToast(5), '与流派页按钮同一个状态词').toContain('快照已满')
    expect(loadoutFullToast(5), '只报状态,不教玩家下一步').not.toContain('先卸')
    expect(loadoutSavedToast('杀伐')).toContain('「杀伐」')
    expect(loadoutApplyToast('杀伐', 0, [])).toBe('已换上「杀伐」')
    expect(loadoutApplyToast('杀伐', 2, ['灵鹤诀', '清霜剑'])).toBe('已换上「杀伐」,阙 2 件:灵鹤诀、清霜剑')
    expect(loadoutApplyToast('杀伐', 2, [])).toBe('已换上「杀伐」,阙 2 件')
    expect(loadoutApplyToast('杀伐', 2, ['灵鹤诀'])).not.toContain('切换')
    // 槽位不够只标事实,不附建议
    expect(loadoutApplyToast('杀伐', 1, ['灵鹤诀'], true)).toBe('已换上「杀伐」,阙 1 件(槽位不足):灵鹤诀')
    expect(loadoutApplyToast('杀伐', 1, [], true)).toBe('已换上「杀伐」,阙 1 件(槽位不足)')
  })
})

describe('行囊页与提示同源', () => {
  it('法宝位、化尘空、收纳走 inventoryText', () => {
    // 法宝位替换提示在 components/inventory/ArtifactPanel.vue,化尘与收纳在 components/inventory/DismantleDialog.vue
    const view =
      readFileSync(new URL('../views/InventoryView.vue', import.meta.url), 'utf8') +
      readFileSync(new URL('../components/inventory/ArtifactPanel.vue', import.meta.url), 'utf8') +
      readFileSync(new URL('../components/inventory/DismantleDialog.vue', import.meta.url), 'utf8')
    expect(view).toContain('artifactSlotReplacedToast(')
    expect(view).toContain('decomposeEmptyToast()')
    expect(view).toContain('smartCleanToast(')
    expect(view).toContain("got.count > 0 ? 'success' : 'info'")
    expect(view).not.toContain('无可分解之物')
    expect(view).not.toContain('法宝位已满')
  })
})
