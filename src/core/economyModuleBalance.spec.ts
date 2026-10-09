/**
 * 坊市 / 悬赏 / 收徒 三模块的经济校验(C2·C1)
 *
 * 不入 economySim.auditEra 的原因(见其文件头纪律「不许把没模型的地方算成健康
 * 或事故」):弟子的差事分配、等级曲线都是行为假设,硬折进那条
 * 调校过的 11 条不变式模型,会把「未建模」稀释成「已验证」。故另立本审计,只锁
 * 结构不变量,全部取自真实定价/生成函数:
 *
 *  ① 大一统无套利:全境界 购 > 悬赏 > 售 恒成立,且比值不随境界漂移(经济锚 1.9^tier
 *     两边抵消)——这是三模块共同的经济纪律,锁死它即锁死「买→交」空转灵石。
 *  ② 弟子材料不衰减(C1):悬赏把弟子固定产的灵草按 4.5/单位收走,价随境界等比放大,
 *     故「弟子材料 → 悬赏」的价值 ÷ 战斗灵石 恒为常数(不随境界衰减)。
 */
import { describe, expect, it } from 'vitest'
import { stoneByTier } from './formulas'
import { maxTierForMajor } from '@/data/regions'
import {
  MARKET_PILL_MARKUP,
  MARKET_MAT_STONE_UNITS,
  MARKET_EQUIP_STONE_BASE,
  MARKET_EQUIP_STONE_PER_RANK,
  MARKET_SELL_MAT_STONE_UNITS
} from '@/data/market'
import {
  BOUNTY_MAT_TARGET,
  BOUNTY_MAT_UNIT_AMOUNT,
  BOUNTY_PILL_REWARD_FACTOR,
  BOUNTY_EQUIP_STONE_BASE,
  BOUNTY_EQUIP_STONE_PER_RANK
} from '@/data/bounty'
import { pillSellPrice, consignPrice, herbSellPrice } from './marketService'
import { herbBountyReward } from './bountyService'
import { herbBuyPrice, HERB_GRADES } from '@/data/herbGrades'
import { PILLS } from '@/data/pills'

/** 该境界的代表层级(与 economySim 同:maxTierForMajor) */
const tierOf = (major: number): number => maxTierForMajor(major)

function toN(g: { m: number; e: number }): number {
  return g.m * Math.pow(10, g.e)
}

/** 全部 major 0..最大境界 */
const MAJORS = Array.from({ length: 21 }, (_, i) => i)

