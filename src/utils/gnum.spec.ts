import { describe, expect, it } from 'vitest'
import { add, cmp, div, gn, gte, gt, lte, mul, mulN, powN, progress, ratio, sub, subClamp, toNum } from './gnum'

describe('GameNumber 大数运算', () => {
  it('构造与规范化', () => {
    expect(gn(0)).toEqual({ m: 0, e: 0 })
    expect(gn(1234)).toEqual({ m: 1.234, e: 3 })
    expect(gn(0.5).m).toBeCloseTo(5)
    expect(gn(0.5).e).toBe(-1)
  })

  it('损坏数据回退为零', () => {
    expect(gn({ m: Number.NaN, e: 2 })).toEqual({ m: 0, e: 0 })
    // 指数也须是有限数
    expect(gn({ m: 1, e: Number.POSITIVE_INFINITY })).toEqual({ m: 0, e: 0 })
    expect(gn({ m: 1, e: Number.NaN })).toEqual({ m: 0, e: 0 })
    expect(gn(null as unknown as number)).toEqual({ m: 0, e: 0 })
  })

  it('加减法', () => {
    expect(toNum(add(gn(100), gn(23)))).toBeCloseTo(123)
    expect(toNum(sub(gn(100), gn(30)))).toBeCloseTo(70)
    expect(subClamp(gn(10), gn(100))).toEqual({ m: 0, e: 0 })
  })

  it('量级悬殊时小数被忽略', () => {
    const big = gn(1e30)
    expect(add(big, gn(1))).toEqual(big)
  })

  it('乘除法与幂', () => {
    expect(toNum(mul(gn(200), gn(300)))).toBeCloseTo(60000)
    expect(toNum(div(gn(1e10), gn(4)))).toBeCloseTo(2.5e9)
    expect(toNum(mulN(gn(50), 3))).toBeCloseTo(150)
    const p = powN(24, 9)
    expect(p.e).toBeGreaterThan(11)
    expect(toNum(p) / Math.pow(24, 9)).toBeCloseTo(1, 6)
  })

  it('超大数不溢出', () => {
    const huge = powN(10, 500)
    expect(huge.e).toBe(500)
    expect(toNum(mul(huge, huge))).toBe(Infinity)
    expect(mul(huge, huge).e).toBe(1000)
  })

  /**
   * 溢出判据不能只看指数:m × 10^308 在 m > 1.7976… 时就已超过 Number.MAX_VALUE。
   * 旧写法 `if (a.e > 308) return Infinity` 放 m 较大的数过去,乘出来照样是 Infinity ——
   * 守卫对那一档形同虚设。现在直接算完再判结果是否有限。
   */
  it('e=308 时 m 较大也会溢出(溢出判据不能只看指数)', () => {
    expect(toNum({ m: 1, e: 308 }), 'm=1 仍应可表示').toBeCloseTo(1e308, -300)
    expect(toNum({ m: 1.9, e: 308 }), 'm=1.9 × 10^308 已超 MAX_VALUE').toBe(Infinity)
    expect(toNum({ m: 9.9, e: 308 })).toBe(Infinity)
  })

  it('任何情况下都不返回 NaN(溢出只可能是 Infinity)', () => {
    for (const g of [
      { m: 0, e: 0 },
      { m: 1, e: 0 },
      { m: 1, e: 307 },
      { m: 1, e: 308 },
      { m: 1.9, e: 308 },
      { m: 1, e: 309 },
      { m: 1e-300, e: -50 }
    ]) {
      const v = toNum(g)
      expect(Number.isNaN(v), `${JSON.stringify(g)} 算出了 NaN`).toBe(false)
    }
  })

  it('未溢出的值与直接相乘一致(修形不改正常数值)', () => {
    for (const g of [{ m: 1.5, e: 3 }, { m: 12, e: 15 }, { m: 1, e: 100 }, { m: 0, e: 5 }]) {
      const direct = g.m === 0 ? 0 : g.m * Math.pow(10, g.e)
      expect(toNum(g)).toBe(direct)
    }
  })

  it('比较', () => {
    expect(cmp(gn(100), gn(99))).toBe(1)
    expect(cmp(gn(1e20), gn(2e20))).toBe(-1)
    expect(gte(gn(5), gn(5))).toBe(true)
  })

  it('未归一化输入也能正确比较(指数序只在 [1,10) 尾数下成立)', () => {
    // $patch / 手工构造的 {m:1e12,e:0} 未经 normalize
    expect(cmp({ m: 1e12, e: 0 }, { m: 9.2, e: 1 })).toBe(1) // 1e12 > 92
    expect(gte({ m: 1e12, e: 0 }, { m: 9.2, e: 1 })).toBe(true)
    expect(cmp({ m: 500, e: 0 }, gn(1000))).toBe(-1) // 500 < 1000,但尾数未归一化
    // 负号方向不因对齐翻转
    expect(cmp({ m: -100, e: 3 }, { m: -1, e: 6 })).toBe(1) // -1e5 > -1e6
    // 量级悬殊仍走指数序(NEGLIGIBLE_EXP_DIFF 之外)
    expect(cmp(gn(1e30), gn(1))).toBe(1)
    expect(cmp(gn(1), gn(1e30))).toBe(-1)
  })

  it('同为负数时按数值序比较', () => {
    // 指数不同:负数指数越大,数值越小(-100000 < -100)
    expect(cmp({ m: -1, e: 5 }, { m: -1, e: 3 })).toBe(-1)
    expect(cmp({ m: -1, e: 3 }, { m: -1, e: 5 })).toBe(1)
    // 指数相同:尾数越大越靠近零,数值越大(-1×10^3 > -2×10^3)
    expect(cmp({ m: -1, e: 3 }, { m: -2, e: 3 })).toBe(1)
    expect(cmp({ m: -2, e: 3 }, { m: -1, e: 3 })).toBe(-1)
    expect(cmp(gn(-1234), gn(-1200))).toBe(-1)
    expect(cmp(gn(-1200), gn(-1234))).toBe(1)
  })

  it('正负混合与零的比较', () => {
    expect(cmp({ m: -1, e: 5 }, gn(1))).toBe(-1)
    expect(cmp(gn(1), { m: -1, e: 5 })).toBe(1)
    expect(cmp(gn(0), { m: -1, e: 5 })).toBe(1)
    expect(cmp({ m: -1, e: 5 }, gn(0))).toBe(-1)
    expect(lte(gn(-8), gn(0))).toBe(true)
    expect(gt(gn(0), gn(-8))).toBe(true)
  })

  it('比值与进度', () => {
    expect(ratio(gn(50), gn(200))).toBeCloseTo(0.25)
    expect(progress(gn(150), gn(100))).toBe(1)
    expect(progress(gn(0), gn(100))).toBe(0)
  })
})
