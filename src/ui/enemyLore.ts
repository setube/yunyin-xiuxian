/**
 * 敌人认知的呈现(Phase 32.5)—— 「你知道它会怎么打」
 *
 * 认知层不发属性,它发的是**情报**:交手越多,战前看得越清楚。
 * 四层逐级揭示 ——
 *
 * - 0 未识:什么都不给。第一次照面就该是未知的。
 * - 1 眼熟:体格与本命属性。你至少记得它壮不壮、快不快。
 * - 2 知其路数:惯用招式与那一招的门道。
 * - 3 洞悉:残血变阵与本相。它什么时候翻脸、翻脸之后是哪一套,你门儿清。
 *
 * 「熟知修仙界」一阶(见 data/samsara.ts)把门槛整体下调一档 ——
 * 带着几世记忆投胎的人,不必再从"这是什么东西"从头认起。
 *
 * 本文件只做映射与文案,不改任何状态。describeEnemy 是纯函数(可独立测试),
 * enemyLoreView 才是读 store 的那层薄封装。
 */
import { ELEMENTS } from '@/data/linggen'
import { enemyDef } from '@/data/enemies'
import { ENEMY_LORE_MAX, ENEMY_LORE_STAGE_NAMES, useLoreStore } from '@/stores/lore'
import { currentStage } from '@/core/samsaraService'
import type { BossArchetype, EnemyDef, EnemySkill } from '@/types'

/** 招式效果的门道 —— 玩家该据此调整构筑,而不是死记 effect 枚举 */
const EFFECT_NOTES: Record<NonNullable<EnemySkill['effect']>, string> = {
  stun: '摄神,叫人当场失措',
  bleed: '带毒,伤在事后',
  drain: '噬血自补',
  shield: '起罡护体',
  multi: '一击数段',
  pierce: '真伤贯体,护体挡不住'
}

/** 首领本相 —— 一句话点破它的打法核心 */
const ARCHETYPE_NOTES: Record<BossArchetype, string> = {
  berserk: '越战越狂——拖得越久它越凶',
  counter: '你多段出手,它便回敬',
  truedmg: '有一记绕过一切护体的杀招',
  antiheal: '压治疗——你回的血在它面前不值钱',
  spellbane: '吞法——你法门越多,它反倒越硬',
  evasive: '身形飘忽,不容易打实',
  attrition: '自愈不止,久战反而是它的场',
  threshold: '开战即有罡盾,破不开便伤不着它'
}

export interface EnemySkillNote {
  name: string
  /** 该招的门道(无特殊效果时为倍率评语) */
  note: string
}

export interface EnemyPhaseNote {
  /** 触发时机 */
  at: string
  label: string
}

/** 战前情报:每一项都由认知层决定给不给 */
export interface EnemyLoreView {
  /** 有效认知层(已计入轮回阶的门槛下调) */
  stage: number
  /** 实打实交手挣来的认知层 */
  raw: number
  /** 是否吃到了「熟知修仙界」的下调 */
  boosted: boolean
  stageName: string
  /** 体格评语(层 ≥1) */
  frame: string[]
  /** 本命属性(层 ≥1;无属性的敌人为 null) */
  elementName: string | null
  /** 惯用招式(层 ≥2) */
  skills: EnemySkillNote[]
  /** 残血变阵(层 = 3) */
  phases: EnemyPhaseNote[]
  /** 首领本相(层 = 3;非首领为 null) */
  archetype: string | null
  /** 还差什么才看得更清楚(已洞悉为 null) */
  hint: string | null
}

const HINTS = [
  '未曾交手,一无所知。',
  '再交手几阵,便能数出它惯用的招式。',
  '再多打几场,连它残血那一手也瞒不过你。'
] as const

/** 体格评语 —— 从倍率反推成人话,只说值得一说的那几条 */
function frameOf(def: EnemyDef): string[] {
  const out: string[] = []
  if (def.hpMult >= 1.5) out.push('气血绵长')
  else if (def.hpMult <= 0.9) out.push('身子单薄')
  if (def.atkMult >= 1.4) out.push('出手极重')
  else if (def.atkMult <= 0.95) out.push('力道平平')
  if (def.defMult >= 1.4) out.push('皮坚甲厚')
  else if (def.defMult <= 0.85) out.push('皮肉松软')
  if (def.speed >= 1.2) out.push('身法迅捷')
  else if (def.speed <= 0.85) out.push('行动迟缓')
  return out
}

function skillNote(sk: EnemySkill): string {
  if (sk.effect) return EFFECT_NOTES[sk.effect]
  if (sk.mult >= 2.2) return '一记重手,挨实了要伤筋动骨'
  if (sk.mult >= 1.6) return '发力凶狠'
  return '寻常一击'
}

/** 残血变阵的招式也算它的路数 —— 层 3 才见得到,合并进招式表反而乱,单列 */
function phaseNotes(def: EnemyDef): EnemyPhaseNote[] {
  return (def.phases ?? []).map(p => ({
    at: `血余 ${Math.round(p.hpThreshold * 100)}%`,
    label: p.label ?? '变阵'
  }))
}

/**
 * 按认知层揭示一头敌人。
 *
 * @param stage 有效认知层(调用方须先算好轮回阶的加成,见 effectiveEnemyStage)
 */
export function describeEnemy(def: EnemyDef, stage: number, boosted = false): EnemyLoreView {
  const lv = Math.max(0, Math.min(ENEMY_LORE_MAX, Math.floor(stage)))
  const seen1 = lv >= 1
  const seen2 = lv >= 2
  const seen3 = lv >= ENEMY_LORE_MAX
  return {
    stage: lv,
    raw: lv,
    boosted,
    stageName: ENEMY_LORE_STAGE_NAMES[lv] ?? ENEMY_LORE_STAGE_NAMES[0],
    frame: seen1 ? frameOf(def) : [],
    elementName: seen1 && def.element ? ELEMENTS[def.element].name : null,
    skills: seen2 ? def.skills.map(sk => ({ name: sk.name, note: skillNote(sk) })) : [],
    phases: seen3 ? phaseNotes(def) : [],
    archetype: seen3 && def.archetype ? ARCHETYPE_NOTES[def.archetype] : null,
    hint: seen3 ? null : (HINTS[lv] ?? null)
  }
}

/**
 * 有效认知层 = 实打实交手挣来的层 + 轮回阶的门槛下调。
 *
 * 下调只补一档,且不能凭空把"从未交手"变成"眼熟" ——
 * 记忆能省去从头辨认的工夫,替不了亲手打过的那一场。
 */
export function effectiveEnemyStage(raw: number, insightful: boolean): number {
  if (!insightful || raw <= 0) return raw
  return Math.min(ENEMY_LORE_MAX, raw + 1)
}

/** 读当下状态,给出这头敌人此刻看得见的情报(未知 id 返回 null) */
export function enemyLoreView(enemyId: string): EnemyLoreView | null {
  const def = enemyDef(enemyId)
  if (!def) return null
  const raw = useLoreStore().enemyLoreOf(enemyId)
  const insightful = currentStage().enemyInsight
  const eff = effectiveEnemyStage(raw, insightful)
  return { ...describeEnemy(def, eff, eff > raw), raw }
}
