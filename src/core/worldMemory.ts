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
/**
 * 守土之年:镇压后「守得住」本身也该算数。
 *
 * 镇压一落地,该地就不再产出胜场 —— 于是繁盛(80 胜)只能在镇压**之前**刷出来,
 * 与「镇压后守多久」无关。这里补上时长一路:守满即成,不必先刷满。
 */
export const STABLE_HOURS = 6
export const FLOURISH_HOURS = 24
/** 无活动多长时间(小时)后,繁华短暂回落 */
export const DECAY_HOURS = 48
/** 镇压后无活动超过多少小时,区域开始复苏(自动解除镇压) */
export const REVIVE_AFTER_HOURS = 72

/** 镇压区域是否已进入复苏期(纯函数) */
export function isReviving(suppressedAt: number | undefined, now: number): boolean {
  if (suppressedAt === undefined) return false
  return (now - suppressedAt) / 3600_000 > REVIVE_AFTER_HOURS
}

/**
 * 距妖气复聚(镇压自动解除)还剩多少小时;未镇压或已过期返回 0。
 *
 * 复聚是确定的期限,却从不预告:玩家只会看到某天镇压「突然没了」。
 * 界面据此把期限写成倒计时(与 isReviving 同一个阈值,不另立一份)。
 */
export function hoursUntilRevive(suppressedAt: number | undefined, now: number = Date.now()): number {
  if (suppressedAt === undefined) return 0
  return Math.max(0, REVIVE_AFTER_HOURS - (now - suppressedAt) / 3600_000)
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
  // 守土时长:镇压后守了多久(与「打赢过多少场」是两条路)
  const heldHours = input.suppressedAt !== undefined ? (input.now - input.suppressedAt) / 3600_000 : 0
  let prosperity: RegionProsperity = 'chaos'
  // 镇压过才有资格谈「稳定/繁盛」;持续活动(或一直守着)才可维持
  if (input.hasSuppressed) {
    const alive = idleHours < DECAY_HOURS
    if (alive && (input.totalWins >= FLOURISH_WINS || heldHours >= FLOURISH_HOURS)) {
      prosperity = 'flourish'
    } else if (alive && (input.totalWins >= STABLE_WINS || heldHours >= STABLE_HOURS)) {
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
 * 镇压后的安定收益随繁荣度变化 —— 混乱 100% / 稳定 105% / 繁盛 110%。
 * 守满一日由混乱走到繁盛,约 +10%:仍属"轻"(产出大头在层级与时长),
 * 但"守得住"从此看得见回报,不再只是一个 ±2% 的装饰。
 */
export function prosperityYieldMult(p: RegionProsperity): number {
  switch (p) {
    case 'flourish':
      return 1.1
    case 'stable':
      return 1.05
    default:
      return 1.0
  }
}

// ============ S2: 宿敌记忆 ============

/** 标记为宿敌所需败北次数 */
export const NEMESIS_THRESHOLD = 3

/** 由敌人图鉴 id 组装宿敌记录(内部用;首次败北即 lossCount=1) */
function makeNemesis(enemyId: string, enemyName: string, regionId: string, now: number): NemesisRecord {
  return { enemyId, enemyName, regionId, lossCount: 1, lastLossAt: now }
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
    : { eventId, times: 1, lastAt: now, lastChoiceIdx: choiceIdx }
  return { ...memories, [eventId]: next }
}

/** 余波触发条件(纯函数):完成过一次即可触发(余波是回声,可反复) */
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
    // 「镇压后稳定多久」的起点是镇压时刻,suppressedSince;不能拿最近战斗时间 lastUpdateAt 充数
    // —— 否则镇压后继续刷战,`since` 会随战斗一路前移,「此地已稳定 N 小时」越算越短
    suppressedAt: player.suppressedSince[regionId],
    lastActivityAt: stats?.lastUpdateAt ?? now,
    now
  })
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
