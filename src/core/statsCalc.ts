/**
 * 属性汇总 —— Base × 装备 × 功法 × 天赋 × Buff × 建筑 = FinalStats
 * 纯函数:输入快照,输出最终属性
 */
import type { AnyStatKey, FinalStats, GNum, StatMods } from '@/types'
import { add, gnZero, mulN } from '@/utils/gnum'
import {
  DAO_FRUIT_COMBAT_BONUS,
  DAO_FRUIT_CULT_BONUS,
  DAO_FRUIT_SOFT_EXP,
  DIMINISH_KEYS,
  DIMINISH_WEIGHTS,
  QI_RICH_BONUS,
  SOFT_CAPS
} from '@/data/constants'
import { baseCombatStats, powerScore } from './formulas'

export interface StatsInput {
  major: number
  sub: number
  /** 灵根修炼倍率(1.0 为基准) */
  linggenMult: number
  /** 各来源的百分比加成集合(装备/功法/天赋/称号/灵兽/Buff/建筑) */
  modSources: StatMods[]
  /** 装备平铺数值 */
  equipFlats: { attack: GNum; defense: GNum; maxHp: GNum }
  /** 道果数量(转世永久加成) */
  daoFruit: number
  /** 灵气是否充盈(高于半数上限) */
  qiRich: boolean
}

const DIMINISH_SET = new Set<AnyStatKey>(DIMINISH_KEYS)

/**
 * 合并多个来源的百分比属性。
 * 普通词条同键相加;条件/触发词条(DIMINISH_KEYS)按来源贡献降序以 100%/75%/50%/25% 递减计入——
 * 同一词条重复堆叠边际递减,混合构筑相对更值(Phase 19.5)
 */
export function mergeMods(sources: StatMods[]): StatMods {
  const out: StatMods = {}
  const diminished = new Map<AnyStatKey, number[]>()
  for (const src of sources) {
    for (const k in src) {
      const key = k as AnyStatKey
      const v = src[key]
      if (typeof v !== 'number' || v === 0) continue
      if (v > 0 && DIMINISH_SET.has(key)) {
        const list = diminished.get(key)
        if (list) list.push(v)
        else diminished.set(key, [v])
      } else {
        out[key] = (out[key] ?? 0) + v
      }
    }
  }
  for (const [key, list] of diminished) {
    list.sort((a, b) => b - a)
    let sum = out[key] ?? 0
    for (let i = 0; i < list.length; i += 1) {
      sum += list[i]! * (DIMINISH_WEIGHTS[Math.min(i, DIMINISH_WEIGHTS.length - 1)] ?? 0.25)
    }
    out[key] = sum
  }
  // Phase 30.4 软阈值:合计越过 cap 后超出部分折算(极端堆叠的第二道防线)
  for (const k in SOFT_CAPS) {
    const key = k as AnyStatKey
    const v = out[key]
    const rule = SOFT_CAPS[key]
    if (rule && typeof v === 'number' && v > rule.cap) {
      out[key] = rule.cap + (v - rule.cap) * rule.diminish
    }
  }
  return out
}

/** 某键是否已进入软阈值递减区(展示层提示用) */
export function isSoftCapped(mods: StatMods, key: AnyStatKey): boolean {
  const rule = SOFT_CAPS[key]
  return rule !== undefined && (mods[key] ?? 0) >= rule.cap
}

/**
 * 构筑深度:所有正向「构筑词条」的数值总和。
 *
 * 基础三维百分比与修炼速度不计——前者在天界已由 worldFoeSnap 等比抵消,
 * 后者不参与战斗。剩下的暴击、闪避、吸血、反击、护盾等才是构筑的实际厚度
 */
export function modDepth(mods: StatMods): number {
  let sum = 0
  for (const k in mods) {
    const key = k as AnyStatKey
    if (key === 'attackPct' || key === 'defensePct' || key === 'maxHpPct' || key === 'cultivationSpeed') continue
    const v = mods[key]
    if (typeof v === 'number' && v > 0) sum += v
  }
  return sum
}

export function modOf(mods: StatMods, key: AnyStatKey): number {
  return mods[key] ?? 0
}

export function emptyFlats(): StatsInput['equipFlats'] {
  return { attack: gnZero(), defense: gnZero(), maxHp: gnZero() }
}

/** 有效道果:超过一定数量后收益递减,避免多周目变成无限加速器 */
export function effectiveDaoFruit(fruit: number): number {
  if (fruit <= 0) return 0
  return Math.pow(fruit, DAO_FRUIT_SOFT_EXP)
}

export function computeFinalStats(input: StatsInput): FinalStats {
  const mods = mergeMods(input.modSources)
  const base = baseCombatStats(input.major, input.sub)
  const fruit = effectiveDaoFruit(input.daoFruit)
  const combatBonus = fruit * DAO_FRUIT_COMBAT_BONUS

  const attack = mulN(add(base.attack, input.equipFlats.attack), Math.max(0.1, 1 + modOf(mods, 'attackPct') + combatBonus))
  const defense = mulN(add(base.defense, input.equipFlats.defense), Math.max(0.1, 1 + modOf(mods, 'defensePct') + combatBonus))
  const maxHp = mulN(add(base.maxHp, input.equipFlats.maxHp), Math.max(0.1, 1 + modOf(mods, 'maxHpPct') + combatBonus))

  // 修炼速度汇入:灵根倍率 + 道果 + 灵气充盈
  const cultExtra = input.linggenMult - 1 + fruit * DAO_FRUIT_CULT_BONUS + (input.qiRich ? QI_RICH_BONUS : 0)
  mods.cultivationSpeed = Math.max(-0.9, (mods.cultivationSpeed ?? 0) + cultExtra)

  return { attack, defense, maxHp, power: powerScore(attack, defense, maxHp), mods }
}
