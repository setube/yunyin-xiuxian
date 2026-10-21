/**
 * 后期限量「灵石 → 悟道点」兑换的统一判据。
 *
 * 按钮、禁用态与失败回执都读这一份:境界、当日限额、灵石余额三个原因
 * 分开报,不再把「灵石不足」和「今日已兑满」糊成一句话。
 */
import type { GNum } from '@/types'
import { gn, gnZero, gte, subClamp } from '@/utils/gnum'
import {
  WUDAO_EXCHANGE_MIN_MAJOR,
  WUDAO_EXCHANGE_PER_DAY,
  WUDAO_EXCHANGE_PRICE_BASE
} from '@/data/constants'

export interface WudaoExchangeState {
  lockedByRealm: boolean
  dailyFull: boolean
  /** 灵石尚差;足够时为 0 */
  stoneShort: GNum
  canExchange: boolean
}

export function wudaoExchangeState(major: number, todayCount: number, stone: GNum): WudaoExchangeState {
  const lockedByRealm = major < WUDAO_EXCHANGE_MIN_MAJOR
  const dailyFull = todayCount >= WUDAO_EXCHANGE_PER_DAY
  const cost = gn(WUDAO_EXCHANGE_PRICE_BASE)
  const stoneShort = gte(stone, cost) ? gnZero() : subClamp(cost, stone)
  return {
    lockedByRealm,
    dailyFull,
    stoneShort,
    canExchange: !lockedByRealm && !dailyFull && stoneShort.m === 0
  }
}
