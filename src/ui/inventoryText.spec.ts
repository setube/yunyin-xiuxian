import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  artifactSlotReplacedToast,
  artifactToggleToast,
  decomposeEmptyToast,
  equipSlotLabel,
  loadoutApplyToast,
  loadoutFullToast,
  loadoutSavedToast,
  smartCleanToast
} from './inventoryText'

describe('行囊提示 · 只报结果,仍报清件数与尘石', () => {
  it('法宝位、化尘、收纳不说分解替换', () => {
    // 祭炼/收回都要有回执:按钮是同一颗,不回执就分不出点成哪一种
    expect(artifactToggleToast('神魔镜', true)).toBe('已随身「神魔镜」')
    // 「祭炼」在法宝面板里专指重数,携带另用「随身」—— 一个词不许同时指两个动作
    expect(artifactToggleToast('神魔镜', true), '携带的回执不该用「祭炼」').not.toContain('祭炼')
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

/**
 * 「祭炼」在法宝面板里专指重数(`祭炼 3/9 重`、「祭炼一重,被动与神通各强」)。
 * 原先携带按钮写「祭炼随身」、回执写「已祭炼」,同一屏里一个词指两个动作。
 * 故障注入:把按钮改回「祭炼随身」,本条红。
 */
describe('法宝面板 · 一个词不指两个动作', () => {
  const PANEL = readFileSync(new URL('../components/inventory/ArtifactPanel.vue', import.meta.url), 'utf8')

  it('携带写「随身」,「祭炼」只留给重数', () => {
    expect(PANEL, '按钮里还有「祭炼随身」').not.toContain('祭炼随身')
    expect(PANEL, '携带按钮应写「随身携带」').toContain('随身携带')
    expect(artifactToggleToast('神魔镜', true), '携带回执不该用「祭炼」').not.toContain('祭炼')
  })
})

/**
 * 装备槽卡的可访问名。
 *
 * 卡面上印着槽位名、戴着的那件(名字 + 强化数 + 自定标记)、以及有没有可换,
 * 而可访问名原先只有「武器」/「武器,可换」—— 读屏听不出这格是空的还是戴了什么。
 * 判据钉三件事:空槽说「未装备」、有件报件名、可换才报「可换」。
 */
describe('装备槽的可访问名', () => {
  const VIEW = readFileSync(new URL('../views/InventoryView.vue', import.meta.url), 'utf8')

  it('空槽说未装备,有件报件名', () => {
    expect(equipSlotLabel('武器', null, false)).toBe('武器 · 未装备')
    expect(equipSlotLabel('武器', '雾隐长剑', false)).toBe('武器 · 雾隐长剑')
    // 强化数与自定标记由调用方拼进第二参,本函数原样转发
    expect(equipSlotLabel('衣袍', '桃木簪 · +3 · 常用', false)).toBe('衣袍 · 桃木簪 · +3 · 常用')
  })

  it('只有真有可换件时才说「可换」', () => {
    expect(equipSlotLabel('武器', null, true)).toBe('武器 · 未装备 · 可换')
    expect(equipSlotLabel('武器', '雾隐长剑', true)).toBe('武器 · 雾隐长剑 · 可换')
    expect(equipSlotLabel('武器', '雾隐长剑', false)).not.toContain('可换')
  })

  it('背包页的槽卡读它,不再自己拼「槽名,可换」', () => {
    expect(VIEW, '槽卡该读算好的 label').toContain(':aria-label="row.label"')
    expect(VIEW, 'slotRows 该走 equipSlotLabel').toContain('equipSlotLabel(EQUIP_SLOT_NAMES[slot], equippedText, upgradeable)')
    // 阴性对照:旧写法(只拼槽名和可换)不许回来
    expect(VIEW).not.toMatch(/:aria-label="`\$\{row\.name\}\$\{row\.upgradeable \? ',可换' : ''\}`"/)
  })
})
