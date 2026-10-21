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
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { buildingShortfall, buildingUpgradeInfo, upgradeBuilding } from './buildingService'
import { useResourcesStore } from '@/stores/resources'
import { usePlayerStore } from '@/stores/player'
import { useDongfuStore } from '@/stores/dongfu'
import { useUiStore } from '@/stores/ui'
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

  it('精确缺口只点名缺的那一样,并给出实际差额', () => {
    usePlayerStore().major = 1
    useDongfuStore().setLevel('array', 3)
    const need = buildingUpgradeInfo('array')
    fund(0, 99999)
    const stoneOnly = buildingShortfall(need.stone, need.ore)
    expect(stoneOnly.side).toBe('stone')
    expect(stoneOnly.stone).toEqual(need.stone)
    expect(stoneOnly.ore).toBe(0)
    expect(stoneOnly.reason).toContain('石')
    expect(stoneOnly.reason).not.toContain('玄铁')

    fund(10_000_000_000, Math.max(0, need.ore - 2))
    const oreOnly = buildingShortfall(need.stone, need.ore)
    expect(oreOnly.side).toBe('ore')
    expect(oreOnly.ore).toBe(2)
    expect(oreOnly.reason).toContain('玄铁 2 块')
    expect(oreOnly.reason).not.toContain('尚差')
  })

  it('资源不足时单升拒因与卡面同源,不退回「灵石或玄铁」', () => {
    useDongfuStore().setLevel('array', 3)
    fund(10_000_000_000, 99999)
    const resources = useResourcesStore()
    // 制造 info 判定与扣款之间的余额变化:第二道闸仍须点名缺哪一样。
    vi.spyOn(resources, 'hasStone').mockImplementation(() => {
      resources.spiritStone = gn(0)
      resources.ore = 0
      return false
    })
    expect(upgradeBuilding('array')).toBe(false)
    const toast = useUiStore().toasts.at(-1)
    expect(toast?.text).toContain('尚差')
    expect(toast?.text).toContain('玄铁')
    expect(toast?.text).not.toContain('或')
  })
})
