/** 凡界世界的验收门:四门各自设线,任何一项不达标即弃用;不可用综合分数掩盖关键维度缺失 */
import {
  type MortalAudit,
  type MortalWorld,
  auditMortalWorld,
  auditMortalWorldAsync,
  generateMortalWorld,
  mortalNovelty
} from './mortalWorldGen'
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

/** 逐门评估;每一门返回自己的原始读数 */
export function evaluateGates(w: MortalWorld, history: MortalWorld[], runs = 10): GateReport {
  return buildGateReport(w, history, auditMortalWorld(w, runs))
}

/** 分块版:审计本身按构筑分块让出主线程,判定逻辑与同步版共用 buildGateReport */
async function evaluateGatesAsync(w: MortalWorld, history: MortalWorld[], runs = 10): Promise<GateReport> {
  return buildGateReport(w, history, await auditMortalWorldAsync(w, runs))
}

function buildGateReport(w: MortalWorld, history: MortalWorld[], audit: MortalAudit): GateReport {
  const gates: GateResult[] = [
    { name: '结构新颖', value: mortalNovelty(w, history), floor: GATES.structural, passed: false },
    { name: '可行构筑', value: audit.viable, floor: GATES.viable, passed: false },
    // 最强胜率是上限门,方向相反:折算成余量「上限 - 实际」
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
  /** 各门的否决次数 */
  rejectionsByGate: Record<string, number>
}


/**
 * 分块异步版:与 generateGatedMortal 同一内核,同参结果逐位一致。
 *
 * 每验完一个候选就让出一次主线程。实测单个候选(五门审计)约 15~50ms,
 * 而 maxTries 到 200 时整趟最坏 151ms、实测玩家首次进「界域志」时量到 230ms 的长任务。
 * 同步跑等于切页那一帧整页僵住。
 */
export async function generateGatedMortalAsync(
  baseSeed: number,
  history: MortalWorld[] = [],
  maxTries = 300,
  runs = 10,
  opts: { shouldStop?: () => boolean } = {}
): Promise<GatedWorld | null> {
  const rejectionsByGate: Record<string, number> = {}
  for (let t = 0; t < maxTries; t += 1) {
    if (opts.shouldStop?.()) return null
    const world = generateMortalWorld(baseSeed + t * 7919)
    const report = await evaluateGatesAsync(world, history, runs)
    if (report.passed) return { report, rejected: t, rejectionsByGate }
    for (const f of report.failed) rejectionsByGate[f] = (rejectionsByGate[f] ?? 0) + 1
    await new Promise(res => setTimeout(res, 0))
  }
  return null
}


/** 反例检验:若把新颖各门平均成一个总分,它会不会通过 */
export function wouldPassWithAverage(report: GateReport): boolean {
  const noveltyGates = report.gates.filter(g => g.name !== '可行构筑' && g.name !== '非必胜')
  const avg = noveltyGates.reduce((s, g) => s + g.value, 0) / noveltyGates.length
  return avg >= GATES.structural
}
