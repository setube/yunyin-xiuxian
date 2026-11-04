import { REALMS, WORLDS } from '@/data/realms'
import type { TitleDef } from '@/types'
import { ACHIEVEMENTS } from '@/data/achievements'

/**
 * 名号形制。
 *
 * 名号页此前 29 顶名号长得一模一样:同一个圆圈,只换「佩 / 藏 / 未」一个字。
 * 而这 29 顶其实分成两类,数据里早就分好了 ——
 *   境界名号 21 顶:由 a_rN 成就给出,每个大境界一顶,构成一条从炼气到道祖的梯子;
 *   事功名号  8 顶:杀伐、丹道、强化、轮回等行为所成,与境界无关。
 *
 * 梯子上的名号,玩家真正想知道的是「我在第几级」,而不是「我有这一枚」。
 * 故给境界名号一根界域刻度:四个界域(人间 / 仙 / 神 / 混沌)各占一段,
 * 这一顶落在哪一境、哪一段,一眼可数。事功名号不走这条梯子,给一枚事功纹。
 *
 * 所有判据都从 data 现算 —— 增删境界或改界域分界,刻度自动跟上。
 */

/** 一大境界一顶境界名号;键为大境界序号 */
const REALM_TITLE_MAJOR = new Map<string, number>()
for (const a of ACHIEVEMENTS) {
  if (a.cond.type !== 'realm' || !a.reward?.titleId) continue
  REALM_TITLE_MAJOR.set(a.reward.titleId, a.cond.major)
}

/** 这顶名号是否来自境界阶梯,以及它落在第几境 */
export function realmTitleMajor(id: string): number | null {
  return REALM_TITLE_MAJOR.get(id) ?? null
}

/** 境界名号的总级数 = 大境界总数 */
export const TITLE_LADDER_STEPS = REALMS.length

/** 界域主色只取既有语义 token 的类名,按世界 id */
const WORLD_TONE: Record<string, string> = {
  mortal: 'text-ink',
  immortal: 'text-azure',
  god: 'text-violet-ink',
  chaos: 'text-cinnabar'
}

export interface TitleMark {
  kind: 'realm' | 'deed'
  /** 境界名号:第几级(1 起);事功名号为 0 */
  step: number
  /** 境界名号:它属于哪个界域;事功名号为空 */
  worldName: string
  /** 形制色:境界名号按界域,事功名号走金 */
  tone: string
  /** 读屏说法 */
  label: string
}

/**
 * 一顶名号的形制。
 *
 * 事功名号不硬塞进梯子 —— 它们与境界无关,强行分档只会暗示一个不存在的次序。
 */
export function titleMark(def: TitleDef): TitleMark {
  const major = realmTitleMajor(def.id)
  if (major === null) {
    return { kind: 'deed', step: 0, worldName: '', tone: 'text-gold-ink', label: '事功名号' }
  }
  const world = WORLDS.find(w => major >= w.start && major <= w.end)
  const step = major + 1
  return {
    kind: 'realm',
    step,
    worldName: world?.name ?? '',
    tone: WORLD_TONE[world?.id ?? 'mortal'] ?? 'text-ink',
    label: `第 ${step} 境名号`
  }
}

/**
 * 界域刻度:四个界域各占几格,当前这一顶落在全梯的第几格。
 * 刻度总长 = 名号梯级数;界域段长 = 该界域含的大境界数。
 */
export interface WorldSeg {
  id: string
  name: string
  /** 这一段占几格 */
  span: number
  /** 当前名号是否落在这一段 */
  here: boolean
}

export function worldSegs(major: number | null): WorldSeg[] {
  return WORLDS.map(w => ({
    id: w.id,
    name: w.name,
    span: w.end - w.start + 1,
    here: major !== null && major >= w.start && major <= w.end
  }))
}
