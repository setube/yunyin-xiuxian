/** 存档形状修复(各 store 的 sanitize 用):形状不对就用兜底值,不抛错。 */
import type { CombatSkill, GNum } from '@/types'
import { COMBAT_SKILL_EFFECTS, SKILL_MULT_CAP } from '@/data/constants'
import { gn, gnZero } from './gnum'

/**
 * 是数组就用它,否则兜底。元素也要过一遍:`[null]` 会在渲染期抛错。
 * isValid 省略时只丢掉 null/undefined。
 */
export function asArray<T>(v: unknown, fallback: T[] = [], isValid?: (x: unknown) => boolean): T[] {
  if (!Array.isArray(v)) return fallback
  const keep = isValid ?? ((x: unknown) => x !== null && x !== undefined)
  return (v as T[]).filter(keep)
}

/** 字符串数组:滤掉非字符串 */
export function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** 是对象(且不是数组/null)就用它,否则兜底 */
export function asRecord<T>(v: unknown, fallback: Record<string, T> = {}): Record<string, T> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : fallback
}

/** 记录里只留值像样的条目:`{ a: null }` 同样会在渲染期抛错 */
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

/** 残余生命占比:夹到 [0.05, 1],非有限数兜底 1;天界/凡界远征共用 */
export function asCarriedHpPct(v: unknown): number {
  return Math.min(1, asFiniteNumber(v, 1, 0.05))
}

/**
 * 战斗技能修形 —— 忆战快照与虚界敌形共用。
 * `rate`/`mult` 夹回可玩值域;名字与倍率/概率缺失或非有限整条丢弃;认不出的 effect 只去掉附加效果。
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

/** 技能表修形:非数组回落空表 */
export function asCombatSkills(v: unknown): CombatSkill[] {
  return asArray<unknown>(v)
    .map(asCombatSkill)
    .filter((s): s is CombatSkill => s !== null)
}

/** 记录里每项取有限数字,非数字的键丢掉 */
export function asNumberRecord(v: unknown, min?: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, raw] of Object.entries(asRecord<number>(v))) {
    if (typeof raw === 'number' && Number.isFinite(raw)) out[k] = min === undefined ? raw : Math.max(min, raw)
  }
  return out
}

/** 对象或 null:可为空的状态(如进行中的会话) */
export function asObjectOrNull<T extends object>(v: unknown): T | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as T) : null
}

/**
 * 存档里的价格(GNum):形状不对就归零。货架/悬赏会重新上货、重填价格,不会以零成交。
 * 坊市与悬赏共用这一份。
 */
/**
 * 存档里的价格/奖励 GNum。
 *
 * 指数须有界:`gn` 只规范化 m、**不限制 e**,而 formatGN 会把 e 原样印出来 ——
 * 坏档写 { m: 1, e: 1e9 } 会让界面出现「1.00e1000000000」,
 * { m: 1e308, e: 1e308 } 更会印成「1.00e1e+308」这种非法数字。
 * 正常数值的指数只有两位数(满级玩家四维实测最大 e=15),故 ±999 足够宽又拦得住坏档。
 */
/** 存档 GNum 的指数绝对值上界:只为拦坏档,远高于真实数值(两位数) */
export const SAVE_GNUM_MAX_EXP = 999

/**
 * 读档用 GNum:形状坏或指数越界一律归零。
 *
 * `gn()` 本身只规范化 m、**不限制 e**,而 formatGN 会把 e 原样印出来;
 * 凡是读档处直接 `gn(raw)` 的地方,坏档都能让界面出现「1.00e1000000000」这种非法数字。
 * 读档的 GNum 都应经此函数。
 */
export function asBoundedGNum(v: unknown): GNum {
  // 裸数字也接受:旧档/手改档里常把 GNum 写成 123 这种。gn(123) 会规范成 { m: 1.23, e: 2 },
  // 而数字的指数必然远在界内,不需再判。
  if (typeof v === 'number') return gn(v)
  if (!v || typeof v !== 'object' || !('m' in v) || !('e' in v)) return gnZero()
  const { m, e } = v as { m: unknown; e: unknown }
  if (
    typeof m === 'number' &&
    typeof e === 'number' &&
    Number.isFinite(m) &&
    Number.isFinite(e) &&
    Math.abs(e) <= SAVE_GNUM_MAX_EXP
  ) {
    return gn({ m, e })
  }
  return gnZero()
}

/**
 * 价格/奖励的 GNum。
 *
 * 与 asBoundedGNum 同一条指数界,但**只收 { m, e } 结构**:
 * 价格是导出契约的一部分,写成裸数字属于格式错误,该按「读不出」处理。
 * (asBoundedGNum 收裸数字,是因为它服务的是会话/修为这类「旧档可能写成 123」的字段。)
 */
export function asPrice(v: unknown): GNum {
  if (!v || typeof v !== 'object' || !('m' in v) || !('e' in v)) return gnZero()
  return asBoundedGNum(v)
}

/** 存档里的非负整数(索引/层数/件数):非数用兜底,负数夹回 0 */
export function asNonNegInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback
}
