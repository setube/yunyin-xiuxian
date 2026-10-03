/**
 * 灵脉连投 · 批量账
 * veinInvestPlan 只算不动手(点数受该脉上限、总容量与灵石共同约束),
 * investVeinBatch 按计划一口气注到位,扣费/点数与计划一致;
 * 一注都注不出(0 点计划)时绝不扣一分。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { gn, mulN, sub } from '@/utils/gnum'
import { investVeinBatch, veinInvestPlan, veinPointCost } from './veinService'
import { usePlayerStore } from '@/stores/player'
import { useDongfuStore } from '@/stores/dongfu'
import { useResourcesStore } from '@/stores/resources'
import { VEIN_MAIN_CAPACITY, VEIN_SIDE_CAP } from '@/data/constants'

const BUDGET = 1e9

function seat(main: 'gather' | 'craft' | null, points: Partial<Record<'gather' | 'craft' | 'alchemy' | 'insight', number>> = {}): void {
  usePlayerStore().major = 2 // 金丹,灵脉开放
  useDongfuStore().veinMain = main
  useDongfuStore().veinPoints = { gather: 0, craft: 0, alchemy: 0, insight: 0, ...points }
  useResourcesStore().spiritStone = gn(BUDGET)
}

describe('灵脉连投 · 批量账', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('计划只算不动手:主脉余 70,灵石管够时点数取满、总价=点数×单价、资源分文未动', () => {
    seat('gather')
    const t = veinInvestPlan('gather')
    expect(t.points).toBe(VEIN_MAIN_CAPACITY)
    expect(t.stone).toEqual(mulN(veinPointCost(), VEIN_MAIN_CAPACITY))
    expect(t.blocked).toBeNull()
    expect(useResourcesStore().spiritStone).toEqual(gn(BUDGET))
  })

  it('未定主脉时按主脉档算:首投即成主脉,一口气能注 70 点,不卡在 30', () => {
    seat(null)
    expect(veinInvestPlan('gather').points).toBe(VEIN_MAIN_CAPACITY)
  })

  it('副脉按 30 计,已投的点数占掉余量', () => {
    seat('gather', { craft: 5 })
    expect(veinInvestPlan('craft').points).toBe(VEIN_SIDE_CAP - 5)
  })

  it('总容量封顶:四脉全满 100 时记 full;匀出 1 点余量就只报 1 点', () => {
    seat('gather', { gather: VEIN_MAIN_CAPACITY, craft: VEIN_SIDE_CAP })
    expect(veinInvestPlan('craft')).toMatchObject({ points: 0, blocked: 'full' })
    // 主脉仍满 70、副脉挪出 1 点 → total=99,craft 还能且只能注 1 点
    seat('gather', { gather: VEIN_MAIN_CAPACITY, craft: VEIN_SIDE_CAP - 1 })
    expect(veinInvestPlan('craft')).toMatchObject({ points: 1 })
  })

  it('灵石封顶:只买得起三点的灵石,计划就只报三点', () => {
    seat('gather')
    useResourcesStore().spiritStone = mulN(veinPointCost(), 3)
    const t = veinInvestPlan('gather')
    expect(t.points).toBe(3)
    expect(t.stone).toEqual(mulN(veinPointCost(), 3))
  })

  it('一注都注不出:该脉圆满报 peak、灵石见底报 short', () => {
    seat('gather', { gather: VEIN_MAIN_CAPACITY })
    expect(veinInvestPlan('gather')).toMatchObject({ points: 0, blocked: 'peak' })
    seat('gather')
    useResourcesStore().spiritStone = gn(0)
    expect(veinInvestPlan('gather')).toMatchObject({ points: 0, blocked: 'short' })
  })

  it('连投按计划一次注到位:点数加上、扣费与计划一致、报实际点', () => {
    seat('gather', { gather: 10 })
    const plan = veinInvestPlan('gather')
    const n = investVeinBatch('gather')
    expect(n).toBe(plan.points)
    expect(useDongfuStore().veinPoints.gather).toBe(10 + plan.points)
    expect(useResourcesStore().spiritStone).toEqual(sub(gn(BUDGET), plan.stone))
  })

  it('一注都不成(灵石见底)时:返回 0,分文不扣、点数不动', () => {
    seat('gather')
    useResourcesStore().spiritStone = gn(0)
    const n = investVeinBatch('gather')
    expect(n).toBe(0)
    expect(useDongfuStore().veinPoints.gather).toBe(0)
    expect(useResourcesStore().spiritStone).toEqual(gn(0))
  })
})
