/**
 * 坊市悬赏板 —— 订单生成 / 定价 / 贡器现算。
 *
 * 与坊市同纪律:全走 stoneByTier 与炼制石耗,不另立经济口径。募材价高于摆摊售出、
 * 低于坊市购入(无「买→交」套利);募丹高于售出、低于购入;贡器价随所交之品的品质,
 * 但始终低于坊市购入同品质(交一柄换不回买一柄的本钱)。
 */
import type { GNum } from '@/types'
import { gn, gnZero, mulN } from '@/utils/gnum'
import { stoneByTier } from './formulas'
import { PILLS, pillDef } from '@/data/pills'
import {
  BOUNTY_SLOTS,
  BOUNTY_REFRESH_SECONDS,
  BOUNTY_MAT_TARGET,
  BOUNTY_MAT_UNIT_AMOUNT,
  BOUNTY_PILL_COUNT,
  BOUNTY_PILL_REWARD_FACTOR,
  BOUNTY_PILL_WUDAO,
  BOUNTY_EQUIP_STONE_BASE,
  BOUNTY_EQUIP_STONE_PER_RANK,
  BOUNTY_EQUIP_DUST_BASE,
  type BountySlot
} from '@/data/bounty'

/** 每轮刷新取一味可炼丹,按刷新周期取模,让每次换一招、同周期内稳定 */
function pickPill(now: number): string {
  const pool = PILLS.filter(p => p.recipe?.stoneBase != null).map(p => p.id)
  const idx = Math.floor(now / (BOUNTY_REFRESH_SECONDS * 1000)) % Math.max(1, pool.length)
  return pool[idx] ?? ''
}

/** 贡一柄 ≥门槛 兵刃可得(随所交之品的品质现算) */
export function equipBountyReward(tier: number, qualityRank: number): { stone: GNum; dust: number } {
  return {
    stone: stoneByTier(tier, BOUNTY_EQUIP_STONE_BASE + qualityRank * BOUNTY_EQUIP_STONE_PER_RANK),
    dust: BOUNTY_EQUIP_DUST_BASE + qualityRank
  }
}

/** 生成一版悬赏订单(四类各一);贡器 reward 为占位,交货时按所交之品现算 */
export function generateBounty(major: number, now: number): BountySlot[] {
  const pillId = pickPill(now)
  const pd = pillDef(pillId)
  const matTarget = BOUNTY_MAT_TARGET
  const matReward = stoneByTier(major, matTarget * BOUNTY_MAT_UNIT_AMOUNT)
  const slots: BountySlot[] = [
    { idx: 0, kind: 'herb', kindId: 'herb', target: matTarget, tier: 0, reward: matReward, extra: 0, claimed: false },
    { idx: 1, kind: 'ore', kindId: 'ore', target: matTarget, tier: 0, reward: matReward, extra: 0, claimed: false },
    {
      idx: 2,
      kind: 'pill',
      kindId: pd?.id ?? '',
      target: BOUNTY_PILL_COUNT,
      tier: 0,
      reward: pd?.recipe?.stoneBase ? mulN(gn(pd.recipe.stoneBase), BOUNTY_PILL_COUNT * BOUNTY_PILL_REWARD_FACTOR) : gnZero(),
      extra: BOUNTY_PILL_WUDAO,
      claimed: false
    },
    { idx: 3, kind: 'equip', kindId: '', target: 1, tier: major, reward: gnZero(), extra: 0, claimed: false }
  ]
  return slots.slice(0, Math.min(BOUNTY_SLOTS, slots.length))
}

/** 悬赏板还剩多久换新(秒);已过期返回 0 */
export function bountyRemainingSec(bountyAt: number, now: number): number {
  return Math.max(0, bountyAt + BOUNTY_REFRESH_SECONDS * 1000 - now) / 1000
}
