/**
 * 坊市 —— 灵石换机缘之地(Phase 41:新增可玩性第一条)
 *
 * 货架每次刷新生成一格一格「该不该买」的抉择:药材补库存、丹药跳炼炉、
 * 装备则免去刷图的运气。是完全的静态调参与类型;
 * 「挑哪几件、标什么价」要拿 player 的境界与 stoneByTier 来算,故生成与定价
 * 在 core/marketService.ts。
 *
 * ## 定价怎么锚
 *
 * 一、丹药:口袋价 = 炼制石耗 × MARKET_PILL_MARKUP。买丹跳过的是「集灵草→习丹方→
 *     升炉火→炸炉」整条炼丹线,故要比自炼贵、又不至于离谱。
 * 二、材料:每单位 = stoneByTier(major, MARKET_MAT_STONE_UNITS)(一场遭遇 ≈ amount 10),
 *     MARKET_MAT_COUNT 单位一摞。给洞府生产续料,是灵石最常见的销处。
 * 三、装备:价随品质档递增 = stoneByTier(major, 基准 + 档 × 每档)。装备本就由掉落白送,
 *     坊市卖的是「省一场运气」,故按品质溢价;而品质下限即用该境界 rollQuality 掷出,
 *     与掉落同源。装备层数即当前境界(major)。
 */
import type { GNum } from '@/types'

export type MarketKind = 'pill' | 'material' | 'equipment'

/** 货架格数 */
export const MARKET_SLOTS = 6
/** 货架刷新周期(秒,真实时间;离线同样按墙钟走,回来自然换新货) */
export const MARKET_REFRESH_SECONDS = 7200

/** 丹药售价 = 炼制石耗 × 此倍率 */
export const MARKET_PILL_MARKUP = 2.5
/** 材料每单位灵石档位(stoneByTier 的 amount);一场遭遇 ≈ 10 */
export const MARKET_MAT_STONE_UNITS = 6
/** 每格材料出售单位数 */
export const MARKET_MAT_COUNT = 12
/** 装备灵石基准与每品质档增量(stoneByTier 的 amount) */
export const MARKET_EQUIP_STONE_BASE = 60
export const MARKET_EQUIP_STONE_PER_RANK = 30
/** 货架出门类权重(骰出门类后,若该门类在现境界无货则让给别的门类) */
export const MARKET_KIND_WEIGHTS: Record<MarketKind, number> = { pill: 4, material: 3, equipment: 3 }

// ---- 售出(摆摊) ----
/** 装备寄卖格数与耗时(秒,真实时间;离线照走,到期自售入账) */
export const MARKET_CONSIGN_SLOTS = 2
export const MARKET_CONSIGN_SECONDS = 2400
/** 寄卖装备灵石档位(stoneByTier 的 amount)与每品质档增量 —— 恒低于坊市购入同档,无搬砖套利 */
export const MARKET_CONSIGN_STONE_BASE = 25
export const MARKET_CONSIGN_STONE_PER_RANK = 12
/** 丹药即时售价 = 炼制石耗 × 此倍(购入倍率 2.5,卖出低于购入,双向不成环) */
export const MARKET_SELL_PILL_FACTOR = 1.2
/** 材料每单位即时售价档位(stoneByTier 的 amount);购入每单位 6,售出 3 */
export const MARKET_SELL_MAT_STONE_UNITS = 3

/** 一桩寄卖(装备已离背包、售出即入账;不可撤回) */
export interface ConsignPost {
  slot: number
  tier: number
  qualityRank: number
  price: GNum
  finishAt: number
  name: string
}

export interface MarketPillSlot {
  kind: 'pill'
  idx: number
  /** 丹药 id */
  pillId: string
  /** 出售数量 */
  count: number
  price: GNum
  sold: boolean
}
export interface MarketMaterialSlot {
  kind: 'material'
  idx: number
  /** 库存两标量之一(见 stores/resources 的 herb/ore) */
  matId: 'herb' | 'ore'
  count: number
  price: GNum
  sold: boolean
}
export interface MarketEquipSlot {
  kind: 'equipment'
  idx: number
  /** 装备层级(=当前境界) */
  tier: number
  /** 品质下限(给 generateEquipment 用;给了即不吃品质窗口) */
  minQualityRank: number
  price: GNum
  sold: boolean
}
export type MarketSlot = MarketPillSlot | MarketMaterialSlot | MarketEquipSlot

/** 一次生成的一整架货 */
export interface MarketStock {
  goods: MarketSlot[]
  /** 本次上货时刻(ms);兼作装备确定性再生的种子锚 */
  stockedAt: number
}
