/**
 * 后期限量「灵石 → 悟道点」兑换的统一判据,按钮、禁用态与失败回执同读这一份。
 * 境界、当日限额、灵石余额三个原因分开报。
 *
 * 价位骑层级:混沌海一战胜就几十亿灵石,写死绝对值会让兑换变成白送(见 WUDAO_EXCHANGE_TIER_AMOUNT)。
 */
import type { GNum } from '@/types'
import { gnZero, gte, mulN, subClamp } from '@/utils/gnum'
import { stoneByTier } from './formulas'
import { maxTierForMajor } from '@/data/regions'
import { WUDAO_EXCHANGE_MIN_MAJOR, WUDAO_EXCHANGE_PER_DAY, WUDAO_EXCHANGE_TIER_AMOUNT } from '@/data/constants'

export interface WudaoExchangeState {
  lockedByRealm: boolean
  dailyFull: boolean
  /** 本次兑换所费灵石(按当前境界层级折算) */
  cost: GNum
  /** 灵石尚差;足够时为 0 */
  stoneShort: GNum
  canExchange: boolean
}

/** 该境界一次的兑换价;界面报价与扣费同读这一份 */
export function wudaoExchangeCost(major: number): GNum {
  return stoneByTier(maxTierForMajor(major), WUDAO_EXCHANGE_TIER_AMOUNT)
}

/**
 * 一次连兑能兑几次:当日剩余次数与灵石余额两者取小。
 *
 * 从额度往下试「够不够 k 次的整价」,而不是逐次相减 ——
 * GNum 只有有限有效位,连减十次会在尾数上累积误差:余额恰好够满额时,
 * 逐减到第九次就可能已经判成不足。先乘后比只做一次比较,不出这个偏差。
 * 额度最多十次,循环上限本来就小。
 */
export function wudaoExchangeAffordable(major: number, todayCount: number, stone: GNum): number {
  if (major < WUDAO_EXCHANGE_MIN_MAJOR) return 0
  const left = Math.max(0, WUDAO_EXCHANGE_PER_DAY - todayCount)
  if (left === 0) return 0
  const cost = wudaoExchangeCost(major)
  if (cost.m === 0) return left
  for (let k = left; k > 0; k -= 1) {
    if (gte(stone, mulN(cost, k))) return k
  }
  return 0
}

export function wudaoExchangeState(major: number, todayCount: number, stone: GNum): WudaoExchangeState {
  const lockedByRealm = major < WUDAO_EXCHANGE_MIN_MAJOR
  const dailyFull = todayCount >= WUDAO_EXCHANGE_PER_DAY
  const cost = wudaoExchangeCost(major)
  const stoneShort = gte(stone, cost) ? gnZero() : subClamp(cost, stone)
  return {
    lockedByRealm,
    dailyFull,
    cost,
    stoneShort,
    canExchange: !lockedByRealm && !dailyFull && stoneShort.m === 0
  }
}
