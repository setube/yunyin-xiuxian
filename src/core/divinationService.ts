/**
 * 问卦的动作层 —— 扣悟道点、落卦象状态。
 *
 * 与 core/divination(纯函数)分开:那边只算卦,这边才碰存档与资源,
 * 免得 stores/player 为了取卦力反手 import 一个又会 import 自己的模块。
 */
import type { RandomService } from '@/utils/random'
import { rng } from '@/utils/random'
import {
  DIVINATION_COST,
  divinationActiveAt,
  drawHexagram,
  readingMinutes,
  type HexagramReading
} from './divination'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { gameNow } from './enginePause'

export interface DivinationOutcome {
  ok: boolean
  /** 未成卦的原因(已成卦则 undefined) */
  reason?: string
  reading?: HexagramReading
}

/**
 * 已有卦在身时不再受卦(一事不二卜),等它自己过去。
 * 卦是"此一时的时机":故有代价、有时限、不叠加。
 */
export function askDivination(rand: RandomService = rng): DivinationOutcome {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const now = gameNow()
  // 以此刻直接判断,不读 activeDivination 的缓存:后者挂在 5 秒修行心跳上,
  // 卦刚过期的那几秒会把「可以再问」误判成「卦仍在身」。
  if (divinationActiveAt(player.divination, now)) {
    return { ok: false, reason: '卦在身,一事不二卜 —— 待此卦自过。' }
  }
  if (!resources.hasSmall('wudao', DIVINATION_COST)) {
    return { ok: false, reason: `悟道点不足(需 ${DIVINATION_COST} 点)。` }
  }
  resources.spendSmall('wudao', DIVINATION_COST)
  const reading = drawHexagram(rand)
  player.setDivination({
    hexagram: reading.hexagram.name,
    upper: reading.upper.id,
    lower: reading.lower.id,
    changed: reading.changed?.name ?? null,
    changing: reading.changing,
    changingAt: reading.changingAt,
    lines: reading.lines,
    castAt: now,
    expiresAt: now + readingMinutes(reading) * 60_000
  })
  return { ok: true, reading }
}
