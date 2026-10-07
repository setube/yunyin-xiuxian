/**
 * 玩家身份与传奇(Phase 28)—— 这到底是谁的修仙录
 * 画像与叙事全部来自真实道痕统计,不能人工选择,不给任何属性
 */
import type { DaoMark, DaoPathId } from '@/types'
import { DAO_PATHS, celestialWorldDef } from '@/data/endgame'
import { pactDef } from '@/data/pacts'
import { usePlayerStore } from '@/stores/player'
import { useEndgameStore } from '@/stores/endgame'

// ---------- 修行节点:跨世不灭的「首次」 ----------

export const MILESTONE_DEFS: { id: string; name: string; desc: string }[] = [
  { id: 'first_immortal', name: '飞升仙界', desc: '首次踏破人间界,飞升入仙' },
  { id: 'first_god', name: '破界入神', desc: '首次自仙界踏入神界' },
  { id: 'first_chaos', name: '归返混沌', desc: '首次踏入混沌海,重归大道本源' },
  { id: 'first_dao', name: '初立道途', desc: '于天穹之下立誓,择一道而行' },
  { id: 'first_world', name: '初破一界', desc: '首次踏破特殊规则世界' },
  { id: 'first_ni', name: '逆命破界', desc: '主流派核心尽封,仍以余技破界' },
  { id: 'first_wushang', name: '无伤全程', desc: '携无伤契走完全程,每战气血不失八成' },
  { id: 'first_qisha', name: '七杀功成', desc: '首次通过七杀试炼' },
  { id: 'first_void', name: '虚界行者', desc: '首次踏破天道织成的虚界' },
  { id: 'first_custom', name: '自立天道', desc: '亲手写下挑战书,并将其完成' },
  { id: 'first_daily', name: '应时而战', desc: '首次完成今日天道' },
  { id: 'first_rewrite', name: '胜于旧我', desc: '重写自己的历史道痕,快过当年' },
  { id: 'first_rebirth', name: '初入轮回', desc: '首次兵解转世,道果随神魂不灭' }
]

export function milestoneDef(id: string): (typeof MILESTONE_DEFS)[number] | undefined {
  return MILESTONE_DEFS.find(m => m.id === id)
}

/** 记节点(以当前世数) */
export function recordMilestone(id: string): void {
  const endgame = useEndgameStore()
  const player = usePlayerStore()
  endgame.addMilestone(id, player.reincarnation.count + 1)
}

// ---------- 修行画像:真实历史的统计肖像 ----------

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

/** 画像成形所需的最少道痕数 —— 界面上的「道痕未满 N 则」读这里,不手写 */
export const PROFILE_MIN_MARKS = 5

/** 从道痕生成画像;样本不足(不足 PROFILE_MIN_MARKS 则)返回 null */
export function cultivatorProfile(marks: DaoMark[]): CultivatorProfile | null {
  if (marks.length < PROFILE_MIN_MARKS) return null
  // 道途分布
  const daoCount = new Map<DaoPathId, number>()
  for (const m of marks) {
    if (m.daoPathId) daoCount.set(m.daoPathId, (daoCount.get(m.daoPathId) ?? 0) + 1)
  }
  const daoTotal = [...daoCount.values()].reduce((a, b) => a + b, 0) || 1
  const daoShares = DAO_PATHS.map(d => ({ name: d.name, pct: Math.round(((daoCount.get(d.id) ?? 0) / daoTotal) * 100) }))
    .filter(x => x.pct > 0)
    .sort((a, b) => b.pct - a.pct)

  // 风险偏好:签契占比 × 平均倍率
  const pactMarks = marks.filter(m => m.replay?.pactId)
  const pactRate = pactMarks.length / marks.length
  const avgMult = pactMarks.length ? pactMarks.reduce((s, m) => s + (pactDef(m.replay!.pactId!)?.sourceMult ?? 1), 0) / pactMarks.length : 1
  const riskScore = pactRate * avgMult
  const riskText = riskScore >= 1.2 ? '高' : riskScore >= 0.5 ? '中' : '低'

  // 构筑倾向:混合流派占比
  const mixedRate = marks.filter(m => m.buildName.includes('·')).length / marks.length
  const buildTendency = mixedRate >= 0.6 ? '道路常杂糅' : mixedRate >= 0.25 ? '中度专精' : '一门深入'
  const favoriteBuild = mode(marks.map(m => m.buildName)) ?? '杂学'
  const favoritePacts = [...new Set(pactMarks.map(m => pactDef(m.replay!.pactId!)?.name).filter((x): x is string => !!x))].slice(0, 2)

  // 最擅长 / 最薄弱世界(≥3 样本)
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

  // 一句评价:主导特征驱动的模板
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

// ---------- 道途行为评价:行为与所择之道之间的叙事 ----------

/** 本世行为叙事(仅叙事,无赏罚);本世道痕 <2 则不语 */
export function daoNarrative(daoId: DaoPathId | null, marks: DaoMark[], currentLife: number): string | null {
  if (!daoId) return null
  const thisLife = marks.filter(m => m.life === currentLife)
  if (thisLife.length < 2) return null
  const builds = new Set(thisLife.map(m => m.buildName))
  const pacted = thisLife.filter(m => m.replay?.pactId)
  const heavyPacts = pacted.filter(m => (pactDef(m.replay!.pactId!)?.sourceMult ?? 1) >= 2.5)
  const canPacts = pacted.filter(m => m.replay!.pactId === 'can' || m.replay!.pactId === 'xue')

  switch (daoId) {
    case 'sword':
      return builds.size > 2 ? `这一世你已换过 ${builds.size} 条路数——你的剑心并不执着于一途。` : '一剑一世,道心如铁。'
    case 'longevity':
      return canPacts.length >= 2 ? `你曾 ${canPacts.length} 次以残躯血契求胜——所谓长生,似乎并非你唯一所求。` : '你惜身如玉,确是长生之相。'
    case 'slaughter':
      return heavyPacts.length >= 2 ? `你曾 ${heavyPacts.length} 次主动接下天道重注,杀伐之名不虚。` : '此世杀伐尚温,刀锋未尽出鞘。'
    case 'fate':
      return pacted.length === 0 ? '你很少凭未知下注——天机在手,何必赌运。' : '窥天机而行险,亦是一种道。'
  }
  return null
}

/** 天道纪元评说:道途卡下的一行(需要至少一点历史) */
export function currentDaoNarrative(): string | null {
  const endgame = useEndgameStore()
  const player = usePlayerStore()
  return daoNarrative(endgame.daoPath, endgame.marks, player.reincarnation.count + 1)
}

// ---------- 极限纪录展示 ----------

export const RECORD_DEFS: { id: string; name: string; unit: string; better: 'min' | 'max' }[] = [
  { id: 'fastest_world', name: '最快破界', unit: '回合', better: 'min' },
  { id: 'highest_pact', name: '最高风险破界', unit: '×', better: 'max' },
  { id: 'biggest_reward', name: '单程最厚之赏', unit: '道源', better: 'max' },
  { id: 'best_custom', name: '挑战书最高赏格', unit: '道源', better: 'max' }
]

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

/** 供画像页显示道途名 */
