/**
 * 修行身份 / 道途画像(Phase 31.2)
 *
 * 边界(关键设计):
 *   身份 = 历史行为的归纳 —— 不是玩家主动选择的职业标签
 *   三层:
 *     根因  你经历过什么(fortuneChoices / mentor / daoPath / gongfaBranch)
 *     倾向  你长期如何选择(quests 计数器 / 流派 / 灵兽)
 *     称谓  世界如何描述你(派生称号,纯叙事)
 *   无数值加成 · 无新资源 · 无等级 · 不反过来决定玩法
 */
import type { MentorId } from '@/data/mentors'
import { mentorDef } from '@/data/mentors'
import { daoPathDef } from '@/data/endgame'
import { detectBuild } from './buildDetect'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { useEndgameStore } from '@/stores/endgame'
import { useCultivationStore } from '@/stores/cultivation'
import { gongfaBranchDef } from '@/data/gongfaBranches'

export interface IdentityRoots {
  /** 机缘印记:取过的机缘(最多 3 条) */
  fortunes: { id: string; title: string }[]
  /** 师承 */
  mentor: { name: string; title: string } | null
  /** 道途 */
  daoPath: string | null
  /** 功法分支(最多 2 条) */
  branches: string[]
  /** 灵兽性格倾向 */
  petTemp: string | null
  /** 当前流派 */
  build: string | null
}

export interface IdentityTraits {
  /** 行为特征词 */
  adjectives: string[]
  /** 风险倾向(签名时取"勇"字表) */
  riskBias: 'gamble' | 'steady' | null
  /** 总击杀 / 总探索 / 总突破(归一化问候) */
  counters: { kills: number; explores: number; breakthroughs: number }
}

export interface CultivatorIdentity {
  roots: IdentityRoots
  traits: IdentityTraits
  /** 称谓(世界如何描述你,2~6 字) */
  epithet: string
  /** 一句话修行叙事 */
  narrative: string
}

const FORTUNE_TITLES: Record<string, string> = {
  ft_sword_remnant: '剑痕悟道',
  ft_ancient_elixir: '丹方得承',
  ft_beast_pledge: '妖兽认主',
  ft_reclusive_elder: '隐世点拨',
  ft_blood_contract: '秘术染尘'
}

const MENTOR_EPITHETS: Record<MentorId, string> = {
  swordsman: '剑心',
  alchemist: '丹心',
  arraymaster: '阵心',
  hunter: '猎心'
}

const DAO_EPITHETS: Record<string, string> = {
  sword: '问剑',
  longevity: '长生',
  fate: '天机',
  slaughter: '杀伐'
}

export function buildIdentity(): CultivatorIdentity {
  const player = usePlayerStore()
  const quests = useQuestsStore()
  const endgame = useEndgameStore()
  const cultivation = useCultivationStore()

  // ---- 根因 ----
  const fortunes = Object.entries(player.fortuneChoices)
    .filter(([, c]) => c === 'take')
    .slice(0, 3)
    .map(([id]) => ({ id, title: FORTUNE_TITLES[id] ?? '机缘' }))

  const mentor = player.mentor ? (mentorDef(player.mentor) ?? null) : null

  // 功法分支名(最多 2 条)
  const branches = Object.values(cultivation.gongfaBranch)
    .map(id => gongfaBranchDef(id)?.name)
    .filter((x): x is string => x !== undefined)
    .slice(0, 2)

  // ---- 倾向 ----
  const build = detectBuild(player.finalStats.mods)
  const adjectives: string[] = []
  if (build) adjectives.push(build.style.name.replace('流', ''))
  if (mentor) adjectives.push(mentor.name)
  if (build?.secondary) adjectives.push(`${build.secondary.style.name.replace('流', '')}辅`)
  // 风险倾向:以击杀/突破占比推断(攻坚型 vs 稳扎型)
  const kills = quests.counter('kills')
  const explores = quests.counter('explores')
  const breakthroughs = quests.counter('breakthroughs')
  const riskBias: 'gamble' | 'steady' | null = kills + explores + breakthroughs > 0 ? (kills >= explores * 2 ? 'gamble' : 'steady') : null

  // ---- 称谓 ----
  const daoKey = endgame.daoPath
  // 道途一律先转成中文名再往下传:叙事句和画像面板必须同一份文案,
  // 否则会写出「行slaughter」这种把内部 id 漏给玩家的句子
  const daoName = daoKey ? (daoPathDef(daoKey)?.name ?? null) : null
  const daoEpi = daoKey ? (DAO_EPITHETS[daoKey] ?? '问道') : null
  const mentorEpi = mentor ? MENTOR_EPITHETS[mentor.id] : null
  const epithet = [daoEpi, mentorEpi].filter(Boolean).slice(0, 2).join('') || '云隐散人'

  const narrative = buildNarrative(
    { fortunes, mentor, daoPath: daoName, build: build?.displayName ?? null, branches },
    adjectives,
    riskBias
  )

  return {
    roots: {
      fortunes,
      mentor: mentor ? { name: mentor.name, title: mentor.title } : null,
      daoPath: daoName,
      branches,
      petTemp: player.petId ? '随行' : null,
      build: build?.displayName ?? null
    },
    traits: { adjectives, riskBias, counters: { kills, explores, breakthroughs } },
    epithet,
    narrative
  }
}

function buildNarrative(
  roots: {
    fortunes: { title: string }[]
    mentor: { name: string } | null
    daoPath: string | null
    build: string | null
    branches: string[]
  },
  adjectives: string[],
  riskBias: 'gamble' | 'steady' | null
): string {
  const parts: string[] = []
  if (roots.fortunes.length > 0) parts.push(`曾${roots.fortunes.map(f => f.title).join('、')}`)
  if (roots.mentor) parts.push(`师从${roots.mentor.name}`)
  if (roots.daoPath) parts.push(`行${roots.daoPath}`)
  if (roots.build) parts.push(`以${roots.build}立身`)
  if (roots.branches.length > 0) parts.push(`悟至${roots.branches.join('、')}`)
  if (riskBias === 'gamble') parts.push('偏好以险求胜')
  if (riskBias === 'steady') parts.push('稳扎稳打,不贪冒进')
  const core = parts.length > 0 ? parts.join(',') : '足迹尚浅,江湖初见。'
  return adjectives.length > 0
    ? `${core}。诸事观之,此修士${adjectives.join('与')}之相已现。`
    : `${core}。`
}
