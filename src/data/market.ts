/**
 * 坊市:静态调参与类型;挑货与定价要用境界与 stoneByTier,在 core/marketService.ts。
 * 市场标尺 marketTier = maxTierForMajor(区域真实梯级,至 32 阶,不是境界大阶)。
 *   丹药:炼制石耗 × MARKET_PILL_MARKUP;跳过整条炼丹线,须比自炼贵。
 *   材料:每单位 stoneByTier(marketTier(major), MARKET_MAT_STONE_UNITS),MARKET_MAT_COUNT 单位一摞。
 *   装备:stoneByTier(marketTier(major), 基准 + 档 × 每档),按品质溢价;品质下限用该境界 rollQuality 掷出,与掉落同源。
 */
import type { GNum } from '@/types'
import type { HerbGrade } from '@/data/herbGrades'

export type MarketKind = 'pill' | 'material' | 'equipment'

/** 货架格数 */
export const MARKET_SLOTS = 6
/** 货架刷新周期(秒,真实时间;离线照走墙钟) */
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
/** 货架门类权重(骰中门类在现境界无货则让给别的门类) */
export const MARKET_KIND_WEIGHTS: Record<MarketKind, number> = { pill: 4, material: 3, equipment: 3 }

// ---- 售出(摆摊) ----
/** 装备寄卖格数与耗时(秒,真实时间;离线照走,到期自售入账) */
export const MARKET_CONSIGN_SLOTS = 2
/**
 * 寄卖格的渲染上限,不是能挂几件(MARKET_CONSIGN_SLOTS)。
 * 坏档/导入档可塞成千上万条:界面只铺这么多格,其余并成一行「另有 N 件」。
 */
export const MARKET_CONSIGN_RENDER_MAX = 6
/**
 * 寄卖条数的**读档上限**,与渲染上限是两件事。
 *
 * 写入侧只有 `consignEquip` 一个入口,而它先过
 * `if (consign.value.length >= MARKET_CONSIGN_SLOTS) return 'full'` ——
 * 正常存档里永远不可能超过 2 条。故读档时超过的那部分**只可能来自坏档**。
 *
 * 早先的处置是「存档全留,到点照样入账」,理由是「都是玩家已交出去的货,不能丢」。
 * 那个理由在正常玩法下成立,在坏档下不成立:一条寄卖的最高价是
 * `consignPrice(MAX_EQUIP_TIER, 神品)` ≈ 6.36e10,而条数没有上界 ——
 * 实测灌 5 万条,一次收割凭空入账 **3179 兆灵石**,存档同时被撑到 5MB。
 * 货是假的,钱也是假的;留全量既救不了玩家,又毁掉经济。
 *
 * 上界取 `MARKET_CONSIGN_SLOTS`:与写入侧同一把尺,「挂得下的才留」。
 * 越界的整条丢弃,不夹取 —— 夹出来的每一条都会被当成真的到点入账。
 */
export const MARKET_CONSIGN_MAX = MARKET_CONSIGN_SLOTS
export const MARKET_CONSIGN_SECONDS = 2400
/** 寄卖装备灵石档位(stoneByTier 的 amount)与每品质档增量;恒低于坊市购入同档,防套利 */
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
  /** 灵草品阶:上货时定死,否则货架期内跨品阶/转世会让标价、显示、入账分叉;旧档无此字段按当下品兜底 */
  grade?: HerbGrade
  count: number
  price: GNum
  sold: boolean
}
export interface MarketEquipSlot {
  kind: 'equipment'
  idx: number
  /** 装备层级(= marketTier(major)) */
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
