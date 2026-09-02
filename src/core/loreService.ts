/**
 * 所知服务(Phase 32.3)—— 认知怎么长、技艺怎么长
 *
 * 设计要点:知识不靠点击"学习"按钮获得。
 * 它来自照面(采到过)、来自动手(炼过/砸过)、来自失手(炸过炉)、来自藏经阁的日夜翻检。
 * 因此这里没有一个叫 unlock() 的函数——只有 encounter / note / study。
 */
import { rng } from '@/utils/random'
import { LORE_MAX, materialDef, materialsNearRank, type MaterialBucket, type MaterialDef } from '@/data/materials'
import { recipeCraft, type SkillId } from '@/data/crafting'
import { pillDef, PILLS } from '@/data/pills'
import { useLoreStore } from '@/stores/lore'
import { useDongfuStore } from '@/stores/dongfu'
import { usePlayerStore } from '@/stores/player'
import { useUiStore } from '@/stores/ui'

/** 认知层 1→2 所需的照面次数 */
export const SEEN_FOR_NATURE = 4
/** 藏经阁每级每小时推进的丹方掌握度 */
export const STUDY_MASTERY_PER_HOUR = 0.006

// ============ 认知检定(纯函数,可独立测试) ============

/**
 * 辨识一味未知灵材的概率。
 * 材料阶位越高越难认,识材技艺越高越容易,照面次数给一点保底——
 * 见得够多,再迟钝的人也总有认出来的一天。
 */
export function discernChance(rank: number, discernLevel: number, seen: number): number {
  const base = 0.2 + discernLevel / 260 - (rank - 1) * 0.018
  const familiarity = Math.min(0.35, seen * 0.03)
  return Math.max(0.04, Math.min(0.9, base + familiarity))
}

/**
 * 从"知道它叫什么"到"知道它什么性子"的概率。
 * 这一步吃的是专业技艺:草木问辨药,金石问锻打。
 */
export function natureChance(rank: number, discernLevel: number, craftLevel: number, seen: number): number {
  if (seen < SEEN_FOR_NATURE) return 0
  const base = 0.1 + discernLevel / 500 + craftLevel / 300 - (rank - 1) * 0.015
  const familiarity = Math.min(0.25, (seen - SEEN_FOR_NATURE) * 0.02)
  return Math.max(0.02, Math.min(0.75, base + familiarity))
}

// ============ 服务 ============

/** 该材料的"专业技艺":草木看辨药,金石看锻打 */
function craftSkillOf(def: MaterialDef): SkillId {
  return def.bucket === 'herb' ? 'herbLore' : 'smithing'
}

/**
 * 与一味灵材照面。采集、掉落、事件都应调用。
 * 只推进到第 2 层——第 3 层"已通用"必须靠真正用它做过东西,见 noteMaterialUsed。
 * @returns 本次是否推进了认知层
 */
export function encounterMaterial(id: string, quiet = false): boolean {
  const def = materialDef(id)
  if (!def) return false
  const lore = useLoreStore()
  lore.markSeen(id)

  const stage = lore.loreOf(id)
  if (stage >= 2) return false

  const seen = lore.seenOf(id)
  const discernLv = lore.skillLevel('discern')
  const hit =
    stage === 0
      ? rng.chance(discernChance(def.rank, discernLv, seen))
      : rng.chance(natureChance(def.rank, discernLv, lore.skillLevel(craftSkillOf(def)), seen))
  if (!hit) {
    // 没认出来也不算白看:识材技艺照长,只是长得慢
    lore.addSkillExp('discern', 0.6)
    return false
  }

  lore.advanceLore(id, stage + 1)
  lore.addSkillExp('discern', 4 + def.rank * 1.5)
  if (stage === 1) lore.addSkillExp(craftSkillOf(def), 3 + def.rank)
  if (!quiet) {
    const ui = useUiStore()
    ui.toast(stage === 0 ? `辨出一味灵材:「${def.name}」` : `已知「${def.name}」药性`, 'rare')
  }
  return true
}

/**
 * 采集/掉落时抽一味当前层级会撞见的灵材并推进认知。
 * 这是把既有的 `herb+3` 标量掉落接进认知体系的钩子:数量照旧进标量库存,
 * 但"你到底采到了什么"从此有了答案。
 */
export function rollFieldMaterial(tier: number, bucket?: MaterialBucket): MaterialDef | null {
  const pool = materialsNearRank(Math.max(1, Math.ceil(tier / 2)), bucket)
  if (pool.length === 0) return null
  // 低阶材料更常见,但高阶材料永远有一线机会撞见
  return rng.weighted(pool, x => 1 / x.rank)
}

/** 采集一批材料:抽出具体是什么并推进认知(静默,避免刷屏) */
export function harvestMaterials(tier: number, bucket: MaterialBucket, times = 1): void {
  for (let i = 0; i < Math.min(3, times); i += 1) {
    const def = rollFieldMaterial(tier, bucket)
    if (def) encounterMaterial(def.id, true)
  }
}

