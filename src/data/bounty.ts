/**
 * 坊市悬赏板 —— 商号的收购订单(Phase 43:新增可玩性第四条)
 *
 * 坊市不只卖货、收你的零碎 —— 商号还会挂出收购悬赏:募 灵草/玄铁/一味指定的丹/
 * 一柄不低于某阶的兵刃,交货即得灵石。与道童(采药采矿产材)、炼丹、炼器互相咬合:
 * 「道童跑腿回材 → 来这交货得灵石」是一条自洽的目标循环。
 *
 * 单机视角:订单来自商号(NPC),价锚定确定性公式,且**高于摆摊即时售、低于坊市购入
 * 同档** —— 玩家不可能「从坊市买来再交悬赏」空手套灵石。
 *
 * 静态调参与类型在这里;生成/定价/交货校验在 core/bountyService。
 */
import type { GNum } from '@/types'

/** 悬赏门类 */
export type BountyKind = 'herb' | 'ore' | 'pill' | 'equip'

/** 货架格数与刷新周期(秒,真实时间;离线照走,归来自换新订单) */
export const BOUNTY_SLOTS = 4
export const BOUNTY_REFRESH_SECONDS = 14400

/** 募材:每格收的量,与每单位灵石档位(stoneByTier 的 amount) */
export const BOUNTY_MAT_TARGET = 30
/** 每单位档位 4.5:高于摆摊售出(3)、低于坊市购入(6),无搬砖套利 */
export const BOUNTY_MAT_UNIT_AMOUNT = 4.5

/** 募丹:收的量与回报倍率(>售出 1.2、<购入 2.5),另附悟道 */
export const BOUNTY_PILL_COUNT = 3
export const BOUNTY_PILL_REWARD_FACTOR = 1.8
export const BOUNTY_PILL_WUDAO = 3

/** 贡器:价随所交之品的品质档;灵石档位低于坊市购入同品质,另附器尘 */
export const BOUNTY_EQUIP_STONE_BASE = 35
export const BOUNTY_EQUIP_STONE_PER_RANK = 14
export const BOUNTY_EQUIP_DUST_BASE = 2

/** 一纸悬赏订单 */
export interface BountySlot {
  idx: number
  kind: BountyKind
  /** 材料则为 'herb'|'ore';丹药则为 pillId;贡器则为空串 */
  kindId: string
  /** 交货数量(材料/丹药的件数);贡器为 1 */
  target: number
  /** 贡器门槛:不低于此阶(材料/丹药为 0) */
  tier: number
  /** 固定价(材料/丹药);贡器此位为占位,按所交之品现算 */
  reward: GNum
  /** 额外添头:丹药给悟道数、贡器给器尘数;其余 0 */
  extra: number
  claimed: boolean
}
