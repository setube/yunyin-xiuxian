/**
 * 坊市悬赏板 —— 商号的收购订单
 *
 * 价锚定确定性公式,且高于摆摊即时售、低于坊市购入同档(防「从坊市买来再交悬赏」套灵石)。
 * 静态调参与类型在这里;生成/定价/交货校验在 core/bountyService。
 */
import type { GNum } from '@/types'

/** 悬赏门类 */
export type BountyKind = 'herb' | 'ore' | 'pill' | 'equip'

/** 货架格数与刷新周期(单位:秒,真实时间;离线照走) */
export const BOUNTY_SLOTS = 4
/**
 * 悬赏单的**读档上限**,与「一版几张」是两件事。
 *
 * 写入侧只有 `generateBounty` 一个来源,而它结尾就是
 * `slots.slice(0, Math.min(BOUNTY_SLOTS, slots.length))` —— 正常存档永远 ≤4 张。
 * 读档时多出来的只可能来自坏档,而每一张都能被 `claim(idx)` 逐张交付领赏:
 * 实测灌 5000 张(赏格 9.9e12)能全部领完,净得 **4.95 京灵石**,存档同时被撑到 550KB。
 *
 * 上界取 `BOUNTY_SLOTS`:与写入侧同一把尺。越界整纸丢弃,不夹取 ——
 * 夹出来的每一张都是能被真领走的赏。
 */
export const BOUNTY_MAX = BOUNTY_SLOTS
export const BOUNTY_REFRESH_SECONDS = 14400

/** 募材:每格收的量 */
export const BOUNTY_MAT_TARGET = 30
/** 募材每单位灵石档位(stoneByTier 的 amount):高于摆摊售出(3)、低于坊市购入(6) */
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
