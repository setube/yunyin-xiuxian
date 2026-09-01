/**
 * 师承服务(Phase 31.0 S1)
 *
 * 师尊评价:根据玩家真实行为(quests 计数器)判断与师承理念的契合度。
 * 纯叙事,无惩罚:契合→「剑心渐明」,相左→「剑意未纯」。
 * 师承词条并入 finalStats(较轻,不封 Build)。
 */
import type { MentorId } from '@/data/mentors'
import { mentorDef, MENTORS } from '@/data/mentors'
import { useQuestsStore } from '@/stores/quests'

export interface MentorVerdict {
  mentor: ReturnType<typeof mentorDef>
  /** 契合度 -1~1
   *  >0.2 契合;<-0.2 未纯;其间 中正 */
  affinity: number
  /** 叙事的师尊评价 */
  line: string
  /** 归一化的行为特征(供人物页展示) */
  traits: { name: string; value: number }[]
}

/** 各师承的行为权重:计数器 → 该师承的契合方向(负数 = 相左) */
const MENTOR_WEIGHTS: Record<MentorId, Partial<Record<string, number>>> = {
  swordsman: { kills: 1, bossKills: 2, breakthroughs: 0.5 },
  alchemist: { pillsCrafted: 1, pillsUsed: 1 },
  arraymaster: { buildingUpgrades: 0.4, offlineClaims: 0.5 },
  hunter: { explores: 1, equipsGained: 1, events: 0.5 }
}

/** 判别契合度:按师承权重对计数器归一化(加权和,阈值切档) */
export function mentorVerdict(mentorId: MentorId | null): MentorVerdict | null {
  if (!mentorId) return null
  const quests = useQuestsStore()
  const def = mentorDef(mentorId)
  if (!def) return null

  const weights = MENTOR_WEIGHTS[mentorId]
  let score = 0
  let total = 0
  for (const [key, w] of Object.entries(weights)) {
    if (!w) continue
    const v = quests.counter(key as never)
    score += v * (w as number)
    total += (w as number) ** 2
  }
  // 归一化到 -1~1(对后取 √,避免前期小数值过早饱和)
  const raw = score / Math.max(1, Math.sqrt(total) * 50)
  const affinity = Math.max(-1, Math.min(1, raw))

  let line: string
  if (affinity > 0.2) {
    line = def.narrative.aligned
  } else if (affinity < -0.2) {
    line = def.narrative.unaligned
  } else {
    line = '师尊不语,只是静静看着你。'
  }

  return {
    mentor: def,
    affinity,
    line,
    traits: [
      { name: '杀伐', value: quests.counter('kills') },
      { name: '历练', value: quests.counter('explores') },
      { name: '丹道', value: quests.counter('pillsCrafted') }
    ]
  }
}

/** 可选师承列表(人物页展示用) */
export function mentorChoices(): ReturnType<typeof mentorDef>[] {
  return MENTORS.map(m => mentorDef(m.id)).filter((x): x is NonNullable<typeof x> => x !== undefined)
}
