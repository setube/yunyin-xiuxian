/**
 * 存档形状修复 —— 读档时把"形状不对"的字段修回可用的样子。
 *
 * 起因:saveResilience 的红线逐个字段灌 undefined,一次就抓出 7 处会抛错的
 * sanitize 路径(player 的 suppressedRegions、lore 的四张表……)。
 * 这些字段的共同点是**读的时候假设了形状**:`for...of` 假设数组、
 * `Object.entries` 假设对象、算术假设数字。存档一旦被写坏、从旧版本补回来、
 * 或被人手工改过,这些假设就变成白屏。
 *
 * 故这里提供四个最小判据,让各 store 的 sanitize 一行写完:
 * 形状不对就用兜底值,而不是抛错。
 */
import type { CombatSkill, GNum } from '@/types'
import { COMBAT_SKILL_EFFECTS, SKILL_MULT_CAP } from '@/data/constants'
import { gn, gnZero } from './gnum'

/**
 * 是数组就用它,否则兜底。
 *
 * 元素也要过一遍:存档里出现 `[null]` 这种"数组形状对、元素是垃圾"的情形时,
 * 后面的 `.filter(it => it.uid)` / `.defId` 会在渲染期抛错(实测三处)。
 * isValid 省略时只丢掉 null/undefined。
 */
export function asArray<T>(v: unknown, fallback: T[] = [], isValid?: (x: unknown) => boolean): T[] {
  if (!Array.isArray(v)) return fallback
  const keep = isValid ?? ((x: unknown) => x !== null && x !== undefined)
  return (v as T[]).filter(keep)
}

/** 字符串数组:顺带滤掉混进去的非字符串 */
export function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** 是对象(且不是数组/null)就用它,否则兜底 */
export function asRecord<T>(v: unknown, fallback: Record<string, T> = {}): Record<string, T> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : fallback
}

/**
 * 记录里只留下"值还像样"的条目。
 * 键对、值烂(如 `{ a: null }`)同样会在渲染期炸 —— 例如 trialRecords.a.clears。
 */
export function asRecordOf<T>(v: unknown, isValid: (x: unknown) => boolean): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [k, raw] of Object.entries(asRecord<T>(v))) {
    if (isValid(raw)) out[k] = raw
  }
  return out
}

/** 有限数字就用它,否则兜底;可选下限 */
export function asFiniteNumber(v: unknown, fallback: number, min?: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return min === undefined ? n : Math.max(min, n)
}

/** 残余生命占比:有限数字取之并夹到 [0.05, 1],否则兜底 1(天界/凡界远征共用同一口径) */
export function asCarriedHpPct(v: unknown): number {
  return Math.min(1, asFiniteNumber(v, 1, 0.05))
}

/**
 * 战斗技能修形 —— 忆战快照与虚界敌形共用这一份。
 *
 * `rate` 超过 1 会让技能必定触发、负数会让它永不触发;`mult` 为负或极大有限数
 * 会直接进入伤害公式。坏档里这两项都必须夹回可玩值域;名字与倍率/概率本身
 * 缺失或非有限的条目则没有可执行语义,整条丢弃。认不出的 effect 只去掉附加效果,
 * 不影响这一击本身。
 */
export function asCombatSkill(v: unknown): CombatSkill | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const s = v as Partial<CombatSkill>
  if (typeof s.name !== 'string' || s.name.trim() === '') return null
  if (typeof s.mult !== 'number' || !Number.isFinite(s.mult)) return null
  if (typeof s.rate !== 'number' || !Number.isFinite(s.rate)) return null
  const effect =
    typeof s.effect === 'string' && (COMBAT_SKILL_EFFECTS as readonly string[]).includes(s.effect) ? s.effect : undefined
  return {
    name: s.name,
    mult: Math.min(SKILL_MULT_CAP, Math.max(0, s.mult)),
    rate: Math.min(1, Math.max(0, s.rate)),
    ...(effect ? { effect } : {})
  }
}

/** 技能表修形:非数组回落空表,逐条走 asCombatSkill */
export function asCombatSkills(v: unknown): CombatSkill[] {
  return asArray<unknown>(v)
    .map(asCombatSkill)
    .filter((s): s is CombatSkill => s !== null)
}

/** 记录里每一项都取有限数字(非数字的键直接丢掉) */
export function asNumberRecord(v: unknown, min?: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, raw] of Object.entries(asRecord<number>(v))) {
    if (typeof raw === 'number' && Number.isFinite(raw)) out[k] = min === undefined ? raw : Math.max(min, raw)
  }
  return out
}

/** 对象或 null(用于"可以为空"的状态,如进行中的会话) */
export function asObjectOrNull<T extends object>(v: unknown): T | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as T) : null
}

/**
 * 存档里的价格(GNum):形状不对就归零。
 *
 * 归零意味着「买得起」,但货架/悬赏会重新上货、重填价格,不会真以零成交;
 * 相反,一个 NaN 或半个对象会让算价一路算出 NaN。坊市与悬赏共用这一份,
 * 别各写一份 —— 前者写坏了后者照样漏。
 */
export function asPrice(v: unknown): GNum {
  if (!v || typeof v !== 'object' || !('m' in v) || !('e' in v)) return gnZero()
  const { m, e } = v as { m: unknown; e: unknown }
  if (typeof m === 'number' && typeof e === 'number' && Number.isFinite(m) && Number.isFinite(e)) {
    return gn({ m, e })
  }
  return gnZero()
}

/** 存档里的非负整数(索引/层数/件数):非数用兜底,负数夹回 0 */
export function asNonNegInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback
}
