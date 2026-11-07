/**
 * 可炼程度:知识 × 技艺 × 材料 × 承受 → 成功率 / 产量 / 阻碍。
 * 唯一的硬门槛是不知道有这张方子;高出承受四阶照样能开炉,只是成功率个位数。
 */
import type { PillDef } from '@/types'
import { LORE_MAX, materialDef } from '@/data/materials'
import { recipeCraft, skillDef, type RecipeCraft, type SkillId } from '@/data/crafting'
import { pillDef, PILLS } from '@/data/pills'
import { PILL_SECOND_CAP } from '@/data/constants'
import { modOf } from './statsCalc'
import { useLoreStore } from '@/stores/lore'
import { usePlayerStore } from '@/stores/player'

/** 各项皆满且同阶时的成功率上限 */
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
  /** 含 alchemyYield(炉/丹心/称号等)的真实多得概率,与结算同一口径(封 0.8) */
  bonusChanceWithYield: number
  /** 开不了炉的硬阻碍 */
  blockers: string[]
  /** 压低成功率的软因素(短标签,开炉弹窗逐条列出) */
  weakness: string[]
  materials: readonly string[]
}

/** 修为可承受的丹方阶位 */
export function bearableRank(major: number): number {
  return major + 1
}

/** 超规格惩罚:不禁止,只陡峭 */
export function overReachFactor(over: number): number {
  if (over <= 0) return 1
  // 先取整再查表:签名收的是 number,而 TABLE 只认整数下标 ——
  // 传 1.5 时 `TABLE[1.5]` 是 undefined,`!` 会把它当有效值一路传进成功率算式。
  // 生产路径上 over = craft.rank - bearableRank(major) 恒为整数,这里是防接口误用。
  const n = Math.floor(over)
  const TABLE = [1, 0.6, 0.35, 0.18]
  return n < TABLE.length ? TABLE[n]! : 0.18 * Math.pow(0.45, n - 3)
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

/** 合成成功率:四个乘区各有下限,任何一项都不会把成功率直接归零 */
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
  craft: RecipeCraft
  loreOf: (id: string) => number
  levelOf: (id: SkillId) => number
}): string[] {
  const out: string[] = []
  if (c.mastery < 0.35) out.push('丹方生疏')
  else if (c.mastery < 0.7) out.push('丹方未熟')

  // 变量名避开 TS 内置类型名 unknown,与 tierChances 那处同一考虑
  const unknownIds = c.craft.materials.filter(id => c.loreOf(id) < 1)
  if (unknownIds.length > 0) {
    out.push(`${unknownIds.length} 味灵材未识`)
  } else {
    const shallow = c.craft.materials.filter(id => c.loreOf(id) < LORE_MAX)
    if (shallow.length > 0) {
      const names = shallow.map(id => materialDef(id)?.name).filter(Boolean).slice(0, 2)
      out.push(`${names.join('、')}未通晓`)
    }
  }

  // 方子最吃重、又最弱的那项技艺
  let worst: { id: SkillId; score: number } | null = null
  for (const [k, w] of Object.entries(c.craft.skills)) {
    if (w === undefined) continue
    const id = k as SkillId
    const score = (100 - c.levelOf(id)) * w
    if (worst === null || score > worst.score) worst = { id, score }
  }
  if (worst && c.levelOf(worst.id) < 55) {
    const def = skillDef(worst.id)
    if (def) out.push(`${def.name}不足`)
  }

  // 越阶不在这里另报:方子行头已有「越阶 N」标签
  return out
}

/**
 * 双丹(一炉得二)的基础概率,由熟练与技艺决定。
 *
 * 这里的 `Math.min(0.5, ...)` 是**死分支**:mastery∈[0,1]、skill∈[0,100] 时
 * 公式最大值只有 0.38,永远够不到 0.5。保留它只是防御越界入参。
 *
 * 真正生效的封顶在调用侧:`craftability().bonusChanceWithYield` 把本值加上
 * alchemyYield(丹心/丹圣/称号)后再按 PILL_SECOND_CAP(0.8) 钳一次 —— 那层才有用,
 * 因为 0.38 + 词条可以超过 0.8。写「封顶 0.5」会让人误以为双丹率到 0.5 就停,
 * 实际停在 0.8。本条与那个 0.8 是两层不同的限制,不可互换。
 */
export function bonusChanceOf(mastery: number, skill: number): number {
  return Math.min(0.5, mastery * 0.18 + skill / 500)
}

/**
 * 一张丹方当前的可炼程度;非可炼丹方返回 null。
 * `omitWeakness`:开炉结算从不读 weakness,跳过这块最重的计算。
 */
export function craftability(id: string, opts?: { omitWeakness?: boolean }): Craftability | null {
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
  if (mastery <= 0) blockers.push('未得方')

  return {
    recipeId: id,
    rank: craft.rank,
    mastery,
    materialLore: matLore,
    skill,
    bearableRank: bearable,
    overReach: over,
    successRate: composeSuccessRate(mastery, matLore, skill, over),
    bonusChance: bonusChanceOf(mastery, skill),
    // 只给 bonusChance 时,它为 0 而丹心有加成,双丹标签会消失;pillService.craftPill 直接读这里,封顶只此一处
    bonusChanceWithYield: Math.min(PILL_SECOND_CAP, bonusChanceOf(mastery, skill) + modOf(player.finalStats.mods, 'alchemyYield')),
    blockers,
    weakness:
      blockers.length > 0 || opts?.omitWeakness ? [] : weaknessLines({ mastery, matLore, skill, craft, loreOf, levelOf }),
    materials: craft.materials
  }
}

/** 已知的丹方(掌握度 >0),不论够不够级 */
export function knownRecipes(): PillDef[] {
  const lore = useLoreStore()
  return PILLS.filter(p => p.recipe && lore.recipeMastery(p.id) > 0)
}
