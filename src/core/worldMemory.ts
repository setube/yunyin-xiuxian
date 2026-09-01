/**
 * 世界记忆服务(Phase 30.9)—— 区域兴衰 / 宿敌 / 事件余波
 *
 * S1: 区域兴衰 — 玩家长期行为改变区域状态(混乱→稳定→繁盛)
 * S2: 宿敌记忆 — 同一敌人败我 ≥3 次标记宿敌,击败触发雪耻
 * S3: 事件余波 — 已完事件在再次遭遇时产生轻微文本/效果变化
 *
 * 原则:不新增货币 / 不新增境界 / 不改变核心经济 / 不引入高频操作 / 不破坏挂机
 * 全部为「记录与展示」层,数值影响极轻(材料掉落微调、无强制 debuff)
 */
import type { RegionProsperity, RegionRecall, NemesisRecord, EventMemory } from '@/types'
import { usePlayerStore } from '@/stores/player'

// ============ S1: 区域兴衰 ============

/** 玩家在区域内累计胜场达到多少进入稳定 */
export const STABLE_WINS = 30
/** 累计胜场达到多少进入繁盛 */
export const FLOURISH_WINS = 80
/** 无活动多长时间(小时)后,繁华短暂回落 */
export const DECAY_HOURS = 48
/** 镇压后无活动超过多少小时,区域开始复苏(自动解除镇压) */
export const REVIVE_AFTER_HOURS = 72

/** 镇压区域是否已进入复苏期(纯函数) */
export function isReviving(suppressedAt: number | undefined, now: number): boolean {
  if (suppressedAt === undefined) return false
  return (now - suppressedAt) / 3600_000 > REVIVE_AFTER_HOURS
}

interface RegionStateInput {
  totalWins: number
  hasSuppressed: boolean
  suppressedAt?: number
  lastActivityAt: number
  now: number
}

/** 派生区域兴衰状态(纯函数,无副作用) */
export function deriveProsperity(input: RegionStateInput): RegionRecall {
  const idleHours = (input.now - input.lastActivityAt) / 3600_000
  let prosperity: RegionProsperity = 'chaos'
  // 镇压过才有资格谈「稳定/繁盛」;持续活动才可维持
  if (input.hasSuppressed) {
    if (input.totalWins >= FLOURISH_WINS && idleHours < DECAY_HOURS) {
      prosperity = 'flourish'
    } else if (input.totalWins >= STABLE_WINS && idleHours < DECAY_HOURS) {
      prosperity = 'stable'
    }
  }
  return {
    prosperity,
    since: input.suppressedAt ?? input.lastActivityAt,
    totalWins: input.totalWins,
    hasSuppressed: input.hasSuppressed,
    suppressedAt: input.suppressedAt
  }
}

const PROSPERITY_NAMES: Record<RegionProsperity, string> = {
  chaos: '混乱',
  stable: '稳定',
  flourish: '繁盛'
}

export function prosperityName(p: RegionProsperity): string {
  return PROSPERITY_NAMES[p]
}

/**
 * 区域繁荣度对「被动产出」的微调:
 * 镇压后的安定收益随繁荣度变化。繁盛=灵脉恢复+商旅(100%),
 * 长期无人=99%(下降 1%),复苏(重新镇压)=额外 2%。
 * 轻量设计:只影响镇压系数的微小百分比,不改变核心经济
 */
export function prosperityYieldMult(p: RegionProsperity): number {
  switch (p) {
    case 'flourish':
      return 1.0
    case 'stable':
      return 0.99
    default:
      return 0.98
  }
}

// ============ S2: 宿敌记忆 ============

/** 标记为宿敌所需败北次数 */
export const NEMESIS_THRESHOLD = 3

/** 由敌人图鉴 id 组装宿敌记录(内部用;首次败北即 lossCount=1) */
function makeNemesis(enemyId: string, enemyName: string, regionId: string, now: number): NemesisRecord {
  return { enemyId, enemyName, regionId, lossCount: 1, lastLossAt: now }
}

/** 默认宿敌存储(用于世界记忆 store 的初始值) */
export function emptyNemeses(): NemesisRecord[] {
  return []
}

/** 记录一次败北:更新宿敌计数,新增或累加 */
export function recordLoss(
  nemeses: NemesisRecord[],
  enemyId: string,
  enemyName: string,
  regionId: string,
  now: number,
  threshold = NEMESIS_THRESHOLD
): { list: NemesisRecord[]; becameNemesis: boolean } {
  const existing = nemeses.find(n => n.enemyId === enemyId)
  if (existing) {
    const next = { ...existing, lossCount: existing.lossCount + 1, lastLossAt: now }
    return {
      list: nemeses.map(n => (n.enemyId === enemyId ? next : n)),
      becameNemesis: next.lossCount >= threshold
    }
  }
  const created = makeNemesis(enemyId, enemyName, regionId, now)
  return {
    list: [...nemeses.slice(-49), created],
    becameNemesis: created.lossCount >= threshold
  }
}

