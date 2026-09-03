/**
 * 逆旅契动机审计
 *
 * 逆旅契已经完成技术验证:道果第一次真的会下降,且回路没被接回来。
 * 但它同时暴露出一个更深的问题 —— **不可复利 ≠ 有吸引力**。
 *
 * 四份契本质上是「玩家主动购买一个困难」。理性玩家只在
 * 「已经不缺道果 + 想挑战自己」时才会签。这本身没问题,
 * 但要先弄清一件事:
 *
 *   **它们到底创造了玩法变化,还是只是让数字变差?**
 *
 * 判据很硬:若签契后**最优构筑不变、排序不变**,只是全体胜率等比下降,
 * 那就是纯粹变难,没有新决策。这时该改的是契的玩法改变程度,
 * 而不是给它补奖励 —— 补奖励只会把刚刚切断的回路again接回来。
 *
 * 本模块只做度量,不改数值、不加任何奖励。
 */
import type { CombatRules } from '@/types'
import { mulberry32, RandomService } from '@/utils/random'
import { BUILD_PROFILES, ENEMY_ARCHETYPES, buildSnap, type BuildProfile } from './buildSim'
import { resolveCombat } from './combat'
import { LIFE_TRIALS, type LifeTrialDef } from '@/data/lifeTrials'

// ============ 一、在给定规则下评估构筑 ============

/**
 * 带规则的对战。
 *
 * buildSim.runMatchup 不接受 CombatRules,故在此复刻一份 ——
 * 唯一的差别就是把契约规则传进 resolveCombat
 */
function winRateUnder(profile: BuildProfile, archIdx: number, rules: CombatRules | undefined, n: number, seed: number): number {
  const arch = ENEMY_ARCHETYPES[archIdx]!
  const rng = new RandomService(mulberry32(seed))
  let wins = 0
  for (let i = 0; i < n; i += 1) {
    if (resolveCombat(buildSnap(profile), arch.snap(), rng, rules).win) wins += 1
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
  /** 在该规则下的排名(0 为最强) */
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
  /** 相对基线,各构筑胜率变化的差异度;接近 0 表示等比变难 */
  differential: number
}

/**
 * 度量一份契创造的差异。
 *
 * 两个关键量分开看:
 *   drop         变难了多少 —— 高 drop 只说明惩罚重
 *   rankShifts   决策变了没有 —— 这才是玩法价值的来源
 * 若 drop 高而 rankShifts 为 0,则契约只是罚款,不是玩法
 */
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

/**
 * 契约的玩法价值判定。
 *
 * `differential` 是核心:它衡量「各构筑受影响是否不均」。
 * 等比变难 → differential ≈ 0 → 玩家不需要改变任何选择,只是更难
 * 不均影响 → differential 大 → 某些构筑被针对,某些被抬起,产生真实取舍
 */
export type PlayValue =
  /** 改变了构筑排序,创造真实决策 */
  | 'reshapes'
  /** 影响不均但未改排序,有倾向性 */
  | 'tilts'
  /** 等比变难,纯罚款 */
  | 'flat'

export function playValueOf(im: TrialImpact, tiltThreshold = 0.02): PlayValue {
  if (im.rankShifts > 0) return 'reshapes'
  return im.differential >= tiltThreshold ? 'tilts' : 'flat'
}

// ============ 三、决策维度覆盖 ============

/**
 * 玩家在一世里会做的决策。
 *
 * 契约若只落在「战斗数值」一格,它就只能靠自我挑战支撑动机;
 * 落在越多格,越有可能让这一世真的**不一样**
 */
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
 * 逐契的决策维度覆盖。
 *
 * `build` 一格原本预期是空的 —— 直觉认为「全局乘区等比变难,构筑排序不动」。
 * 实测推翻了它:四份契**全部改变构筑排行**,最不均的一份让首尾构筑
 * 拉开 63.8pp。故契约不是纯罚款,它确实在战斗内部创造了取舍。
 *
 * 但 region/order/encounter/goal 四格确实一个都碰不到 ——
 * 四份契都只挂在 CombatRules 上,不改变探索路线、解锁顺序、
 * 遭遇构成与本世目标。
 *
 * 注意:这里的 `build` 是静态标注,由 spec 用实测结果校验一致性;
 * 若将来契约改到不再影响排序,标注与实测脱节会立刻变红
 */
export const AXIS_COVERAGE: AxisCoverage[] = LIFE_TRIALS.map(t => ({
  trialId: t.id,
  // record 与 node 是逆旅契本身带来的:履历一笔 + 立契这个决策点
  // build 由实测证实(见 spec 的一致性校验)
  axes: ['build', 'record', 'node'] as DecisionAxis[],
  evidence: `rules = ${JSON.stringify(t.rules)};改变构筑排序,但只作用于 resolveCombat,不触碰探索、解锁、目标`
}))

/** 四份契合计覆盖到的决策维度 */
export function coveredAxes(): DecisionAxis[] {
  const set = new Set<DecisionAxis>()
  for (const c of AXIS_COVERAGE) for (const a of c.axes) set.add(a)
  return [...set]
}

/** 一个决策维度都没碰到的那些 */
export function untouchedAxes(): DecisionAxis[] {
  const covered = new Set(coveredAxes())
  return (Object.keys(AXIS_NAMES) as DecisionAxis[]).filter(a => !covered.has(a))
}

// ============ 四、架构边界 ============

/**
 * 道果消费系统的核心约束(本次确立,供未来所有出口沿用)。
 *
 *   Rule Space                        可动
 *   StatMods / Economy / DaoFruit / Insight   不可动
 *
 * 这条边界允许相当大胆的内容 —— 「本世不得使用某类丹药」
 * 「本世只能带一件法宝」「本世探索路线受限」都改变玩法,
 * 却都不制造新的跨世成长闭环
 */
export const MUTABLE_SPACE = ['CombatRules', '探索路线', '可用物品', '解锁顺序', '本世目标'] as const
export const IMMUTABLE_SPACE = ['StatMods', 'Economy(资源)', 'DaoFruit', 'Insight(宿慧)'] as const

export { LIFE_TRIALS }
