/** 玩家身份与传奇:画像与叙事全部来自真实道痕统计,不能人工选择,不给任何属性 */
import type { DaoMark, DaoPathId } from '@/types'
import { DAO_PATHS, celestialWorldDef } from '@/data/endgame'
import { PACT_HEAVY_MULT, pactDef } from '@/data/pacts'
import { MILESTONE_DEFS, milestoneDef, RECORD_DEFS, type MilestoneDef, type RecordDef } from '@/data/identity'
import { usePlayerStore } from '@/stores/player'
import { useEndgameStore } from '@/stores/endgame'

// ---------- 修行节点:跨世「首次」 ----------

// 节点/纪录目录在 data/identity.ts,供 endgame store 读档校验
export { MILESTONE_DEFS, milestoneDef, RECORD_DEFS }
export type { MilestoneDef, RecordDef }

/** 记节点(以当前世数) */
export function recordMilestone(id: string): void {
  const endgame = useEndgameStore()
  const player = usePlayerStore()
  endgame.addMilestone(id, player.reincarnation.count + 1)
}

// ---------- 修行画像 ----------

export interface CultivatorProfile {
  /** 道途分布(有道痕的) */
  daoShares: { name: string; pct: number }[]
  riskText: string
  buildTendency: string
  favoriteBuild: string
  favoritePacts: string[]
  bestWorld: string | null
  weakWorld: string | null
  /** 一句克制的评价 */
  verdict: string
}

const mode = <T>(xs: T[]): T | undefined => {
  const count = new Map<T, number>()
  for (const x of xs) count.set(x, (count.get(x) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** 画像成形所需最少道痕数;界面「道痕未满 N 则」读此值,不手写 */
export const PROFILE_MIN_MARKS = 5

/** 从道痕生成画像;不足 PROFILE_MIN_MARKS 则返回 null */
export function cultivatorProfile(marks: DaoMark[]): CultivatorProfile | null {
  if (marks.length < PROFILE_MIN_MARKS) return null
  const daoCount = new Map<DaoPathId, number>()
  for (const m of marks) {
    if (m.daoPathId) daoCount.set(m.daoPathId, (daoCount.get(m.daoPathId) ?? 0) + 1)
  }
  const daoTotal = [...daoCount.values()].reduce((a, b) => a + b, 0) || 1
  const daoShares = DAO_PATHS.map(d => ({ name: d.name, pct: Math.round(((daoCount.get(d.id) ?? 0) / daoTotal) * 100) }))
    .filter(x => x.pct > 0)
    .sort((a, b) => b.pct - a.pct)

  const pactMarks = marks.filter(m => m.replay?.pactId)
  const pactRate = pactMarks.length / marks.length
  const avgMult = pactMarks.length ? pactMarks.reduce((s, m) => s + (pactDef(m.replay!.pactId!)?.sourceMult ?? 1), 0) / pactMarks.length : 1
  const riskScore = pactRate * avgMult
  const riskText = riskScore >= 1.2 ? '高' : riskScore >= 0.5 ? '中' : '低'

  const mixedRate = marks.filter(m => m.buildName.includes('·')).length / marks.length
  const buildTendency = mixedRate >= 0.6 ? '道路常杂糅' : mixedRate >= 0.25 ? '中度专精' : '一门深入'
  const favoriteBuild = mode(marks.map(m => m.buildName)) ?? '杂学'
  const favoritePacts = [...new Set(pactMarks.map(m => pactDef(m.replay!.pactId!)?.name).filter((x): x is string => !!x))].slice(0, 2)

  const byWorld = new Map<string, { name: string; clears: number; total: number }>()
  for (const m of marks) {
    if (!celestialWorldDef(m.targetId)) continue
    const e = byWorld.get(m.targetId) ?? { name: m.targetName, clears: 0, total: 0 }
    e.total += 1
    if (m.cleared) e.clears += 1
    byWorld.set(m.targetId, e)
  }
  const rated = [...byWorld.values()].filter(e => e.total >= 3).map(e => ({ name: e.name, rate: e.clears / e.total }))
  rated.sort((a, b) => b.rate - a.rate)
  const bestWorld = rated[0]?.name ?? null
  const weakWorld = rated.length >= 2 ? rated[rated.length - 1]!.name : null

  const topDao = daoShares[0]?.name ?? ''
  let verdict: string
  if (riskText === '高' && (topDao === '杀伐道' || topDao === '剑道')) verdict = '此修士常以险求胜,不喜久守。'
  else if (riskText === '高') verdict = '此修士惯与天道对赌,屡屡以身试劫。'
  else if (topDao === '长生道') verdict = '此修士善守善耗,以岁月为兵。'
  else if (topDao === '天机道') verdict = '此修士先算后战,少有莽行。'
  else if (mixedRate >= 0.6) verdict = '此修士万法皆涉,不肯困于一途。'
  else verdict = '此修士步步为营,道心沉稳。'

  return { daoShares, riskText, buildTendency, favoriteBuild, favoritePacts, bestWorld, weakWorld, verdict }
}

// ---------- 道途行为叙事 ----------

/** 本世行为叙事(仅叙事,无赏罚);本世道痕 <2 则不语 */
export function daoNarrative(daoId: DaoPathId | null, marks: DaoMark[], currentLife: number): string | null {
  if (!daoId) return null
  const thisLife = marks.filter(m => m.life === currentLife)
  if (thisLife.length < 2) return null
  const builds = new Set(thisLife.map(m => m.buildName))
  const pacted = thisLife.filter(m => m.replay?.pactId)
  const heavyPacts = pacted.filter(m => (pactDef(m.replay!.pactId!)?.sourceMult ?? 1) >= PACT_HEAVY_MULT)
  const canPacts = pacted.filter(m => m.replay!.pactId === 'can' || m.replay!.pactId === 'xue')

  switch (daoId) {
    case 'sword':
      return builds.size > 2 ? `这一世你已换过 ${builds.size} 条路数,剑心不拘一途。` : '一剑一世,道心如铁。'
    case 'longevity':
      return canPacts.length >= 2 ? `你曾 ${canPacts.length} 次以残躯血契求胜,所求不止长生。` : '你惜身如玉,确是长生之相。'
    case 'slaughter':
      return heavyPacts.length >= 2 ? `你曾 ${heavyPacts.length} 次主动接下天道重注,杀伐之名不虚。` : '此世杀伐尚温,刀锋未尽出鞘。'
    case 'fate':
      return pacted.length === 0 ? '天机在手,你从不凭未知下注。' : '窥得天机,仍去行险。'
  }
  return null
}

/** 天道纪元评说:道途卡下的一行 */
export function currentDaoNarrative(): string | null {
  const endgame = useEndgameStore()
  const player = usePlayerStore()
  return daoNarrative(endgame.daoPath, endgame.marks, player.reincarnation.count + 1)
}

// ---------- 极限纪录 ----------

/** 破界纪录打点(远征/重写共用):最快、最险、最厚 */
export function trackClearRecords(worldName: string, totalRounds: number, pactId: string | null, reward: number): void {
  const endgame = useEndgameStore()
  const player = usePlayerStore()
  const life = player.reincarnation.count + 1
  endgame.updateRecord('fastest_world', totalRounds, life, worldName, 'min')
  if (pactId) {
    const mult = pactDef(pactId)?.sourceMult ?? 1
    endgame.updateRecord('highest_pact', Math.round(mult * 10) / 10, life, `${worldName}·${pactDef(pactId)?.name ?? ''}`, 'max')
  }
  if (reward > 0) endgame.updateRecord('biggest_reward', reward, life, worldName, 'max')
}
