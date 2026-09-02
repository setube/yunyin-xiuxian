/**
 * 轮回服务(Phase 32.5)—— 宿慧怎么算、这一世的题怎么判
 *
 * ## 本文件回答的那个问题
 *
 * 「我为什么还要轮回?」旧答案是"再拿一次道果和天赋",于是第二十世不过是第一世
 * 的复播,只是数字大一点。新答案在这里:轮回带走的主要不是属性,而是**你知道什么**。
 *
 * 三层各司其职,互不僭越:
 *
 * - **轮回次数**(player.reincarnation.count)只是历史计数,除了兜底一个资质地板,
 *   不再承担任何成长职责。
 * - **轮回阶段**(data/samsara.ts)由宿慧决定,开的全是信息与知识:转世睁眼即认得
 *   哪些药、战前看不看得见敌人机制、命题能不能自选。一分属性也不给。
 * - **轮回遗产**是认知本身(stores/lore.ts):灵材、丹方、图纸、技艺、敌人路数
 *   —— 这些跨世**完全不清零、不折减**。第一世不认得玄铁,第七世一眼认出,
 *   靠的就是这条。
 *
 * ## 宿慧的两本账
 *
 * - **存量**(player.reincarnation.insight):历世阅历 + 已达成的命题。
 *   这些是"过去发生过的事",落进存档,不能重算。
 * - **现量**(loreInsight):由当下的认知折算。认知跨世保留,随时可算,不必存 ——
 *   存了反而会与认知本身对不上账。
 *
 * 两者相加才是 totalInsight(),分阶、折资质地板都用它。
 */
import { LORE_MAX, MATERIALS } from '@/data/materials'
import { SKILL_IDS, skillLevelFromExp } from '@/data/crafting'
import { REINCARNATE_APTITUDE_FLOOR } from '@/data/constants'
import {
  INSIGHT_PER_APTITUDE,
  INSIGHT_PER_ENEMY,
  INSIGHT_PER_LIFE_REALM,
  INSIGHT_PER_MATERIAL,
  INSIGHT_PER_MATERIAL_MASTERED,
  INSIGHT_PER_RECIPE,
  INSIGHT_SKILL_DIV,
  stageAt,
  type LifeVow,
  type SamsaraStageDef
} from '@/data/samsara'
import { lifeThemeDef, themesForStage, type LifeTaboo, type LifeThemeDef, type LifeThemeMetric } from '@/data/lifeThemes'
import { ENEMY_LORE_MAX, useLoreStore } from '@/stores/lore'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { useCultivationStore } from '@/stores/cultivation'
import { useUiStore } from '@/stores/ui'
import type { CounterKey } from '@/types'

// ============ 宿慧折算(纯函数,可独立测试) ============

/** 折算宿慧所需的认知快照 —— 与 store 解耦,便于审计测试直接喂数据 */
export interface LoreSnapshot {
  /** 灵材 id → 认知层 0~3 */
  materialLore: Record<string, number>
  /** 丹方 id → 掌握度 0~1 */
  recipeLore: Record<string, number>
  /** 技艺 id → 累积经验 */
  skillExp: Record<string, number>
  /** 敌人 id → 认知层 0~3 */
  enemyLore: Record<string, number>
}

/**
 * 由认知折算的宿慧(现量)。
 *
 * 四项各计各的:认得多少药、通几张方、九项技艺练到什么份上、洞悉几种敌手。
 * 通晓用法的药在"认得"之上再计一份 —— 认得它叫什么和会用它,是两回事。
 */
export function loreInsight(snap: LoreSnapshot): number {
  let sum = 0
  for (const v of Object.values(snap.materialLore)) {
    if (v >= 1) sum += INSIGHT_PER_MATERIAL
    if (v >= LORE_MAX) sum += INSIGHT_PER_MATERIAL_MASTERED
  }
  for (const v of Object.values(snap.recipeLore)) {
    if (v >= 1) sum += INSIGHT_PER_RECIPE
  }
  let skillSum = 0
  for (const id of SKILL_IDS) {
    skillSum += skillLevelFromExp(snap.skillExp[id] ?? 0)
  }
  sum += skillSum / INSIGHT_SKILL_DIV
  for (const v of Object.values(snap.enemyLore)) {
    if (v >= ENEMY_LORE_MAX) sum += INSIGHT_PER_ENEMY
  }
  return Math.floor(sum)
}

