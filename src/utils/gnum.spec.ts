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
    // 指数也必须是有限数:{m:1,e:Infinity} 曾能穿过反序列化,变成无限财富
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

  it('比较', () => {
    expect(cmp(gn(100), gn(99))).toBe(1)
    expect(cmp(gn(1e20), gn(2e20))).toBe(-1)
    expect(gte(gn(5), gn(5))).toBe(true)
  })

  it('未归一化输入也能正确比较(指数序只在 [1,10) 尾数下成立)', () => {
    // $patch / 手工构造的 {m:1e12,e:0} 未经 normalize,照旧实现会被误判为小于 92
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
    // 指数不同:负指数越大负得越狠,数值越小(-100000 < -100)
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
