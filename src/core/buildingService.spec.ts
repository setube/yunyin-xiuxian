/**
 * buildingUpgradeInfo —— 资源检查与「列差多少」(xian 仓纪律:付不起置灰+列差)。
 *
 * 过去 canUpgrade 只查境界/峰值/洞府辖限,灵石玄铁够不够不在此判定:
 * 升不起时按钮仍可点、点了才弹一句宽泛 toast。现补资源检查把欠账写进 reason,
 * BuildingCard 直接显示「尚差 X 石」,玩家不必点下去才被教训。
 *
 * 需求(TASK-228):资源不足时 canUpgrade=false 且 reason 明确列差;
 * 资源充足时不受影响(境界闸门/峰值/洞府辖限既有权重不变)。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { buildingUpgradeInfo } from './buildingService'
import { useResourcesStore } from '@/stores/resources'
import { usePlayerStore } from '@/stores/player'
import { gn } from '@/utils/gnum'

function fund(stone: number, ore = 0): void {
  const r = useResourcesStore()
  r.spiritStone = gn(stone)
  r.ore = ore
}

describe('buildingUpgradeInfo · 资源检查与列差', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    usePlayerStore().major = 1 // 炼气:一阶建筑境界门槛全开
    fund(0)
  })

  it('灵石不足:canUpgrade=false,reason 列出尚差石数', () => {
    // 起造聚灵阵(costBase 为常数,先断言「非零且列差」,不硬编码常数)
    const info = buildingUpgradeInfo('array')
    expect(info.canUpgrade).toBe(false)
    expect(info.reason).toContain('尚差')
    expect(info.reason).toMatch(/\d/)
  })

  it('玄铁不足:canUpgrade=false,reason 列出尚差铁数', () => {
    // 灵石给足、玄铁 0;只对该建筑有玄铁成本时断言
    fund(10_000_000_000, 0)
    const info = buildingUpgradeInfo('array')
    if (info.ore > 0) {
      expect(info.canUpgrade).toBe(false)
      expect(info.reason).toContain('铁')
    }
  })

  it('灵石玄铁都给足:canUpgrade=true(不被资源检查误拦)', () => {
    fund(10_000_000_000, 50)
    const info = buildingUpgradeInfo('array')
    expect(info.canUpgrade).toBe(true)
  })

  it('灵石玄铁双缺:reason 同时列石差与铁差', () => {
    fund(0, 0)
    const info = buildingUpgradeInfo('array')
    expect(info.canUpgrade).toBe(false)
    // 双缺时一句里既有石差也有铁差(用分隔符「 · 」粘连,两样都报)
    expect(info.reason).toContain('石')
    expect(info.reason).toContain('铁')
    expect(info.reason).toContain('·')
  })
})
