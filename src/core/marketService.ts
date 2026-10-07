/**
 * 坊市货架生成与定价 —— 拿 player 境界与 stoneByTier 现算,故在 core 层。
 *
 * 与掉落同源的纪律:装备的品质下限用 equipGen.rollQuality 掷(与掉落同一把尺、
 * 一样受「给了下限就跳出品级窗口」约束),价格全走 stoneByTier —— 不另立一套
 * 经济口径,免得坊市价格与掉落/强化/重铸对不上账。
 */
import type { EquipmentInstance, GNum } from '@/types'
import { gn, gnZero, mulN } from '@/utils/gnum'
import { stoneByTier } from './formulas'
import { PILLS, pillDef } from '@/data/pills'
import { mulberry32, RandomService } from '@/utils/random'
import { generateEquipment, rollQuality } from './equipGen'
import {
  MARKET_SLOTS,
  MARKET_REFRESH_SECONDS,
  MARKET_PILL_MARKUP,
  MARKET_MAT_STONE_UNITS,
  MARKET_MAT_COUNT,
  MARKET_EQUIP_STONE_BASE,
  MARKET_EQUIP_STONE_PER_RANK,
  MARKET_KIND_WEIGHTS,
  MARKET_CONSIGN_STONE_BASE,
  MARKET_CONSIGN_STONE_PER_RANK,
  MARKET_SELL_PILL_FACTOR,
  MARKET_SELL_MAT_STONE_UNITS,
  type MarketEquipSlot,
  type MarketKind,
  type MarketSlot,
  type MarketStock
} from '@/data/market'

/** 现境界拿得到的可售丹药(须有炼制石耗才能定价) */
export function salePills(major: number): typeof PILLS {
  return PILLS.filter(p => p.recipe?.stoneBase != null && p.minRealm <= major)
}

/** 一货架里骰一个此刻拿得到的门类(权重仅对可行门类生效) */
function pickKind(rng: RandomService, feasible: MarketKind[]): MarketKind {
  if (feasible.length === 1) return feasible[0]!
  return rng.weighted(feasible, k => MARKET_KIND_WEIGHTS[k])
}

function buildSlot(
  kind: MarketKind,
  idx: number,
  major: number,
  rng: RandomService,
  usedPills: Set<string>
): MarketSlot {
  if (kind === 'pill') {
    const pool = salePills(major).filter(p => !usedPills.has(p.id))
    const def = (pool.length > 0 ? rng.pick(pool) : salePills(major)[0])!
    usedPills.add(def.id)
    return {
      kind: 'pill',
      idx,
      pillId: def.id,
      count: 1,
      price: mulN(gn(def.recipe!.stoneBase), MARKET_PILL_MARKUP),
      sold: false
    }
  }
  if (kind === 'material') {
    const matId: 'herb' | 'ore' = rng.chance(0.5) ? 'herb' : 'ore'
    return {
      kind: 'material',
      idx,
      matId,
      count: MARKET_MAT_COUNT,
      price: mulN(stoneByTier(major, MARKET_MAT_STONE_UNITS), MARKET_MAT_COUNT),
      sold: false
    }
  }
  const minQualityRank = rollQuality(major, rng).rank
  return {
    kind: 'equipment',
    idx,
    tier: major,
    minQualityRank,
    price: stoneByTier(major, MARKET_EQUIP_STONE_BASE + minQualityRank * MARKET_EQUIP_STONE_PER_RANK),
    sold: false
  }
}

/** 生成一整架新货;stockedAt 取调用时刻,装备再生以此为种子锚 */
export function generateMarketStock(major: number, rng: RandomService, now: number): MarketStock {
  const feasible: MarketKind[] = ['material', 'equipment']
  if (salePills(major).length > 0) feasible.unshift('pill')

  const usedPills = new Set<string>()
  const slots: MarketSlot[] = []
  for (let idx = 0; idx < MARKET_SLOTS; idx += 1) {
    slots.push(buildSlot(pickKind(rng, feasible), idx, major, rng, usedPills))
  }
  return { goods: slots, stockedAt: now }
}

/** 货架里某件装备的确定性实例 —— 预览与购买同源同一物(uid 除外,不落库、不进渲染) */
export function marketEquipInstance(slot: MarketEquipSlot, stockedAt: number): EquipmentInstance {
  const seed = (Math.floor(stockedAt / 1000) * 31 + slot.idx) >>> 0
  return generateEquipment(slot.tier, new RandomService(mulberry32(seed)), { minQualityRank: slot.minQualityRank })
}

/** 货架还剩多久刷新(秒);已过期返回 0 */
export function marketRemainingSec(stockedAt: number, now: number): number {
  return Math.max(0, stockedAt + MARKET_REFRESH_SECONDS * 1000 - now) / 1000
}

/** 寄卖一件装备可得(恒低于坊市购入同档,无搬砖套利) */
export function consignPrice(tier: number, qualityRank: number): GNum {
  return stoneByTier(tier, MARKET_CONSIGN_STONE_BASE + qualityRank * MARKET_CONSIGN_STONE_PER_RANK)
}

/** 即时售一枚丹药可得(购入倍率 2.5,售出 1.2,双向不成环) */
export function pillSellPrice(pillId: string): GNum {
  const def = pillDef(pillId)
  return def && def.recipe?.stoneBase ? mulN(gn(def.recipe.stoneBase), MARKET_SELL_PILL_FACTOR) : gnZero()
}

/** 即时售一批材料(与货架同单位数)可得;每单位价低于购入 */
export function materialSellPrice(major: number): GNum {
  return mulN(stoneByTier(major, MARKET_SELL_MAT_STONE_UNITS), MARKET_MAT_COUNT)
}

