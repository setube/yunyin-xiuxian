/** GameNumber 大数:{ m, e } 表示 m × 10^e;纯函数,普通对象,可直接 JSON 持久化 */
import type { GNum } from '@/types'

const LOG10 = Math.log10

/** 对齐加法时,指数差超过该值的小数直接忽略 */
const NEGLIGIBLE_EXP_DIFF = 15

function normalize(m: number, e: number): GNum {
  /*
   * 两个参数都要查。原先只查 m —— 于是 e 是 NaN/Infinity 时,
   * `e + shift` 与 `e + shift + 1` 会把坏值原样带出去:
   *   add({m:1,e:Infinity}, gn(1)) → { m: 1, e: NaN }
   *   mul({m:2,e:NaN}, gn(2))      → { m: 4, e: NaN }
   * normalize 是全部算术的公共出口(gn/add/sub/mul/div/neg…),
   * 漏在这里等于所有运算都漏。
   */
  if (m === 0 || !Number.isFinite(m) || !Number.isFinite(e)) return { m: 0, e: 0 }
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

/** 操作数是否可参与运算(m/e 都有限);四处 `{...a}` 早退都绕过 normalize,故在入口挡 */
function usable(a: GNum): boolean {
  return Number.isFinite(a.m) && Number.isFinite(a.e)
}

export function add(a: GNum, b: GNum): GNum {
  if (!usable(a) || !usable(b)) return gnZero()
  if (a.m === 0) return { ...b }
  if (b.m === 0) return { ...a }
  const diff = a.e - b.e
  if (diff > NEGLIGIBLE_EXP_DIFF) return { ...a }
  if (diff < -NEGLIGIBLE_EXP_DIFF) return { ...b }
  return normalize(a.m + b.m * Math.pow(10, -diff), a.e)
}

export function neg(a: GNum): GNum {
  // neg 不经 normalize,坏值得在这里挡(其余算术都走 normalize 了)
  if (!Number.isFinite(a.m) || !Number.isFinite(a.e)) return gnZero()
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
  /*
   * 坏值当 0 看。缺这道守卫时同一对参数会给出自相矛盾的答案:
   * 以 {m:1,e:Infinity} 与 gn(1) 为例,cmp(坏,1) 给 -1、cmp(1,坏) 也给 -1,
   * 两边都说自己小 —— 于是 gte(坏,1)=false 而 gte(1,坏)=true,
   * 排序与「够不够」判断都会错,且错法取决于调用方把谁写在前面。
   */
  const ok = (v: GNum): boolean => Number.isFinite(v.m) && Number.isFinite(v.e)
  if (!ok(a) || !ok(b)) {
    const za = ok(a) ? a : gnZero()
    const zb = ok(b) ? b : gnZero()
    if (za === a && zb === b) return 0
    return cmp(za, zb)
  }
  // 零永远排在正数之下、负数之上(不认 m===0 对象的指数)
  if (a.m === 0 && b.m === 0) return 0
  if (a.m === 0) return b.m > 0 ? -1 : 1
  if (b.m === 0) return a.m > 0 ? 1 : -1
  if (a.m > 0 && b.m < 0) return 1
  if (a.m < 0 && b.m > 0) return -1
  // 同号:负数指数越大,数值越小
  const bothNeg = a.m < 0
  if (a.e !== b.e) {
    // 指数序只在尾数归一化([1,10))时成立;未归一化输入($patch 原始对象、手工构造、损坏存档)
    // 须对齐指数再比尾数。量级差 >NEGLIGIBLE_EXP_DIFF 才认指数。
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
  /**
   * 直接算完再判结果,而不是只看指数。
   *
   * 只看指数会漏判:m × 10^308 在 m > 1.7976… 时已超过 Number.MAX_VALUE,
   * 例如 { m: 1.9, e: 308 } 这类值指数没过线、乘出来却是 Infinity。
   * 两种写法的**返回值此刻完全一致**(过线的照样得出 Infinity),
   * 差别在于这里不再依赖「308 这个数字刚好安全」这个隐含前提 ——
   * 将来若调整 GNum 的表示范围,溢出判据不需要跟着改。
   */
  const v = a.m * Math.pow(10, a.e)
  return Number.isFinite(v) ? v : Infinity
}

/** 安全比值 a/b → number,指数差被钳制,用于血量百分比/胜率估算 */
export function ratio(a: GNum, b: GNum): number {
  if (b.m === 0) return a.m === 0 ? 0 : Infinity
  if (a.m === 0) return 0
  const diff = Math.max(-15, Math.min(15, a.e - b.e))
  return (a.m / b.m) * Math.pow(10, diff)
}

/**
 * 进度百分比(0~1)。
 *
 * **不能只靠 `Math.max/min` 收口**:它们挡不住 NaN —— `Math.max(0, Math.min(1, NaN))`
 * 仍是 NaN(AGENTS.md 明文点过这个坑,反复踩)。输入是 GNum,`{ m: NaN }` 这类
 * 结构上合法、数值上非法的值能一路穿到界面上,印成「进度 NaN%」。
 * 这里先判非有限:算不出就给 0(进度条的合法下限),并夹回 0~1。
 *
 * @param cur    当前值
 * @param target 目标值
 */
export function progress(cur: GNum, target: GNum): number {
  const r = ratio(cur, target)
  if (!Number.isFinite(r)) return r > 0 ? 1 : 0
  return Math.max(0, Math.min(1, r))
}