/** 是否已为宿敌(雪耻未完成) */
export function isNemesis(nemeses: NemesisRecord[], enemyId: string): boolean {
  const n = nemeses.find(x => x.enemyId === enemyId)
  return n !== undefined && n.lossCount >= NEMESIS_THRESHOLD && n.avengedAt === undefined
}

/** 首次雪耻:记录击破宿敌时间 */
export function markAvenged(nemeses: NemesisRecord[], enemyId: string, now: number): NemesisRecord[] {
  return nemeses.map(n => (n.enemyId === enemyId && n.avengedAt === undefined ? { ...n, avengedAt: now } : n))
}

// ============ S3: 事件余波 ============

/** 再次遭遇已完成事件时,触发「余波」文案的概率 */
export const AFTERMATH_CHANCE = 0.2

/** 默认事件记忆 */
export function emptyEventMemories(): Record<string, EventMemory> {
  return {}
}

/** 记录事件已完成:更新计数与最近选择 */
export function recordEvent(
  memories: Record<string, EventMemory>,
  eventId: string,
  choiceIdx: number,
  now: number
): Record<string, EventMemory> {
  const cur = memories[eventId]
  const next: EventMemory = cur
    ? { ...cur, times: cur.times + 1, lastAt: now, lastChoiceIdx: choiceIdx }
    : { eventId, times: 1, lastAt: now, lastChoiceIdx: choiceIdx, aftermathSeen: false }
  return { ...memories, [eventId]: next }
}

/** 余波触发条件(纯函数):完成过(≥2次)且已完事件即可 */
export function shouldTriggerAftermath(memories: Record<string, EventMemory>, eventId: string, rand: number): boolean {
  const m = memories[eventId]
  if (!m || m.times < 1) return false
  return rand < AFTERMATH_CHANCE
}

/** 余波文案生成(纯函数) */
export function aftermathText(eventTitle: string, kind: 'good' | 'echo' | 'silence'): string {
  switch (kind) {
    case 'good':
      return `${eventTitle}的痕迹依旧温存,你感到一丝久违的暖意。`
    case 'echo':
      return `${eventTitle}的余韵未散,往事如画卷般在眼前展开。`
    case 'silence':
      return `${eventTitle}已然远去,只余一片寂静。`
  }
}

// ============ 通用查询(供 UI 使用) ============

/** 当前区域兴衰(UI 用) */
export function regionRecallFor(regionId: string): RegionRecall {
  const player = usePlayerStore()
  const stats = player.regionStats[regionId]
  const now = Date.now()
  return deriveProsperity({
    totalWins: stats?.totalFights ?? 0,
    hasSuppressed: player.suppressedRegions.includes(regionId),
    suppressedAt: stats?.lastUpdateAt,
    lastActivityAt: stats?.lastUpdateAt ?? now,
    now
  })
}

/** 今日是否已在某区域带罪血战(供 AdventureView 显示「宿敌」标注) */
export function nemesisFor(nemeses: NemesisRecord[], enemyId: string): NemesisRecord | undefined {
  return nemeses.find(n => n.enemyId === enemyId)
}

// ============ 宿敌残魂(Phase 31.4)============

/** 残魂再现概率(低,3%) */
export const ECHO_GHOST_CHANCE = 0.03

/**
 * 宿敌残魂:已雪耻的宿敌以"历史形态"再现。
 * 纯叙事:改变战报前缀与敌人名冠("残魂"字样),不改属性与奖励。
 * 每次遭遇独立判定,低概率。
 */
export function ghostOf(nemeses: NemesisRecord[], enemyId: string): NemesisRecord | null {
  const n = nemeses.find(x => x.enemyId === enemyId)
  // 只有已雪耻(avengedAt)的宿敌才有残魂形态
  if (!n || n.avengedAt === undefined) return null
  return n
}

/** 残魂战报前缀(叙事) */
export function ghostTitle(n: NemesisRecord): string {
  return `残魂·${n.enemyName}`
}

/** 残魂引导语 (战报第一行前) */
export function ghostLeadIn(n: NemesisRecord): string {
  return `你曾${n.lossCount}败于此,又将此敌斩于剑下。如今一道残魂再度拦路——它似乎仍记得你。`
}
