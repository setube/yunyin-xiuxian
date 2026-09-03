/**
 * 凡界世界的验收门 —— 四门独立,不可互相抵消
 *
 * ## 为什么不是一个总分
 *
 * 上一轮亲手证明了综合平均的失效方式:地界名距离 0.81、首领名 0.87
 * 把恒为 0 的路线形状与事件密度整个吃掉,总分仍是 0.49「看起来很新」。
 *
 * 于是定下生成器的设计原则:
 *
 *   **不可用综合分数掩盖关键维度缺失。**
 *
 * 四项各自设线,任何一项不达标即弃用,不允许高分维度补偿:
 *
 *   结构新颖度      ≥ 0.25   规则 / 敌人机制 / 生态位
 *   解法空间        ≥ 3      可行构筑数,且无接近必胜
 *   路线骨架新颖度  ≥ 0.30   走几段、每段跨多大、地貌怎么排
 *   事件节奏差异    ≥ 0.30   什么时候忙、什么时候闲
 *
 * 后两项管的是玩家的重复感,前两项管的是系统的解法空间 ——
 * 两者不是同一个东西,不该合成一个数。
 */
import { type MortalAudit, type MortalWorld, auditMortalWorld, generateMortalWorld, mortalNovelty } from './mortalWorldGen'
import { rhythmNovelty, skeletonNovelty } from './mortalIdentity'

/** 各门的最低线 */
export const GATES = {
  /** 结构新颖度(承袭天界 NOVELTY_MIN) */
  structural: 0.25,
  /** 可行构筑数 */
  viable: 3,
  /** 最强构筑胜率上限 */
  topMax: 0.97,
  /** 路线骨架新颖度 */
  skeleton: 0.3,
  /** 事件节奏差异 */
  rhythm: 0.3
} as const

export interface GateResult {
  name: string
  value: number
  floor: number
  passed: boolean
}

export interface GateReport {
  world: MortalWorld
  audit: MortalAudit
  gates: GateResult[]
  /** 全部通过才算过审 */
  passed: boolean
  /** 未通过的门 */
  failed: string[]
}

/**
 * 逐门评估。
 *
 * 注意每一门都返回自己的原始读数 —— 报告里能看到
 * 「哪一门差多少」,而不是只看到一个通过与否
 */
export function evaluateGates(w: MortalWorld, history: MortalWorld[], runs = 10): GateReport {
  const audit = auditMortalWorld(w, runs)
  const gates: GateResult[] = [
    { name: '结构新颖', value: mortalNovelty(w, history), floor: GATES.structural, passed: false },
    { name: '可行构筑', value: audit.viable, floor: GATES.viable, passed: false },
    // 最强胜率是上限门,方向相反:用「上限 - 实际」折算成余量
    { name: '非必胜', value: GATES.topMax - audit.top, floor: 0, passed: false },
    { name: '路线骨架', value: skeletonNovelty(w, history), floor: GATES.skeleton, passed: false },
    { name: '事件节奏', value: rhythmNovelty(w, history), floor: GATES.rhythm, passed: false }
  ].map(g => ({ ...g, passed: g.value >= g.floor }))
  // 首领生态不合直接否决,与新颖无关
  const ecology = audit.bossFits
  const failed = gates.filter(g => !g.passed).map(g => g.name)
  if (!ecology) failed.push('首领生态')
  return { world: w, audit, gates, passed: failed.length === 0, failed }
}

export interface GatedWorld {
  report: GateReport
  /** 被弃用的候选数 */
  rejected: number
  /** 各门的否决次数统计 —— 看哪一门在真正起作用 */
  rejectionsByGate: Record<string, number>
}

/**
 * 生成一个过四门的凡界。
 *
 * 返回否决统计:若某一门从未否决过任何候选,说明它形同虚设 ——
 * 这正是上一轮「新颖度门累计弃用 0」暴露的问题
 */
export function generateGatedMortal(
  baseSeed: number,
  history: MortalWorld[] = [],
  maxTries = 300,
  runs = 10
): GatedWorld | null {
  const rejectionsByGate: Record<string, number> = {}
  for (let t = 0; t < maxTries; t += 1) {
    const world = generateMortalWorld(baseSeed + t * 7919)
    const report = evaluateGates(world, history, runs)
    if (report.passed) return { report, rejected: t, rejectionsByGate }
    for (const f of report.failed) rejectionsByGate[f] = (rejectionsByGate[f] ?? 0) + 1
  }
  return null
}

/** 连续生成 n 个过四门的凡界 */
export function generateGatedSeries(n: number, baseSeed = 20260904, runs = 10): GatedWorld[] {
  const out: GatedWorld[] = []
  const history: MortalWorld[] = []
  for (let i = 0; i < n; i += 1) {
    const got = generateGatedMortal(baseSeed + i * 104729, history, 300, runs)
    if (!got) break
    out.push(got)
    history.push(got.report.world)
  }
  return out
}

/**
 * 反例检验:一个「结构很新但骨架照抄」的世界应当被拒。
 *
 * 这是四门独立最重要的保证 —— 高分维度不得补偿低分维度
 */
export function wouldPassWithAverage(report: GateReport): boolean {
  // 若按旧口径把各门平均成一个总分,它会不会通过
  const noveltyGates = report.gates.filter(g => g.name !== '可行构筑' && g.name !== '非必胜')
  const avg = noveltyGates.reduce((s, g) => s + g.value, 0) / noveltyGates.length
  return avg >= GATES.structural
}