describe('三模块经济审计 · 无套利与弟子不衰减', () => {
  it('① 材料:购(6/单位) > 悬赏(4.5) > 售(3),且比值逐境界恒一', () => {
    for (const major of MAJORS) {
      const buyUnit = MARKET_MAT_STONE_UNITS
      const bountyUnit = BOUNTY_MAT_UNIT_AMOUNT
      const sellUnit = MARKET_SELL_MAT_STONE_UNITS
      expect(bountyUnit, `境 ${major} 悬赏必在购销之间`).toBeGreaterThan(sellUnit)
      expect(buyUnit).toBeGreaterThan(bountyUnit)
      // 比值与境界无关(3 / 4.5 / 6 是纯常数,不随 1.9^tier 变)
    }
    expect(BOUNTY_MAT_UNIT_AMOUNT / MARKET_SELL_MAT_STONE_UNITS).toBeCloseTo(1.5, 5)
    expect(MARKET_MAT_STONE_UNITS / BOUNTY_MAT_UNIT_AMOUNT).toBeCloseTo(4 / 3, 5)
  })

  it('① 丹药:购(×2.5) > 悬赏(×1.8+悟道) > 售(×1.2)', () => {
    for (const major of MAJORS) {
      for (const p of PILLS.filter(x => x.recipe?.stoneBase != null && x.minRealm <= major)) {
        const buy = MARKET_PILL_MARKUP * p.recipe!.stoneBase
        const bounty = BOUNTY_PILL_REWARD_FACTOR * p.recipe!.stoneBase
        const sell = toN(pillSellPrice(p.id)) / p.recipe!.stoneBase
        expect(bounty, `${p.id} 悬赏>售`).toBeGreaterThan(sell)
        expect(buy, `${p.id} 购>悬赏`).toBeGreaterThan(bounty)
        expect(sell, `${p.id} 售=×1.2`).toBeCloseTo(1.2, 5)
      }
    }
  })

  it('① 装备:购(60+30r) > 悬赏(35+14r+器尘) > 摆摊(25+12r);无买→交空转', () => {
    for (const major of MAJORS) {
      const tier = tierOf(major)
      for (const rank of [0, 1, 2, 3, 4, 5]) {
        const buy = stoneByTier(tier, MARKET_EQUIP_STONE_BASE + rank * MARKET_EQUIP_STONE_PER_RANK)
        const bounty = stoneByTier(tier, BOUNTY_EQUIP_STONE_BASE + rank * BOUNTY_EQUIP_STONE_PER_RANK)
        const consign = consignPrice(tier, rank)
        // 悬赏 > 摆摊(贡器是装备溢价的出口);购 > 悬赏(买→交亏本,不成套利)
        expect(toN(bounty) > toN(consign)).toBe(true)
        expect(toN(buy) > toN(bounty)).toBe(true)
      }
    }
  })

  it('② 弟子材料不衰减(C1):悬赏把弟子固定产的草按 4.5/单位收走,价值÷战斗恒常', () => {
    // 一整单募草(30 单位 × 4.5)的灵石 ÷ 一场战斗,应逐境界恒等于 13.5
    for (const major of MAJORS) {
      const tier = tierOf(major)
      const bountyFull = toN(stoneByTier(tier, BOUNTY_MAT_TARGET * BOUNTY_MAT_UNIT_AMOUNT))
      const battle = toN(stoneByTier(tier, 10))
      const ratio = bountyFull / battle
      expect(ratio, `境 ${major} 弟子整单募草价值÷战斗应恒常`).toBeCloseTo(13.5, 6)
    }
  })

  it('② 弟子石类差事不贬值:历练(amount 4)恒为战斗(amount 10)的固定份额', () => {
    // 两者同用 stoneByTier(同一层级),故比值与境界、层级都无关 —— 恒等于 0.4
    for (const major of MAJORS) {
      const tier = tierOf(major)
      const adventure = toN(stoneByTier(tier, 4))
      const battle = toN(stoneByTier(tier, 10))
      expect(adventure / battle, `境 ${major} 历练/战斗应恒常`).toBeCloseTo(0.4, 6)
    }
  })
})

describe('灵草三价无套利守卫(购/悬赏/售)', () => {
  it('每一品:售 = 购价×½、悬赏每株 = 购价×¾,且 购 > 悬赏 > 售(不搬砖)', () => {
    for (const g of HERB_GRADES) {
      const buy = herbBuyPrice(g)
      const sell = herbSellPrice(g)
      const bountyPer = toN(herbBountyReward(g, 1))
      // 对购价直比固定倍率 —— 常数一旦改回 0.8/0.9(搬砖复活)此处即红
      expect(sell, `第 ${g} 品售出应=购价×½`).toBe(buy / 2)
      expect(bountyPer, `第 ${g} 品悬赏每株应=购价×¾`).toBe(buy * 0.75)
      // 无套利顺序:购 > 悬赏 > 售
      expect(buy, `第 ${g} 品购价应高于悬赏`).toBeGreaterThan(bountyPer)
      expect(bountyPer, `第 ${g} 品悬赏应高于售出`).toBeGreaterThan(sell)
      // 且均为整数(无分石漂移)
      expect(Number.isInteger(sell), `第 ${g} 品售出应为整数`).toBe(true)
      expect(Number.isInteger(bountyPer), `第 ${g} 品悬赏每株应为整数`).toBe(true)
    }
  })

  it('公式口径与常数一致:售/悬赏就是「购价 × 该档 ÷ 购入档」', () => {
    for (const g of HERB_GRADES) {
      const buy = herbBuyPrice(g)
      expect(herbSellPrice(g)).toBe(buy * (MARKET_SELL_MAT_STONE_UNITS / MARKET_MAT_STONE_UNITS))
      expect(toN(herbBountyReward(g, 1))).toBe(buy * (BOUNTY_MAT_UNIT_AMOUNT / MARKET_MAT_STONE_UNITS))
    }
  })
})
