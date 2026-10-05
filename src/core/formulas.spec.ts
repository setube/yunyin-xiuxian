import { describe, expect, it } from 'vitest'
import { gte, gn, lt, ratio, toNum } from '@/utils/gnum'
import {
  POWER_WEIGHTS,
  baseCombatStats,
  baseCultPerSec,
  breakthroughBaseRate,
  buildingCost,
  expRequirement,
  powerScale,
  powerScore,
  stoneByTier,
  tribulationWaveDamage,
  winChanceFromRatio
} from './formulas'
import { powerExplainText } from '@/ui/statNames'

describe('GameFormula 成长曲线', () => {
  it('战力：算式 = 攻×3 + 防×2 + 血×0.15，权重与释义同源，不许改一处漏一处', () => {
    const a = gn(10)
    const d = gn(20)
    const h = gn(100)
    const got = toNum(powerScore(a, d, h))
    const want = 10 * POWER_WEIGHTS.attack + 20 * POWER_WEIGHTS.defense + 100 * POWER_WEIGHTS.hp
    expect(got).toBeCloseTo(want, 6)
    // 人物页那句释义必须真的来自同一份权重
    expect(powerExplainText()).toBe(`攻×${POWER_WEIGHTS.attack} + 防×${POWER_WEIGHTS.defense} + 血×${POWER_WEIGHTS.hp}`)
  })
  it('突破需求单调递增', () => {
    const a = expRequirement(0, 0)
    const b = expRequirement(0, 5)
    const c = expRequirement(1, 0)
    const d = expRequirement(5, 9)
    expect(lt(a, b)).toBe(true)
    expect(lt(b, c)).toBe(true)
    expect(lt(c, d)).toBe(true)
  })

  it('炼气一层需求可在数十秒内达成(首破节奏)', () => {
    const req = toNum(expRequirement(0, 0))
    const speed = baseCultPerSec(0, 0)
    expect(req / speed).toBeLessThan(60)
  })

  it('战斗基础属性随境界增长', () => {
    const low = baseCombatStats(0, 0)
    const high = baseCombatStats(3, 5)
    expect(gte(high.attack, low.attack)).toBe(true)
    expect(ratio(high.maxHp, low.maxHp)).toBeGreaterThan(30)
  })

  it('powerScale 与区域层级同向增长', () => {
    expect(ratio(powerScale(10), powerScale(1))).toBeGreaterThan(50)
    expect(ratio(powerScale(20), powerScale(10))).toBeGreaterThan(50)
  })

  it('突破成功率在钳制范围内', () => {
    for (let m = 0; m < 10; m += 1) {
      for (let s = 0; s < 10; s += 1) {
        const r = breakthroughBaseRate(m, s)
        expect(r).toBeGreaterThanOrEqual(0.15)
        expect(r).toBeLessThanOrEqual(0.98)
      }
    }
  })

  it('大境界突破比小层突破更难', () => {
    expect(breakthroughBaseRate(3, 9)).toBeLessThan(breakthroughBaseRate(3, 2))
  })

  it('胜率曲线:战力占优则胜率高', () => {
    expect(winChanceFromRatio(2)).toBeGreaterThan(0.85)
    expect(winChanceFromRatio(1)).toBeGreaterThan(0.5)
    expect(winChanceFromRatio(0.4)).toBeLessThan(0.2)
    expect(winChanceFromRatio(0)).toBe(0.05)
  })

  it('天劫伤害随波次与境界上升,御劫词条减伤', () => {
    expect(tribulationWaveDamage(3, 5, 0)).toBeGreaterThan(tribulationWaveDamage(3, 1, 0))
    expect(tribulationWaveDamage(3, 5, 0.5)).toBeLessThan(tribulationWaveDamage(3, 5, 0))
  })

  it('灵石与建筑成本为正且递增', () => {
    expect(toNum(stoneByTier(5, 10))).toBeGreaterThan(toNum(stoneByTier(1, 10)))
    expect(toNum(buildingCost(100, 3))).toBeGreaterThan(toNum(buildingCost(100, 0)))
  })
})
