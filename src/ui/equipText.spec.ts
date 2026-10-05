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
    expect(equipNextLevelText(5)).toContain(`此刻再涨 ${formatPercent(rel)}`)
    expect(rel).toBeLessThan(EQUIP_LEVEL_BONUS)
  })

  it('装备详情在强化前写出这一行,不手写 12%', () => {
    const src = readFileSync(resolve(__dirname, '../components/equipment/EquipmentDetailDialog.vue'), 'utf8')
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
    expect(affixRollHint.length).toBeGreaterThan(20)
  })

  it('详情页按词条行渲染浮动与悬停说明,不手抄「浮」字与「%"', () => {
    const src = readFileSync(resolve(__dirname, '../components/equipment/EquipmentDetailDialog.vue'), 'utf8')
    expect(src).toContain('affixRollText(line.roll)')
    expect(src).toContain('affixRollHint')
    expect(src).not.toMatch(/浮\s+\d+%/)
  })
})

describe('powerCompareLabel', () => {
  it('起名忠于一键换装的口径 —— 不冒充面板「战力"', () => {
    expect(powerCompareLabel()).toBe('战斗价值(一键口径)')
  })

  it('详情页用函数取名,并把「一键口径」写在名里,避免被抄成「战力"', () => {
    const src = readFileSync(resolve(__dirname, '../components/equipment/EquipmentDetailDialog.vue'), 'utf8')
    expect(src).toContain('powerCompareLabel()')
    expect(src).toContain('v-if="powerCompare"')
    expect(src).not.toContain('战斗价值(一键口径)')
  })
})
