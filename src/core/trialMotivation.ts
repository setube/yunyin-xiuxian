/**
 * 逆旅契动机审计:签契后是改变构筑排序,还是只让胜率等比下降。只度量,不改数值、不加奖励。
 * 契动机不足时改玩法改变程度,不补奖励:补奖励会把已切断的回路接回来。
 */
import type { CombatRules } from '@/types'
import { mulberry32, RandomService } from '@/utils/random'
import { BUILD_PROFILES, ENEMY_ARCHETYPES, buildSnap, type BuildProfile } from './buildSim'
import { resolveCombat } from './combat'
import { LIFE_TRIALS, type LifeTrialDef } from '@/data/lifeTrials'

// ============ 一、在给定规则下评估构筑 ============

/** buildSim.runMatchup 的复刻,唯一差别是把契约规则传进 resolveCombat(runMatchup 不接受 CombatRules) */
function winRateUnder(profile: BuildProfile, archIdx: number, rules: CombatRules | undefined, n: number, seed: number): number {
  const arch = ENEMY_ARCHETYPES[archIdx]!
  const rng = new RandomService(mulberry32(seed))
  let wins = 0
  for (let i = 0; i < n; i += 1) {
    // 只读 .win,不必建战报
    if (resolveCombat(buildSnap(profile), arch.snap(), rng, rules, false).win) wins += 1
  }
  return wins / n
}

/** 某构筑对全部敌人原型的平均胜率 */
export function avgWinRate(profile: BuildProfile, rules: CombatRules | undefined, n = 60, seed = 33): number {
  let sum = 0
  for (let a = 0; a < ENEMY_ARCHETYPES.length; a += 1) {
    sum += winRateUnder(profile, a, rules, n, seed + a * 101)
  }
  return sum / ENEMY_ARCHETYPES.length
}

export interface BuildStanding {
  id: string
  name: string
  winRate: number
  /** 排名,0 为最强 */
  rank: number
}

/** 给定规则下的构筑排行 */
export function standings(rules: CombatRules | undefined, n = 60): BuildStanding[] {
  const rows = BUILD_PROFILES.map(p => ({ id: p.id, name: p.name, winRate: avgWinRate(p, rules, n) }))
  rows.sort((a, b) => b.winRate - a.winRate)
  return rows.map((r, i) => ({ ...r, rank: i }))
}

// ============ 二、契约造成的差异 ============

export interface TrialImpact {
  trial: LifeTrialDef
  /** 基线平均胜率 */
  baseWin: number
  /** 签契后的平均胜率 */
  trialWin: number
  /** 变难程度 */
  drop: number
  /** 排名改变的构筑数 */
  rankShifts: number
  /** 排名位移总量(曼哈顿距离) */
  rankDistance: number
  /** 最强构筑是否易主 */
  topChanged: boolean
  /** 受影响最大与最小的构筑(胜率变化差) */
  spread: number
  /** 各构筑胜率变化的差异度;接近 0 即等比变难 */
  differential: number
}

/** 度量一份契创造的差异;drop 高而 rankShifts 为 0 即只是罚款 */
export function trialImpact(trial: LifeTrialDef, n = 60): TrialImpact {
  const base = standings(undefined, n)
  const after = standings(trial.rules, n)
  const baseRank = new Map(base.map(b => [b.id, b.rank]))
  const baseWinOf = new Map(base.map(b => [b.id, b.winRate]))

  let shifts = 0
  let distance = 0
  const deltas: number[] = []
  for (const row of after) {
    const wasRank = baseRank.get(row.id)!
    if (wasRank !== row.rank) shifts += 1
    distance += Math.abs(wasRank - row.rank)
    deltas.push(row.winRate - baseWinOf.get(row.id)!)
  }
  const baseWin = base.reduce((s, b) => s + b.winRate, 0) / base.length
  const trialWin = after.reduce((s, b) => s + b.winRate, 0) / after.length
  const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length
  const differential = Math.sqrt(deltas.reduce((s, d) => s + (d - mean) ** 2, 0) / deltas.length)

  return {
    trial,
    baseWin,
    trialWin,
    drop: baseWin - trialWin,
    rankShifts: shifts,
    rankDistance: distance,
    topChanged: base[0]!.id !== after[0]!.id,
    spread: Math.max(...deltas) - Math.min(...deltas),
    differential
  }
}

/** 四份契的完整影响 */
export function allImpacts(n = 60): TrialImpact[] {
  return LIFE_TRIALS.map(t => trialImpact(t, n))
}

/** 契约的玩法价值档 */
export type PlayValue =
  /** 改变构筑排序 */
  | 'reshapes'
  /** 影响不均但未改排序 */
  | 'tilts'
  /** 等比变难 */
  | 'flat'

export function playValueOf(im: TrialImpact, tiltThreshold = 0.02): PlayValue {
  if (im.rankShifts > 0) return 'reshapes'
  return im.differential >= tiltThreshold ? 'tilts' : 'flat'
}

// ============ 三、决策维度覆盖 ============

/** 玩家一世里的决策维度 */
export type DecisionAxis =
  | 'build'
  | 'region'
  | 'order'
  | 'encounter'
  | 'goal'
  | 'record'
  | 'node'

export const AXIS_NAMES: Record<DecisionAxis, string> = {
  build: '改变构筑',
  region: '改变区域选择',
  order: '改变挑战顺序',
  encounter: '产生平时没有的战斗',
  goal: '改变这一世的目标',
  record: '产生新的历史记录',
  node: '增加新的决策节点'
}

export interface AxisCoverage {
  trialId: string
  axes: DecisionAxis[]
  evidence: string
}

/**
 * 逐契的决策维度覆盖(静态标注)。
 * build 由 spec 用实测校验:四份契全部改变构筑排行(首尾最大拉开 63.8pp)。
 * 契只挂在 CombatRules 上,碰不到 region/order/encounter/goal。
 */
export const AXIS_COVERAGE: AxisCoverage[] = LIFE_TRIALS.map(t => ({
  trialId: t.id,
  // record、node 来自立契本身:履历一笔 + 立契决策点
  axes: ['build', 'record', 'node'] as DecisionAxis[],
  evidence: `rules = ${JSON.stringify(t.rules)};改变构筑排序,但只作用于 resolveCombat,不触碰历练、解锁、目标`
}))

/** 四份契合计覆盖到的决策维度 */
export function coveredAxes(): DecisionAxis[] {
  const set = new Set<DecisionAxis>()
  for (const c of AXIS_COVERAGE) for (const a of c.axes) set.add(a)
  return [...set]
}

/** 未被任何契触及的决策维度 */
export function untouchedAxes(): DecisionAxis[] {
  const covered = new Set(coveredAxes())
  return (Object.keys(AXIS_NAMES) as DecisionAxis[]).filter(a => !covered.has(a))
}

// ============ 四、架构边界 ============

/** 道果消费出口的边界:Rule Space 可动;StatMods / Economy / DaoFruit / Insight 不可动 */
export const MUTABLE_SPACE = ['CombatRules', '历练路线', '可用物品', '解锁顺序', '本世目标'] as const
export const IMMUTABLE_SPACE = ['StatMods', 'Economy(资源)', 'DaoFruit', 'Insight(宿慧)'] as const