/** 一世走到某大境界,留下多少阅历 */
export function lifeInsight(major: number): number {
  return (Math.max(0, major) + 1) * INSIGHT_PER_LIFE_REALM
}

// ============ 当下取数 ============

function snapshotLore(): LoreSnapshot {
  const lore = useLoreStore()
  return {
    materialLore: lore.materialLore,
    recipeLore: lore.recipeLore,
    skillExp: lore.skillExp,
    enemyLore: lore.enemyLore
  }
}

/** 此刻的宿慧 = 存量(历世阅历 + 已达成的命题)+ 现量(认知折算) */
export function totalInsight(): number {
  return usePlayerStore().reincarnation.insight + loreInsight(snapshotLore())
}

/** 此刻所处的轮回阶段 */
export function currentStage(): SamsaraStageDef {
  return stageAt(totalInsight())
}

/**
 * 转世后的灵根资质地板。
 *
 * 两条口径取较大者:旧的「转世次数 × 5」是保底,新的「宿慧折算」才是主路。
 * 认真攒所知的人第二三世即可反超次数口径;只反复冲境界的人也不会掉档 ——
 * 资质本就硬封顶 100,这条维度短线就顶满,不值得为凸显宿慧而砍老玩家。
 */
export function aptitudeFloorNow(): number {
  const player = usePlayerStore()
  const byCount = REINCARNATE_APTITUDE_FLOOR * (player.reincarnation.count + 1)
  const byInsight = Math.floor(totalInsight() / INSIGHT_PER_APTITUDE)
  return Math.max(byCount, byInsight)
}

/**
 * 转世睁眼时把该阶认得的灵材至少提到「已辨识」。
 *
 * 注意这不是"保留多少"—— 认知从来不因转世清零。这里做的是**补足**:
 * 百世老修不该还要从头辨认青芝草。
 * @returns 本次新认出的灵材数
 */
export function carryLore(stage: SamsaraStageDef): number {
  if (stage.knownMaterialRank <= 0) return 0
  const lore = useLoreStore()
  let n = 0
  for (const m of MATERIALS) {
    if (m.rank <= stage.knownMaterialRank && lore.advanceLore(m.id, 1)) n += 1
  }
  return n
}

/** 转世睁眼时一共认得几味灵材(不改动状态,供轮回界面预告) */
export function carryLorePreview(stage: SamsaraStageDef): number {
  const lore = useLoreStore()
  return MATERIALS.filter(m => m.rank <= stage.knownMaterialRank || lore.loreOf(m.id) >= 1).length
}

// ============ 这一世的命题 ============

/** 命题进度:cur / need,以及是否已达成 */
export interface ThemeProgress {
  cur: number
  need: number
  done: boolean
}

function countersDelta(key: CounterKey, base: Partial<Record<CounterKey, number>>): number {
  return Math.max(0, useQuestsStore().counter(key) - (base[key] ?? 0))
}

/** 已择定的悟道分支数 */
export function branchCount(): number {
  return Object.keys(useCultivationStore().gongfaBranch).length
}

/** 已雪耻的宿敌数 */
export function avengedCount(): number {
  return usePlayerStore().nemeses.filter(n => n.avengedAt !== undefined).length
}

