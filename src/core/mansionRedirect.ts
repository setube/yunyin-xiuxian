/**
 * 星象值日定向的纯判据。
 *
 * 放在 core 的独立小模块里，避免 stores/player 为了复用判据反向 import
 * astronomy（后者又读 player store，会形成运行时环）。界面、store 与服务
 * 只共用这一份「为什么点不动」的答案。
 */
import { MANSION_REDIRECT_COST, MANSION_REDIRECT_MAX } from '@/data/constants'
import { formatGN } from '@/utils/format'
import { gn, gnZero, gte, subClamp } from '@/utils/gnum'
import type { GNum, WorldId } from '@/types'

/** 玩家把今日值日定向到某界的覆盖记录(存于 player store) */
export interface MansionRedirect {
  /** 生效的游戏日 —— 不是今天就不算数(次日自动回落) */
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
  /** 可直接放在按钮 title / aria-label 上的完整拒因 */
  reason: string | null
}

/**
 * 今日能否把值日定向到 w，以及差多少灵石。
 *
 * 判断顺序就是玩家看到的顺序：已定向此界 > 今日次数已尽 > 灵石不足。
 * 已定向此界即使余额为 0 也不报「差石」,因为这一格本来就不该再点。
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
      return { blocked: 'limit', stoneShort: gnZero(), reason: '今日次数已尽' }
    }
  }
  const cost = gn(MANSION_REDIRECT_COST)
  if (!gte(stone, cost)) {
    const stoneShort = subClamp(cost, stone)
    return { blocked: 'stone', stoneShort, reason: `灵石尚差 ${formatGN(stoneShort)}` }
  }
  return { blocked: null, stoneShort: gnZero(), reason: null }
}
