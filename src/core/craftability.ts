/**
 * 可炼程度(Phase 32.3)—— 取代「炼丹等级 ≥ 丹药等级」的二元门槛
 *
 * 旧口径:够级 → 必定成功;不够级 → 连方子都看不见。
 * 新口径:知识 × 技艺 × 材料 × 承受 → 成功率 / 产量 / 阻碍。
 *
 * 唯一的硬门槛是「你根本不知道有这张方子」。除此之外一律软化:
 * 高出承受四阶的方子照样能开炉,只是成功率个位数——赌不赌是玩家的事。
 */
import type { PillDef } from '@/types'
import { LORE_MAX, materialDef } from '@/data/materials'
import { recipeCraft, skillDef, type RecipeCraft, type SkillId } from '@/data/crafting'
import { pillDef, PILLS } from '@/data/pills'
import { useLoreStore } from '@/stores/lore'
import { usePlayerStore } from '@/stores/player'

/** 各项皆满且同阶时的成功率上限 —— 余下的是天意 */
export const CRAFT_BASE_RATE = 0.95

export interface Craftability {
  recipeId: string
  /** 丹方阶位 */
  rank: number
  /** 丹方掌握度 0~1 */
  mastery: number
  /** 方中灵材的平均认知度 0~1 */
  materialLore: number
  /** 这张方子加权后的技艺水平 0~100 */
  skill: number
  /** 自身修为可承受的阶位 */
  bearableRank: number
  /** 超规格阶数(>0 即为强炼) */
  overReach: number
  successRate: number
  /** 成功时多得一枚的概率 */
  bonusChance: number
  /** 开不了炉的硬阻碍 */
  blockers: string[]
  /** 压低成功率的软因素,人话 */
  weakness: string[]
  materials: readonly string[]
}

/** 修为可承受的丹方阶位:练气可稳承一阶,每高一境多一阶 */
export function bearableRank(major: number): number {
  return major + 1
}

/**
 * 超规格惩罚。不是禁止,是陡峭——
 * 高一阶还有六成把握,高四阶就只剩一线生机了。
 */
export function overReachFactor(over: number): number {
  if (over <= 0) return 1
  const TABLE = [1, 0.6, 0.35, 0.18]
  return over < TABLE.length ? TABLE[over]! : 0.18 * Math.pow(0.45, over - 3)
}

/** 方中灵材的平均认知度(0~1) */
export function materialLoreOf(materials: readonly string[], loreOf: (id: string) => number): number {
  if (materials.length === 0) return 1
  const sum = materials.reduce((acc, id) => acc + Math.min(LORE_MAX, loreOf(id)) / LORE_MAX, 0)
  return sum / materials.length
}

/** 按丹方的技艺权重加权求和(0~100) */
export function weightedSkill(craft: RecipeCraft, levelOf: (id: SkillId) => number): number {
  let total = 0
  let weight = 0
  for (const [k, w] of Object.entries(craft.skills)) {
    if (w === undefined) continue
    total += levelOf(k as SkillId) * w
    weight += w
  }
  return weight > 0 ? total / weight : 0
}

/**
 * 合成成功率。四个乘区各有下限——
 * 任何一项都不会把成功率直接归零,但四项全弱时结果自然低到不该开炉。
 */
export function composeSuccessRate(mastery: number, matLore: number, skill: number, over: number): number {
  const masteryFactor = 0.22 + 0.78 * Math.max(0, Math.min(1, mastery))
  const loreFactor = 0.42 + 0.58 * Math.max(0, Math.min(1, matLore))
  const skillFactor = 0.3 + 0.7 * Math.max(0, Math.min(1, skill / 100))
  return CRAFT_BASE_RATE * masteryFactor * loreFactor * skillFactor * overReachFactor(over)
}

function weaknessLines(c: {
  mastery: number
  matLore: number
  skill: number
  over: number
  craft: RecipeCraft
  loreOf: (id: string) => number
  levelOf: (id: SkillId) => number
}): string[] {
  const out: string[] = []
  if (c.mastery < 0.35) out.push('丹方只记得个大概,火候节点全靠猜。')
  else if (c.mastery < 0.7) out.push('丹方尚未烂熟于心,关键几步还要现想。')

  const unknown = c.craft.materials.filter(id => c.loreOf(id) < 1)
  if (unknown.length > 0) {
    out.push(`方中有 ${unknown.length} 味药你还叫不出名字。`)
  } else {
    const shallow = c.craft.materials.filter(id => c.loreOf(id) < LORE_MAX)
    if (shallow.length > 0) {
      const names = shallow.map(id => materialDef(id)?.name).filter(Boolean).slice(0, 2)
      out.push(`${names.join('、')}的用法你只知其一。`)
    }
  }

  // 找这张方子最吃重、而你最弱的那项技艺,用它自己的话说
  let worst: { id: SkillId; score: number } | null = null
  for (const [k, w] of Object.entries(c.craft.skills)) {
    if (w === undefined) continue
    const id = k as SkillId
    const score = (100 - c.levelOf(id)) * w
    if (worst === null || score > worst.score) worst = { id, score }
  }
  if (worst && c.levelOf(worst.id) < 55) {
    const def = skillDef(worst.id)
    if (def) out.push(`${def.name}不足:${def.lackText}`)
  }

  if (c.over > 0) out.push(`此方高出你能承受的 ${c.over} 阶,强炼是在赌命。`)
  return out
}

/** 计算一张丹方当前的可炼程度;非可炼丹方返回 null */
export function craftability(id: string): Craftability | null {
  const def = pillDef(id)
  if (!def) return null
  const craft = recipeCraft(def)
  if (!craft) return null

  const lore = useLoreStore()
  const player = usePlayerStore()
  const loreOf = (mid: string): number => lore.loreOf(mid)
  const levelOf = (sid: SkillId): number => lore.skillLevel(sid)

  const mastery = lore.recipeMastery(id)
  const matLore = materialLoreOf(craft.materials, loreOf)
  const skill = weightedSkill(craft, levelOf)
  const bearable = bearableRank(player.major)
  const over = Math.max(0, craft.rank - bearable)

  const blockers: string[] = []
  if (mastery <= 0) blockers.push('尚未得此丹方')

  return {
    recipeId: id,
    rank: craft.rank,
    mastery,
    materialLore: matLore,
    skill,
    bearableRank: bearable,
    overReach: over,
    successRate: composeSuccessRate(mastery, matLore, skill, over),
    bonusChance: Math.min(0.5, mastery * 0.18 + skill / 500),
    blockers,
    weakness: blockers.length > 0 ? [] : weaknessLines({ mastery, matLore, skill, over, craft, loreOf, levelOf }),
    materials: craft.materials
  }
}

/** 已知的丹方(掌握度 >0)。这是"你听说过什么",不是"你够不够级" */
export function knownRecipes(): PillDef[] {
  const lore = useLoreStore()
  return PILLS.filter(p => p.recipe && lore.recipeMastery(p.id) > 0)
}
