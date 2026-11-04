/** 师承服务:按 quests 计数器判断与师承理念的契合度。纯叙事,无惩罚;师承词条并入 finalStats(较轻,不封 Build)。 */
import type { MentorId } from '@/data/mentors'
import { MENTORS, mentorDef } from '@/data/mentors'
import { useQuestsStore } from '@/stores/quests'

/**
 * 契合档:超过均分 → 契合;最多的是自己的两倍以上 → 未纯;其间中正。
 * 档位由**份额的相对位置**定,不靠一个越堆越大的绝对分。
 * 均分 = 1 / 门的数量,是算出来的,不是手挑的门槛。
 */
export type MentorTier = 'aligned' | 'neutral' | 'unaligned'

export interface MentorVerdict {
  mentor: ReturnType<typeof mentorDef>
  /**
   * 这一门占你全部作为的份额,0~1。四门之和为 1,故四门可横向比。
   *
   * 旧实现是「加权计数 ÷ 常数」再钳到 ±1:计数器只增、权重全正,式子只能得非负值,
   * `affinity < −0.2` 的「未纯」永远打不出来(四段 unaligned 叙事是死内容);
   * 而中后期三个门全被钳到 +1.00 —— 原始分 8.69 / 2.55 / 7.27 的差别一点不剩。
   * 份额天然有界、可比,且四门不可能同时为 1。
   */
  share: number
  tier: MentorTier
  /** 叙事的师尊评价 */
  line: string
  /** 行为特征(供人物页展示) */
  traits: { name: string; value: number }[]
}

/** 与最多的那门差一倍以上即判未纯 */
export const UNALIGNED_RATIO = 2

/** 各师承的行为权重:计数器 → 该门的分量。只作门内的相对轻重,不跨门兑换 */
const MENTOR_WEIGHTS: Record<MentorId, Partial<Record<string, number>>> = {
  swordsman: { kills: 1, bossKills: 2, breakthroughs: 0.5 },
  alchemist: { pillsCrafted: 1, pillsUsed: 1 },
  arraymaster: { buildingUpgrades: 0.4, offlineClaims: 0.5 },
  hunter: { explores: 1, equipsGained: 1, events: 0.5 }
}

/** 某一门的加权作为;只读计数器,不落库 */
function domainStrength(mentorId: MentorId, counter: (key: never) => number): number {
  let sum = 0
  for (const [key, w] of Object.entries(MENTOR_WEIGHTS[mentorId])) {
    if (!w) continue
    const v = counter(key as never)
    if (Number.isFinite(v) && v > 0) sum += v * w
  }
  return sum
}

/** 判别契合度:先算四门各占多少,再看这一门站在什么位置 */
export function mentorVerdict(mentorId: MentorId | null): MentorVerdict | null {
  if (!mentorId) return null
  const quests = useQuestsStore()
  const def = mentorDef(mentorId)
  if (!def) return null

  const counter = (key: never): number => quests.counter(key)
  const strengths = MENTORS.map(m => domainStrength(m.id, counter))
  const mine = domainStrength(mentorId, counter)
  const total = strengths.reduce((a, b) => a + b, 0)
  const max = Math.max(...strengths)
  const share = total > 0 ? mine / total : 0
  const tier = mentorTierOf(share, total > 0 ? max / total : 0, MENTORS.length)

  const line =
    tier === 'aligned' ? def.narrative.aligned : tier === 'unaligned' ? def.narrative.unaligned : '师尊不语,只是看着你。'

  return {
    mentor: def,
    share,
    tier,
    line,
    traits: [
      { name: '杀伐', value: quests.counter('kills') },
      { name: '历练', value: quests.counter('explores') },
      { name: '丹道', value: quests.counter('pillsCrafted') }
    ]
  }
}

/**
 * 份额 → 档位。判据只看四门的**相对位置**,不看绝对量:
 * 前期杀十只妖与后期杀十万只,只要都只做这一门,就该得到同一句评价。
 *
 * @param share 本门份额 0~1
 * @param topShare 四门中最大份额 0~1
 * @param domains 门的数量(均分 = 1/domains)
 */
export function mentorTierOf(share: number, topShare: number, domains: number): MentorTier {
  if (!(topShare > 0) || !Number.isFinite(share) || share <= 0) {
    // 一件可数的事都还没有:不判档
    return topShare > 0 ? 'unaligned' : 'neutral'
  }
  // 超过均分才算专精:四门各 25% 时说哪一门都不算数
  const even = domains > 0 ? 1 / domains : 1
  if (share > even) return 'aligned'
  if (topShare >= share * UNALIGNED_RATIO) return 'unaligned'
  return 'neutral'
}

/** 四门之中份额最大的那一门:拜师弹窗按它把四门排成一把可比的尺 */
export function mentorTopShare(): number {
  const quests = useQuestsStore()
  const counter = (key: never): number => quests.counter(key)
  return Math.max(...MENTORS.map(m => domainStrength(m.id, counter)))
}

/** 可选师承列表(人物页展示用) */
export function mentorChoices(): NonNullable<ReturnType<typeof mentorDef>>[] {
  return MENTORS.map(m => mentorDef(m.id)).filter((x): x is NonNullable<typeof x> => x !== undefined)
}
