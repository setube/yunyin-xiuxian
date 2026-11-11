import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EQUIP_LEVEL_BONUS } from '@/data/constants'
import { formatPercent } from '@/utils/format'
import { affixRollHint, affixRollText, equipNextLevelText, powerCompareLabel } from './equipText'

describe('equipNextLevelText', () => {
  it('裸装第一级等于常数,已强化的再涨按当前倍率折', () => {
    expect(equipNextLevelText(0)).toContain(formatPercent(EQUIP_LEVEL_BONUS))
    const rel = EQUIP_LEVEL_BONUS / (1 + 5 * EQUIP_LEVEL_BONUS)
    expect(equipNextLevelText(5)).toContain(`基础属性 +${formatPercent(rel)}`)
    expect(rel).toBeLessThan(EQUIP_LEVEL_BONUS)
  })

  it('装备详情在强化前写出这一行,不手写 12%', () => {
    const src = readFileSync(resolve(__dirname, '../components/equipment/UpgradePanel.vue'), 'utf8')
    expect(src).toContain('equipNextLevelText(inst.level)')
    expect(src).not.toContain('基础属性 +12%')
  })
})

describe('affixRollText', () => {
  it('取实例上存的 roll,钳到 [0,1] 再报成整数百分数', () => {
    expect(affixRollText(0)).toBe('浮 0%')
    expect(affixRollText(0.84)).toBe('浮 84%')
    expect(affixRollText(1)).toBe('浮 100%')
    expect(affixRollText(1.5)).toBe('浮 100%')
    expect(affixRollText(-0.2)).toBe('浮 0%')
    expect(affixRollHint).toContain('0% 下限')
    expect(affixRollHint).toContain('100% 上限')
  })

  it('坏值不许印成「浮 NaN%」', () => {
    /*
     * `Math.max(0, Math.min(1, NaN))` 仍是 NaN —— 只靠钳制收不住(AGENTS.md 点过这个坑)。
     * 当前调用点都安全(`rng.next()` 恒 0~1、`rollMark` 已先夹一次),
     * 但这是公开导出,新调用点误传坏值就直接脏到界面上。
     */
    expect(affixRollText(Number.NaN)).toBe('浮 0%')
    expect(affixRollText(Number.POSITIVE_INFINITY)).toBe('浮 0%')
    expect(affixRollText(Number.NEGATIVE_INFINITY)).toBe('浮 0%')
  })

  /**
   * 详情页按词条行渲染浮动与悬停说明,不手抄「浮」字与「%」。
   *
   * 读数格式只在一处写:掷值形制(ui/rollMark)管档位,「浮 N%」仍归这里 ——
   * 形制读 `affixRollText`,详情读形制给出的 label,两边都不手抄。
   */
  it('详情页按词条行渲染浮动与悬停说明,不手抄「浮」字与「%"', () => {
    const src = readFileSync(resolve(__dirname, '../components/equipment/EquipmentDetailDialog.vue'), 'utf8')
    const rollMarkSrc = readFileSync(resolve(__dirname, 'rollMark.ts'), 'utf8')
    expect(rollMarkSrc, '掷值形制应复用同一份读数格式').toContain('affixRollText(')
    expect(src, '详情应读形制给出的读法').toContain('line.rollGrade.label')
    expect(src).toContain('affixRollHint')
    // 只看代码:注释里可以举「浮 95%」当例子,手抄进模板才算违规
    const code = src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code, '模板不该手抄「浮 N%」').not.toMatch(/浮\s+\d+%/)
    expect(rollMarkSrc, '形制层也不该手抄「浮 N%」').not.toMatch(/`浮 \$\{/)
  })
})

describe('powerCompareLabel', () => {
  it('起名不冒充面板「战力"', () => {
    expect(powerCompareLabel()).toBe('战斗价值')
    expect(powerCompareLabel()).not.toBe('战力')
  })

  it('详情页用函数取名,不在模板里手写', () => {
    const src = readFileSync(resolve(__dirname, '../components/equipment/EquipmentDetailDialog.vue'), 'utf8')
    // 注释里会提到「战斗价值对比」,判据只看代码
    const code = src
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(src).toContain('powerCompareLabel()')
    expect(src).toContain('v-if="powerCompare"')
    expect(code).not.toContain('战斗价值')
  })
})
