/**
 * 星象值日定向的纯判据;界面、store 与服务只共用这一份。
 * 独立成模块:stores/player 若为复用判据 import astronomy(后者又读 player store),会形成运行时环。
 */
import { MANSION_REDIRECT_COST, MANSION_REDIRECT_MAX } from '@/data/constants'
import { formatGap } from '@/utils/format'
import { gn, gnZero, gte, subClamp } from '@/utils/gnum'
import type { GNum, WorldId } from '@/types'

/** 玩家把今日值日定向到某界的覆盖记录(存于 player store) */
export interface MansionRedirect {
  /** 生效的游戏日(非今日即不算数,次日自动回落) */
  gameDay: number
  /** 玩家选中要利的界域 */
  worldId: WorldId
  /** 当日已定向了几次(限 MANSION_REDIRECT_MAX,达上限即回落天数派生) */
  count: number
}

export type MansionRedirectBlock = 'already' | 'limit' | 'stone'

export interface MansionRedirectCheck {
  /** 不能定向时的原因；可以定向时为 null */
  blocked: MansionRedirectBlock | null
  /** 灵石尚差；足够时为 0 */
  stoneShort: GNum
  /** 完整拒因(供按钮 title / aria-label) */
  reason: string | null
}

/**
 * 今日能否把值日定向到该界,以及差多少灵石。
 * 判断顺序即玩家看到的顺序:已定向此界 > 今日已用尽 > 灵石不足;已定向此界时即使余额为 0 也不报「差石」。
 */
export function mansionRedirectCheck(
  day: number,
  current: MansionRedirect | null,
  worldId: WorldId,
  stone: GNum
): MansionRedirectCheck {
  if (current && current.gameDay === day) {
    if (current.worldId === worldId) return { blocked: 'already', stoneShort: gnZero(), reason: '已定向此界' }
    if (current.count >= MANSION_REDIRECT_MAX) {
      return { blocked: 'limit', stoneShort: gnZero(), reason: '今日已用尽' }
    }
  }
  const cost = gn(MANSION_REDIRECT_COST)
  if (!gte(stone, cost)) {
    const stoneShort = subClamp(cost, stone)
    return { blocked: 'stone', stoneShort, reason: `灵石尚差 ${formatGap(stoneShort)}` }
  }
  return { blocked: null, stoneShort: gnZero(), reason: null }
}
