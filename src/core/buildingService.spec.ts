/**
 * buildingUpgradeInfo 资源检查与列差:资源不足时 canUpgrade=false 且 reason 列差(BuildingCard 直接显示);
 * 资源充足时境界闸门/峰值/洞府辖限判定不变。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { buildingBatchPlan, buildingShortfall, buildingUpgradeInfo, upgradeBuilding } from './buildingService'
import { buildingDef } from '@/data/buildings'
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
    // 不硬编码 costBase
    const info = buildingUpgradeInfo('array')
    expect(info.canUpgrade).toBe(false)
    expect(info.reason).toContain('尚差')
    expect(info.reason).toMatch(/\d/)
  })

  it('玄铁不足:canUpgrade=false,reason 列出尚差铁数', () => {
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
    expect(oreOnly.reason).toContain('玄铁尚差 2 块')
    expect(oreOnly.reason).not.toContain('灵石')
  })

  it('资源不足时单升拒因与卡面同源,不退回「灵石或玄铁」', () => {
    useDongfuStore().setLevel('array', 3)
    fund(10_000_000_000, 99999)
    const resources = useResourcesStore()
    // 制造 info 判定与扣款之间的余额变化:第二道闸仍须点名缺哪一样
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

/**
 * 连升计划与单级升级必须给出同一个「能不能建」。
 *
 * `buildingBatchPlan` 的注释写着「门槛/上限须与 buildingUpgradeInfo 同步」,
 * 但**没有任何判据** —— 两个函数各自写一遍境界闸 / 满级 / 洞府辖限三道门。
 * 分叉的后果是玩家看到一正一反:单级钮说「已圆满」而连升钮说「尚差灵石」,
 * 或者反过来(卡里明明能升,连升段却是灰的)。
 *
 * 判据用**行为对账**,不比源码 —— 比字符串只能证明写法像,不证明结论一致。
 * 逐一造出四道门各自触发的状态,看两边的 canUpgrade / blocked 是否同真同假。
 */
describe('建筑连升 · 门槛与单级升级同源', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fund(0)
  })

  /** 两边对「这一格现在能不能建」的结论 */
  function both(id: Parameters<typeof buildingUpgradeInfo>[0]): { single: boolean; batch: boolean } {
    return { single: buildingUpgradeInfo(id).canUpgrade, batch: buildingBatchPlan(id).blocked === null }
  }

  it('境界闸未开:两边都拦,且说同一句话', () => {
    // 洞府(mansion)门槛最高;把境界压到 0 保证未开
    usePlayerStore().major = 0
    fund(1e12, 9999)
    const info = buildingUpgradeInfo('mansion')
    if (!info.canUpgrade && /境/.test(info.reason)) {
      const plan = buildingBatchPlan('mansion')
      expect(plan.blocked, '单级拦下了、连升没拦').toBe(info.reason)
    }
  })

  it('已至满级:两边都说「已圆满」', () => {
    const dongfu = useDongfuStore()
    const def = buildingDef('array')!
    usePlayerStore().major = def.unlockRealm
    fund(1e12, 99999)
    dongfu.setLevel('array', def.maxLevel)
    expect(both('array').single, '满级后单级仍可建?').toBe(false)
    expect(both('array').batch, '满级后连升仍可建?').toBe(false)
    expect(buildingBatchPlan('array').blocked, '两边的满级说法不一致').toBe(buildingUpgradeInfo('array').reason)
    expect(buildingBatchPlan('array').atMax, '满级该标 atMax').toBe(true)
  })

  it('洞府辖限:两边都拦,且说同一句话', () => {
    const dongfu = useDongfuStore()
    const def = buildingDef('array')!
    usePlayerStore().major = def.unlockRealm
    fund(1e12, 99999)
    // 建到辖限之上一点(仍低于品类满级)
    const cap = dongfu.buildingLevelCap
    if (cap < def.maxLevel) {
      dongfu.setLevel('array', cap)
      expect(both('array').single).toBe(false)
      expect(both('array').batch).toBe(false)
      expect(buildingBatchPlan('array').blocked).toBe(buildingUpgradeInfo('array').reason)
    }
  })

  it('资源充足时两边都放行', () => {
    const def = buildingDef('array')!
    usePlayerStore().major = def.unlockRealm
    fund(1e12, 99999)
    useDongfuStore().setLevel('array', 0)
    const b = both('array')
    expect(b.single, '单级说不能建').toBe(true)
    expect(b.batch, '连升说不能建').toBe(true)
    expect(buildingBatchPlan('array').blocked).toBeNull()
  })

  it('资源不足时两边都拦,且列同一笔差额', () => {
    const def = buildingDef('array')!
    usePlayerStore().major = def.unlockRealm
    useDongfuStore().setLevel('array', 0)
    fund(0, 0)
    const info = buildingUpgradeInfo('array')
    const plan = buildingBatchPlan('array')
    expect(info.canUpgrade).toBe(false)
    expect(plan.blocked).not.toBeNull()
    expect(plan.blocked, '两边的缺料说法不一致').toBe(info.reason)
  })
})