/** 真正用一味材料做过东西 —— 唯一能推到"已通用"的途径 */
export function noteMaterialUsed(id: string, succeeded: boolean): void {
  const def = materialDef(id)
  if (!def) return
  const lore = useLoreStore()
  lore.markSeen(id)
  if (lore.loreOf(id) !== 2) return
  // 上手过才谈得上"通用";失败反而记得更牢
  const chance = succeeded ? 0.22 : 0.34
  if (!rng.chance(chance)) return
  if (lore.advanceLore(id, LORE_MAX)) {
    lore.addSkillExp(craftSkillOf(def), 6 + def.rank * 2)
    useUiStore().toast(`已通晓「${def.name}」的用法`, 'rare')
  }
}

/** 研读丹方(典籍、师承、事件都走这里) */
export function studyRecipe(id: string, amount: number): number {
  return useLoreStore().addRecipeMastery(id, amount)
}

/** 研读图纸 */
export function studyBlueprint(id: string, amount: number): number {
  return useLoreStore().addBlueprintMastery(id, amount)
}

export function gainSkill(id: SkillId, exp: number): void {
  useLoreStore().addSkillExp(id, exp)
}

/**
 * 藏经阁被动钻研:每次心跳推进"已知丹方里最生的那一张"。
 * 放着不管也在长学问——这是本体系与放置节奏的接缝,不需要玩家点任何按钮。
 * 在线与离线共用此函数,只是 dtSec 不同。
 */
export function studyTick(dtSec: number): void {
  const dongfu = useDongfuStore()
  const libLv = dongfu.levels.library
  if (libLv <= 0 || dtSec <= 0) return
  const lore = useLoreStore()
  lore.studyFrac += (libLv * STUDY_MASTERY_PER_HOUR * dtSec) / 3600
  if (lore.studyFrac < 0.001) return

  // 挑一张已知但未通的方子,专补最生的
  let target: string | null = null
  let lowest = 1
  for (const [id, v] of Object.entries(lore.recipeLore)) {
    if (v > 0 && v < 1 && v < lowest) {
      lowest = v
      target = id
    }
  }
  if (target === null) {
    lore.studyFrac = 0
    return
  }
  const gain = lore.studyFrac
  lore.studyFrac = 0
  lore.addRecipeMastery(target, gain)
}

/** 入门修士都会的三张方子 —— 不会做这几样,连炉都开不了 */
const STARTER_RECIPES = ['p_jvqisan', 'p_jvqidan', 'p_huichun'] as const
/** 旧存档折算:过去按等级门槛"能炼"的方子,折成半生不熟的掌握度 */
const LEGACY_MASTERY = 0.7
/**
 * 开局技艺底子(约合熟练度 25「入门」)。
 *
 * 会背三张方子的人,不可能没碰过炉子。若从零技艺起步,首炉聚气散把握不足两成,
 * 五炉炸四炉——那不叫"知识决定成败",那叫劝退。给个底子,让第一炉是搏一把,
 * 而不是必输。
 */
const STARTER_SKILL_EXP = 200
const STARTER_SKILLS: readonly SkillId[] = ['discern', 'herbLore', 'pairing', 'condense', 'temper', 'nurture', 'flame']

/**
 * 播种入门认知(幂等)。
 *
 * 两件事:新号得到三张入门方子;旧存档把过去凭丹炉等级能炼的方子折算成掌握度——
 * 折成 0.7 而非 1,因为旧口径下"能炼"只代表够级,并不代表真的懂。
 */
export function seedLoreIfNeeded(): void {
  const lore = useLoreStore()
  if (lore.seeded) return
  const dongfu = useDongfuStore()
  const player = usePlayerStore()

  for (const id of STARTER_RECIPES) {
    if (lore.recipeMastery(id) <= 0) lore.addRecipeMastery(id, 1)
  }
  for (const p of PILLS) {
    if (!p.recipe) continue
    const reachable = (p.alchemyLevel ?? 1) <= dongfu.alchemyLevel && p.minRealm <= player.major
    if (reachable && lore.recipeMastery(p.id) <= 0) lore.addRecipeMastery(p.id, LEGACY_MASTERY)
  }
  // 入门方子里的药必然见过,否则新号连第一炉都开不出来
  for (const id of STARTER_RECIPES) {
    const def = pillDef(id)
    const craft = def ? recipeCraft(def) : null
    for (const mid of craft?.materials ?? []) lore.advanceLore(mid, 1)
  }
  // 底子只补差额:老存档若已练出真本事,不该被这行重置或白送
  for (const id of STARTER_SKILLS) {
    const lack = STARTER_SKILL_EXP - lore.expOf(id)
    if (lack > 0) lore.addSkillExp(id, lack)
  }
  lore.seeded = true
}
