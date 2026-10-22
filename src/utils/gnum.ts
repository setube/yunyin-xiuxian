/**
 * GameNumber 大数模块 —— 以 { m, e } 表示 m × 10^e
 * 纯函数实现,数据为普通对象,可直接被 JSON 持久化
 */
import type { GNum } from '@/types'

const LOG10 = Math.log10

/** 对齐加法时,指数差超过该值的小数直接忽略 */
const NEGLIGIBLE_EXP_DIFF = 15

function normalize(m: number, e: number): GNum {
  if (m === 0 || !Number.isFinite(m)) return { m: 0, e: 0 }
  const sign = m < 0 ? -1 : 1
  const abs = Math.abs(m)
  const shift = Math.floor(LOG10(abs))
  const nm = abs / Math.pow(10, shift)
  // 处理浮点边界(如 9.9999999 → 10)
  if (nm >= 10) return { m: sign * (nm / 10), e: e + shift + 1 }
  return { m: sign * nm, e: e + shift }
}

/** 构造 GNum,接受 number / 序列化对象 */
export function gn(v: number | GNum): GNum {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v === 0) return { m: 0, e: 0 }
    return normalize(v, 0)
  }
  // 反序列化容错:损坏数据回退为 0
  if (
    typeof v !== 'object' ||
    v === null ||
    typeof v.m !== 'number' ||
    typeof v.e !== 'number' ||
    !Number.isFinite(v.e)
  ) {
    return { m: 0, e: 0 }
  }
  return normalize(v.m, v.e)
}

export const gnZero = (): GNum => ({ m: 0, e: 0 })

export function isZero(a: GNum): boolean {
  return a.m === 0
}

export function add(a: GNum, b: GNum): GNum {
  if (a.m === 0) return { ...b }
  if (b.m === 0) return { ...a }
  const diff = a.e - b.e
  if (diff > NEGLIGIBLE_EXP_DIFF) return { ...a }
  if (diff < -NEGLIGIBLE_EXP_DIFF) return { ...b }
  return normalize(a.m + b.m * Math.pow(10, -diff), a.e)
}

export function neg(a: GNum): GNum {
  return { m: -a.m, e: a.e }
}

export function sub(a: GNum, b: GNum): GNum {
  return add(a, neg(b))
}

/** 减法并保底为 0(资源扣除用) */
export function subClamp(a: GNum, b: GNum): GNum {
  const r = sub(a, b)
  return r.m < 0 ? gnZero() : r
}

export function mul(a: GNum, b: GNum): GNum {
  if (a.m === 0 || b.m === 0) return gnZero()
  return normalize(a.m * b.m, a.e + b.e)
}

export function mulN(a: GNum, n: number): GNum {
  if (n === 0 || a.m === 0) return gnZero()
  return normalize(a.m * n, a.e)
}

export function div(a: GNum, b: GNum): GNum {
  if (b.m === 0) return gnZero()
  if (a.m === 0) return gnZero()
  return normalize(a.m / b.m, a.e - b.e)
}

/** base^exp,以对数空间计算避免溢出 */
export function powN(base: number, exp: number): GNum {
  if (base <= 0) return gnZero()
  const total = exp * LOG10(base)
  const e = Math.floor(total)
  return normalize(Math.pow(10, total - e), e)
}

/** 比较:a>b → 1, a<b → -1, 相等 → 0 */
export function cmp(a: GNum, b: GNum): number {
  // 零永远排在正数之下、负数之上(不认 m===0 对象的指数)
  if (a.m === 0 && b.m === 0) return 0
  if (a.m === 0) return b.m > 0 ? -1 : 1
  if (b.m === 0) return a.m > 0 ? 1 : -1
  if (a.m > 0 && b.m < 0) return 1
  if (a.m < 0 && b.m > 0) return -1
  // 同号:负数指数越大负得越狠,数值反而越小,不能照搬正数的大小序
  const bothNeg = a.m < 0
  if (a.e !== b.e) {
    // 指数不同不能直接比大小:指数序只在尾数归一化([1,10))时成立。
    // 哪天有个未归一化的 GNum 流进来(如 $patch 原始对象、手工构造、损坏存档),
    // 照旧的 a.e>b.e 判定会静默给出错误答案 —— `修为未至圆满` 卡住突破等。
    // 统一对齐到较大指数再比尾数即可鲁棒;量级差过大(>NEGLIGIBLE_EXP_DIFF)才认指数。
    const diff = a.e - b.e
    if (Math.abs(diff) <= NEGLIGIBLE_EXP_DIFF) {
      const am = a.m * Math.pow(10, diff)
      if (am === b.m) return 0
      return bothNeg ? (am < b.m ? -1 : 1) : am > b.m ? 1 : -1
    }
    if (a.e > b.e) return bothNeg ? -1 : 1
    return bothNeg ? 1 : -1
  }
  if (a.m === b.m) return 0
  return a.m > b.m ? 1 : -1
}

export const gte = (a: GNum, b: GNum): boolean => cmp(a, b) >= 0
export const gt = (a: GNum, b: GNum): boolean => cmp(a, b) > 0
export const lte = (a: GNum, b: GNum): boolean => cmp(a, b) <= 0
export const lt = (a: GNum, b: GNum): boolean => cmp(a, b) < 0

export function gnMax(a: GNum, b: GNum): GNum {
  return gte(a, b) ? { ...a } : { ...b }
}

export function gnMin(a: GNum, b: GNum): GNum {
  return lte(a, b) ? { ...a } : { ...b }
}

/** 转普通数字(超出范围返回 Infinity,仅用于展示或小数值) */
export function toNum(a: GNum): number {
  if (a.m === 0) return 0
  if (a.e > 308) return Infinity
  return a.m * Math.pow(10, a.e)
}

/** 安全比值 a/b → number,指数差被钳制,用于血量百分比/胜率估算 */
export function ratio(a: GNum, b: GNum): number {
  if (b.m === 0) return a.m === 0 ? 0 : Infinity
  if (a.m === 0) return 0
  const diff = Math.max(-15, Math.min(15, a.e - b.e))
  return (a.m / b.m) * Math.pow(10, diff)
}

/** 进度百分比(0~1) */
export function progress(cur: GNum, target: GNum): number {
  const r = ratio(cur, target)
  return Math.max(0, Math.min(1, r))
}
