/**
 * 坊市货架生成与定价。
 * 与掉落同源:装备品质下限用 equipGen.rollQuality 掷(同受「给了下限就跳出品级窗口」约束),价格全走 stoneByTier,不另立经济口径。
 */
import type { EquipmentInstance, GNum } from '@/types'
import { gn, gnZero, mulN } from '@/utils/gnum'
import { stoneByTier } from './formulas'
import { maxTierForMajor } from '@/data/regions'
import { PILLS, pillDef } from '@/data/pills'
import { pillStoneCost } from './pillService'
import { herbGradeOfMajor, type HerbGrade } from '@/data/herbGrades'
import { herbBuyPrice } from './herbPrice'
import { mulberry32, RandomService } from '@/utils/random'
import { generateEquipment, rollQuality } from './equipGen'
import { qualityDef } from '@/data/qualities'
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
  type MarketMaterialSlot,
  type MarketSlot,
  type MarketStock
} from '@/data/market'

/** 现境界拿得到的可售丹药(须有炼制石耗才能定价) */
export function salePills(major: number): typeof PILLS {
  return PILLS.filter(p => p.recipe?.stoneBase != null && p.minRealm <= major)
}

/**
 * 坊市/悬赏的唯一经济标尺:当前境界能到达的最高区域层级。
 * 与灵草 herbPrice、economySim 同一把尺;直接拿境界大阶(major,0-20)当层级,矿/装备会与草两把尺分叉。
 */
export function marketTier(major: number): number {
  return maxTierForMajor(major)
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
  usedPills: Set<string>,
  now: number
): MarketSlot {
  if (kind === 'pill') {
    const pool = salePills(major).filter(p => !usedPills.has(p.id))
    if (pool.length > 0) {
      const def = rng.pick(pool)!
      usedPills.add(def.id)
      return {
        kind: 'pill',
        idx,
        pillId: def.id,
        count: 1,
        // 基准须是该丹的炼制石耗(pillStoneCost),不是写死的 stoneBase 裸值:顶层丹自炼 ~1.7e11,写死 4250 等于白送
        price: mulN(pillStoneCost(def), MARKET_PILL_MARKUP),
        sold: false
      }
    }
    // 可炼丹已全在架上:落回材料格,不摆同味重复丹
    kind = 'material'
  }
  /*
   * 市场层级只由 major 决定,而 maxTierForMajor 要扫一遍全部地界。
   * 原先这一格里调了四次(材料价、品质下限、装备生成、货层与装备价里的两次),
   * 一架子六格就是二十四遍全表扫。算一次即可 —— 结果逐字不变。
   */
  const tier = marketTier(major)
  if (kind === 'material') {
    const matId: 'herb' | 'ore' = rng.chance(0.5) ? 'herb' : 'ore'
    // 品阶钉死在上货时刻:否则货架期内跨品阶/转世,标价是旧品、入账却按当下品
    const grade = herbGradeOfMajor(major)
    // 灵草按品明码标价:×10 阶梯一路到一千万封顶(见 data/herbGrades)
    const price =
      matId === 'herb'
        ? mulN(gn(herbBuyPrice(grade, major)), MARKET_MAT_COUNT)
        : mulN(stoneByTier(tier, MARKET_MAT_STONE_UNITS), MARKET_MAT_COUNT)
    return { kind: 'material', idx, matId, grade, count: MARKET_MAT_COUNT, price, sold: false }
  }
  // 品质下限同样骑市场层级:major 是 0~20 的境界下标,当 tier 喂给 rollQuality 会让高价货架兑现低品质
  const minQualityRank = rollQuality(tier, rng).rank
  // 按预览即购得那件的真实品质档标价;按下限标价会被「坊市买入 → 悬赏贡器」套利(见 data/bounty 的单位档比对)
  const rank = qualityDef(generateEquipment(tier, new RandomService(mulberry32(equipSeed(now, idx))), { minQualityRank }).quality).rank
  return {
    kind: 'equipment',
    idx,
    // 货与定价同一层级(marketTier),否则买来的比掉落次一层
    tier,
    minQualityRank,
    price: stoneByTier(tier, MARKET_EQUIP_STONE_BASE + rank * MARKET_EQUIP_STONE_PER_RANK),
    sold: false
  }
}

/** 货架某格的确定性装备种子(上货与预览/购买共用,保证同一件) */
function equipSeed(stockedAt: number, idx: number): number {
  return (Math.floor(stockedAt / 1000) * 31 + idx) >>> 0
}

/** 生成一整架新货;stockedAt 取调用时刻,装备再生以此为种子锚 */
export function generateMarketStock(major: number, rng: RandomService, now: number): MarketStock {
  const feasible: MarketKind[] = ['material', 'equipment']
  if (salePills(major).length > 0) feasible.unshift('pill')

  const usedPills = new Set<string>()
  const slots: MarketSlot[] = []
  for (let idx = 0; idx < MARKET_SLOTS; idx += 1) {
    slots.push(buildSlot(pickKind(rng, feasible), idx, major, rng, usedPills, now))
  }
  return { goods: slots, stockedAt: now }
}

/** 货架里某件装备的确定性实例:预览与购买同一物(uid 除外,不落库、不进渲染) */
export function marketEquipInstance(slot: MarketEquipSlot, stockedAt: number): EquipmentInstance {
  return generateEquipment(slot.tier, new RandomService(mulberry32(equipSeed(stockedAt, slot.idx))), {
    minQualityRank: slot.minQualityRank
  })
}

/**
 * 「去坊市续草」该指哪一格:须按丹炉缺的那一品认。
 * 旧档货架格没有 grade,按显示兜底品算(与界面显示、入账同源)。
 * @returns slot 可高亮的未售格(没有则 null);soldOut 表示这一品有货但已售罄(区别于这一架没进这品草)
 */
export function focusHerbSlot(
  slots: readonly MarketSlot[],
  grade: HerbGrade,
  fallbackGrade: HerbGrade
): { slot: MarketMaterialSlot | null; soldOut: boolean } {
  const herbs = slots.filter(
    (s): s is MarketMaterialSlot => s.kind === 'material' && s.matId === 'herb' && (s.grade ?? fallbackGrade) === grade
  )
  const slot = herbs.find(s => !s.sold) ?? null
  return { slot, soldOut: slot === null && herbs.length > 0 }
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
  // 与买价同源:基准是炼制石耗(pillStoneCost),不是写死的 stoneBase
  return def && def.recipe?.stoneBase ? mulN(pillStoneCost(def), MARKET_SELL_PILL_FACTOR) : gnZero()
}

/** 即时售一批玄铁(与货架同单位数)可得;每单位价低于购入,不成环。灵草的出售走 herbSell(按品) */
export function materialSellPrice(major: number): GNum {
  return mulN(stoneByTier(marketTier(major), MARKET_SELL_MAT_STONE_UNITS), MARKET_MAT_COUNT)
}

/** 灵草任意品的即时售价(株)= 该品购价 × 1/2(售出档 3 / 购入档 6),恒低于购入不成环;全部品都可出手 */
export function herbSellPrice(grade: HerbGrade, major: number): number {
  return herbBuyPrice(grade, major) * (MARKET_SELL_MAT_STONE_UNITS / MARKET_MAT_STONE_UNITS)
}

/** 一批(单位数同货架)任意品灵草的即时售价 */
export function herbSellBatch(grade: HerbGrade, major: number): GNum {
  return mulN(gn(herbSellPrice(grade, major)), MARKET_MAT_COUNT)
}
