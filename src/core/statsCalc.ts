/** 属性汇总(纯函数):Base × 装备 × 功法 × 天赋 × Buff × 建筑 = FinalStats */
import type { AnyStatKey, FinalStats, GNum, StatMods, StatSourceRow } from '@/types'
import { add, mulN } from '@/utils/gnum'
import {
  DAO_FRUIT_COMBAT_BONUS,
  DAO_FRUIT_CULT_BONUS,
  DAO_FRUIT_SOFT_EXP,
  DIMINISH_KEYS,
  DIMINISH_WEIGHTS,
  QI_RICH_BONUS,
  SOFT_CAPS,
  CULT_SPEED_SOFT_CAP_T,
  CULT_SPEED_SOFT_CAP_DIMINISH
} from '@/data/constants'
import { baseCombatStats, powerScore } from './formulas'

export interface StatsInput {
  major: number
  sub: number
  /** 灵根修炼倍率(1.0 为基准) */
  linggenMult: number
  /** 各来源百分比加成(装备/功法/天赋/称号/灵兽/Buff/建筑) */
  modSources: StatMods[]
  /** 与 modSources 一一对应;漏写的显示成「来源 N」,审计会点名 */
  sourceNames?: string[]
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
 * 普通词条同键相加;条件/触发词条(DIMINISH_KEYS)按来源贡献降序以 100%/75%/50%/25% 递减计入。
 */
export function mergeMods(sources: StatMods[]): StatMods {
  return mergeModsDetailed(sources).mods
}

/**
 * 与 mergeMods 同一套算法,另回答「每一份最终值是谁给的」:
 * 递减打折后的那一份记给该来源,软阈值给相关来源同乘一个系数,明细之和仍等于面板值。
 */
export function mergeModsDetailed(sources: StatMods[]): { mods: StatMods; effective: StatMods[] } {
  const out: StatMods = {}
  const effective: StatMods[] = sources.map(() => ({}))
  const diminished = new Map<AnyStatKey, { src: number; value: number }[]>()
  sources.forEach((src, si) => {
    for (const k in src) {
      const key = k as AnyStatKey
      const v = src[key]
      if (typeof v !== 'number' || v === 0) continue
      if (v > 0 && DIMINISH_SET.has(key)) {
        const list = diminished.get(key)
        if (list) list.push({ src: si, value: v })
        else diminished.set(key, [{ src: si, value: v }])
      } else {
        out[key] = (out[key] ?? 0) + v
        effective[si]![key] = v
      }
    }
  })
  for (const [key, list] of diminished) {
    list.sort((a, b) => b.value - a.value)
    let sum = out[key] ?? 0
    for (let i = 0; i < list.length; i += 1) {
      const entry = list[i]!
      const counted = entry.value * (DIMINISH_WEIGHTS[Math.min(i, DIMINISH_WEIGHTS.length - 1)] ?? 0.25)
      sum += counted
      const bucket = effective[entry.src]!
      bucket[key] = (bucket[key] ?? 0) + counted
    }
    out[key] = sum
  }
  for (const k in SOFT_CAPS) {
    const key = k as AnyStatKey
    const v = out[key]
    const rule = SOFT_CAPS[key]
    if (rule && typeof v === 'number' && v > rule.cap) {
      const scaled = rule.cap + (v - rule.cap) * rule.diminish
      const factor = scaled / v
      for (const bucket of effective) {
        const own = bucket[key]
        if (typeof own === 'number' && own !== 0) bucket[key] = own * factor
      }
      out[key] = scaled
    }
  }
  return { mods: out, effective }
}

/** 某键是否已进入软阈值递减区(展示层提示用) */
export function isSoftCapped(mods: StatMods, key: AnyStatKey): boolean {
  const rule = SOFT_CAPS[key]
  return rule !== undefined && (mods[key] ?? 0) >= rule.cap
}

/**
 * 构筑深度:正向构筑词条的数值总和。
 * 不计三维百分比(天界已由 worldFoeSnap 等比抵消)与修炼速度(不参与战斗)。
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

/**
 * 概率进判定前夹到 [0,1]。
 *
 * **不能只靠 Math.min/max**:它们挡不住 NaN —— NaN 会原样穿过两道钳制
 * (AGENTS.md 明文点过,反复踩)。而它的调用点全是 `rng.chance(capChance(...))`,
 * 判据是 `rand() < p`:`p` 为 NaN 时恒为 false,该效果从此**永远不触发** ——
 * 不崩、不报、屏上也看不出异常,只是玩家那一身词条静默失效。
 *
 * 算不出就按 0 处理(不触发):概率本该是有限数,拿不到数时保守地不让它生效,
 * 与「夹到 0」同义。
 */
export function capChance(p: number): number {
  // 只有 NaN 是「算不出」;±Infinity 仍有大小关系,按端点夹
  if (Number.isNaN(p)) return 0
  return Math.min(1, Math.max(0, p))
}

/** 有效道果:超过一定数量后收益递减 */
export function effectiveDaoFruit(fruit: number): number {
  if (fruit <= 0) return 0
  return Math.pow(fruit, DAO_FRUIT_SOFT_EXP)
}

export function computeFinalStats(input: StatsInput): FinalStats {
  const { mods, effective } = mergeModsDetailed(input.modSources)
  const base = baseCombatStats(input.major, input.sub)
  const fruit = effectiveDaoFruit(input.daoFruit)
  const combatBonus = fruit * DAO_FRUIT_COMBAT_BONUS

  const attack = mulN(add(base.attack, input.equipFlats.attack), Math.max(0.1, 1 + modOf(mods, 'attackPct') + combatBonus))
  const defense = mulN(add(base.defense, input.equipFlats.defense), Math.max(0.1, 1 + modOf(mods, 'defensePct') + combatBonus))
  const maxHp = mulN(add(base.maxHp, input.equipFlats.maxHp), Math.max(0.1, 1 + modOf(mods, 'maxHpPct') + combatBonus))

  const linggenExtra = input.linggenMult - 1
  const daoCultExtra = fruit * DAO_FRUIT_CULT_BONUS
  const qiRichExtra = input.qiRich ? QI_RICH_BONUS : 0
  const cultExtra = linggenExtra + daoCultExtra + qiRichExtra

  // 修炼速度软阈值:越过 CULT_SPEED_SOFT_CAP_T 后超出部分折算;正常单世构筑低于阈值(factor 恒为 1)。
  // 系数同乘摊回灵根/道果/充盈与各 mod 源,明细之和 == 面板值
  const cultTotal = Math.max(-0.9, (mods.cultivationSpeed ?? 0) + cultExtra)
  const cultCapped =
    cultTotal > CULT_SPEED_SOFT_CAP_T
      ? CULT_SPEED_SOFT_CAP_T + (cultTotal - CULT_SPEED_SOFT_CAP_T) * CULT_SPEED_SOFT_CAP_DIMINISH
      : cultTotal
  const cultFactor = cultTotal === 0 ? 1 : cultCapped / cultTotal
  if (cultFactor !== 1) {
    for (const bucket of effective) {
      if (typeof bucket.cultivationSpeed === 'number') bucket.cultivationSpeed *= cultFactor
    }
  }
  mods.cultivationSpeed = cultCapped

  // 来源明细:各 mod 源计入的份额,加上不走 modSources 的灵根/道果/灵气充盈(道果另乘攻防血);
  // 审计会核对「明细之和 = 面板值」
  const breakdown: StatSourceRow[] = input.modSources.map((_, i) => ({
    name: input.sourceNames?.[i] ?? `来源 ${i + 1}`,
    mods: effective[i] ?? {}
  }))
  if (linggenExtra !== 0) breakdown.push({ name: '灵根', mods: { cultivationSpeed: linggenExtra * cultFactor } })
  if (fruit > 0) {
    breakdown.push({ name: '道果(修炼)', mods: { cultivationSpeed: daoCultExtra * cultFactor } })
    breakdown.push({
      name: '道果(攻防血)',
      mods: { attackPct: combatBonus, defensePct: combatBonus, maxHpPct: combatBonus },
      onTop: true
    })
  }
  if (input.qiRich) breakdown.push({ name: '灵气充盈', mods: { cultivationSpeed: qiRichExtra * cultFactor } })

  return {
    attack,
    defense,
    maxHp,
    power: powerScore(attack, defense, maxHp),
    mods,
    breakdown,
    cultSpeedSoftCapped: cultTotal > CULT_SPEED_SOFT_CAP_T,
    cultSpeedFactor: cultFactor
  }
}