/** 单条判据的进度 */
function metricProgress(metric: LifeThemeMetric, vow: LifeVow): ThemeProgress {
  const player = usePlayerStore()
  const lore = useLoreStore()
  switch (metric.kind) {
    case 'realm':
      return prog(player.major, metric.major)
    case 'counter':
      return prog(countersDelta(metric.key, vow.base), metric.n)
    case 'materialLore': {
      const n = Object.values(lore.materialLore).filter(v => v >= metric.stage).length
      return prog(n, metric.n)
    }
    case 'recipeMastered':
      return prog(lore.masteredRecipeCount, metric.n)
    case 'skill':
      return prog(lore.skillLevel(metric.id), metric.level)
    case 'enemyLore':
      return prog(lore.masteredEnemyCount, metric.n)
    case 'branch':
      return prog(Math.max(0, branchCount() - vow.baseBranches), metric.n)
    case 'avenge':
      return prog(Math.max(0, avengedCount() - vow.baseAvenged), metric.n)
    case 'all': {
      // 取各条中最落后的一条作为整体进度:全部达成才算达成
      const parts = metric.of.map(m => metricProgress(m, vow))
      const worst = parts.reduce((a, b) => (a.cur / a.need <= b.cur / b.need ? a : b))
      return { ...worst, done: parts.every(p => p.done) }
    }
  }
}

function prog(cur: number, need: number): ThemeProgress {
  return { cur, need, done: cur >= need }
}

/** 本世命题的进度(未立题返回 null) */
export function vowProgress(): ThemeProgress | null {
  const vow = usePlayerStore().reincarnation.vow
  const def = vow ? lifeThemeDef(vow.themeId) : undefined
  if (!vow || !def) return null
  return metricProgress(def.metric, vow)
}

/** 本世命题的结局:已破 / 已成 / 未竟 */
export function vowResult(): 'broken' | 'done' | 'unfinished' | null {
  const vow = usePlayerStore().reincarnation.vow
  if (!vow) return null
  if (vow.broken) return 'broken'
  return vowProgress()?.done ? 'done' : 'unfinished'
}

/**
 * 犯忌讳 —— 服丹与祭法宝处调用,当场判定。
 *
 * 不等到转世才结算:玩家应当在按下那一刻就知道自己的话没说到底,
 * 而不是几个时辰后被一句总结告知。
 */
export function noteTaboo(taboo: LifeTaboo): void {
  const player = usePlayerStore()
  const vow = player.reincarnation.vow
  if (!vow || vow.broken) return
  const def = lifeThemeDef(vow.themeId)
  if (def?.taboo !== taboo) return
  player.breakVow()
  useUiStore().toast(`【破题】你曾立誓「${def.vow}」——这一世的话,没能说到底`, 'warn')
}

/**
 * 该阶可选的命题。
 *
 * 顶阶(百世老修)自选,其余抽三取一 —— "这一世要做什么由你自己定"
 * 本身就是最后一阶开的能力。
 * @param rngPick 抽签函数(注入以便测试)
 */
export function offerThemes(stage: SamsaraStageDef, rngPick: (arr: LifeThemeDef[]) => LifeThemeDef): LifeThemeDef[] {
  const pool = themesForStage(stage.index)
  if (stage.themeFreeChoice || pool.length <= 3) return pool
  const out: LifeThemeDef[] = []
  const rest = [...pool]
  for (let i = 0; i < 3 && rest.length > 0; i += 1) {
    const picked = rngPick(rest)
    out.push(picked)
    rest.splice(rest.indexOf(picked), 1)
  }
  return out
}

/**
 * 开启新的一世:立题并给跨世累计的计数器打快照。
 *
 * 快照是「本世计」的实现基础 —— 「本世斩敌 400」说的是这一世的 400。
 * 手法与每日任务的 rolloverDaily 一致(见 stores/quests.ts)。
 */
export function beginLife(themeId: string | null, now = Date.now()): void {
  const player = usePlayerStore()
  if (themeId === null || !lifeThemeDef(themeId)) {
    player.setVow(null)
    return
  }
  const quests = useQuestsStore()
  player.setVow({
    themeId,
    at: now,
    base: { ...quests.counters },
    baseBranches: branchCount(),
    baseAvenged: avengedCount(),
    broken: false
  })
}
