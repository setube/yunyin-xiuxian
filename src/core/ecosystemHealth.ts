/** 生态健康度:平衡指标汇成可跨版本比较的仪表盘;不替代红线断言 */
import { BUILD_PROFILES } from './buildSim'

export interface HealthInput {
  /** 各终局世界可行流派数(0~BUILD_PROFILES.length) */
  viablePerWorld: number[]
  /** 各世界 次优/最优 通率比(0~1) */
  secondOverBest: number[]
  /** 随机构筑万金油率(破墙) */
  universalRate: number
  /** 随机构筑陷阱率 */
  trapRate: number
  /** 跨界通吃构筑数(红线 ≤2) */
  crossWorldCount: number
  /** 二阶协同榜首(logit) */
  maxPairSynergy: number
}

export interface HealthPart {
  name: string
  /** 0~100 */
  score: number
  detail: string
}

export interface HealthReport {
  /** 0~100 加权总分 */
  score: number
  parts: HealthPart[]
}

const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

/** 跨界通吃红线:≤2 个算合格(见 celestialSim 的条件②) */
const CROSS_WORLD_RED_LINE = 2

/**
 * 红线型指标的打分:红线内满分,超出后每多一个线性扣,到 0 为止。
 * 不能用 1 - count/红线 —— 那样 1 个就掉到 67 分,把「合格」判成「不合格」。
 */
const scoreUnderRedLine = (count: number, redLine: number): number =>
  count <= redLine ? 1 : clamp01(1 - (count - redLine) / redLine)

export function computeEcosystemHealth(input: HealthInput): HealthReport {
  const diversity = clamp01(avg(input.viablePerWorld) / BUILD_PROFILES.length)
  const spread = clamp01(avg(input.secondOverBest))
  const universal = clamp01(1 - input.universalRate / 0.015)
  const trap = clamp01(1 - input.trapRate / 0.3)
  const cross = scoreUnderRedLine(input.crossWorldCount, CROSS_WORLD_RED_LINE)
  const synergy = clamp01(1 - Math.max(0, input.maxPairSynergy - 1) / 1.5)

  const parts: HealthPart[] = [
    { name: 'Build 多样性', score: Math.round(diversity * 100), detail: `平均可行 ${avg(input.viablePerWorld).toFixed(1)}/${BUILD_PROFILES.length}` },
    { name: '最优不独走', score: Math.round(spread * 100), detail: `次优/最优 ${Math.round(avg(input.secondOverBest) * 100)}%` },
    { name: '万金油抑制', score: Math.round(universal * 100), detail: `破墙率 ${(input.universalRate * 100).toFixed(1)}%(红线 1.5%)` },
    { name: '陷阱可控', score: Math.round(trap * 100), detail: `陷阱率 ${(input.trapRate * 100).toFixed(1)}%` },
    { name: '跨界受限', score: Math.round(cross * 100), detail: `跨界通吃 ${input.crossWorldCount} 个(红线 ${CROSS_WORLD_RED_LINE})` },
    { name: '协同温和', score: Math.round(synergy * 100), detail: `二阶榜首 ${input.maxPairSynergy.toFixed(2)}(红线 2.0)` }
  ]
  const score = Math.round(diversity * 25 + spread * 20 + universal * 20 + trap * 10 + cross * 15 + synergy * 10)
  return { score, parts }
}
