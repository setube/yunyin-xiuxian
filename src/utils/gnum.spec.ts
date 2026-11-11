import { describe, expect, it } from 'vitest'
import { add, cmp, div, gn, gnZero, gte, gt, lte, mul, mulN, neg, powN, progress, ratio, sub, subClamp, toNum } from './gnum'

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

/**
 * 坏值守卫。
 *
 * 这一族缺口比 format 那边更基础:normalize 是全部算术的公共出口,
 * 它只查 m 不查 e,于是 e 为 NaN/Infinity 时坏值一路传下去。
 * add / neg / cmp 各有绕过 normalize 的路径,得单独挡。
 */
describe('GameNumber 的坏值守卫', () => {
  const BAD = [
    { m: 1, e: Number.NaN },
    { m: 1, e: Number.POSITIVE_INFINITY },
    { m: 1, e: Number.NEGATIVE_INFINITY },
    { m: Number.NaN, e: 0 },
    { m: Number.POSITIVE_INFINITY, e: 0 }
  ] as const

  it('五个算术口对坏操作数都返回有限的 0,不把坏值传下去', () => {
    for (const b of BAD) {
      for (const [name, fn] of [
        ['add', () => add(b, gn(1))],
        ['sub', () => sub(b, gn(1))],
        ['mul', () => mul(b, gn(2))],
        ['div', () => div(b, gn(2))],
        ['neg', () => neg(b)]
      ] as const) {
        const r = fn()
        expect(Number.isFinite(r.m), `${name}(${JSON.stringify(b)}).m`).toBe(true)
        expect(Number.isFinite(r.e), `${name}(${JSON.stringify(b)}).e`).toBe(true)
        expect(r, `${name}(${JSON.stringify(b)}) 应返回 0`).toEqual(gnZero())
      }
    }
  })

  /**
   * cmp 的坏值必须自洽:坏值当 0 看。
   *
   * 修之前同一对参数会自相矛盾 —— cmp(坏,1) 与 cmp(1,坏) 都给 -1,
   * 于是 gte(坏,1)=false 而 gte(1,坏)=true,排序与「够不够」判断都错,
   * 且错法取决于调用方把谁写在前面。
   */
  it('cmp 遇坏值当 0 看,反身与互换都自洽', () => {
    for (const b of BAD) {
      const ab = cmp(b, gn(1))
      const ba = cmp(gn(1), b)
      expect(ab, `cmp(坏,1) 与 cmp(1,坏) 应互为相反数`).toBe(-ba)
      expect(ab, '坏值当 0 看,应小于 1').toBe(-1)
      expect(cmp(b, gnZero()), '坏值与 0 应判相等').toBe(0)
    }
  })

  it('守卫不误伤正常值', () => {
    expect(add(gn(1000), gn(2000))).toEqual(gn(3000))
    expect(sub(gn(2000), gn(1000))).toEqual(gn(1000))
    expect(mul(gn(2), gn(3))).toEqual(gn(6))
    expect(div(gn(6), gn(3))).toEqual(gn(2))
    expect(neg(gn(5))).toEqual(gn(-5))
    expect(cmp(gn(2), gn(1))).toBe(1)
    expect(cmp(gn(1), gn(2))).toBe(-1)
    expect(cmp(gn(1), gn(1))).toBe(0)
  })
})

/**
 * progress 挡得住坏 GNum。
 *
 * `ratio` 对 `{ m: NaN }` 这类结构合法、数值非法的值返回 NaN,而
 * `Math.max(0, Math.min(1, NaN))` 仍是 NaN —— 两道钳制串起来也留不住它
 * (AGENTS.md 明文点过这个坑)。坏值一路穿到界面就是「进度 NaN%」。
 *
 * 实测写法:界面读 progress 的地方是 `Math.round(x * 100)`,NaN 直接印成 NaN%。
 */
describe('进度 · 坏值不得穿成 NaN', () => {
  it('NaN 尾数给出合法下限,而不是 NaN', () => {
    const bad = { m: NaN, e: 0 }
    const out = progress(bad, gn(100))
    expect(Number.isNaN(out), 'NaN 漏出来了').toBe(false)
    expect(out).toBe(0)
    // 阴性对照:这正是修复前的算式
    expect(Math.max(0, Math.min(1, NaN)), 'Math.max/min 确实挡不住 NaN').toBeNaN()
  })

  it('Infinity 按上限算', () => {
    // 目标为 0(除零)时 ratio 给 Infinity
    expect(progress(gn(5), gn(0))).toBe(1)
  })

  it('正常值仍是线性的', () => {
    expect(progress(gn(25), gn(100))).toBeCloseTo(0.25, 10)
    expect(progress(gn(0), gn(100))).toBe(0)
    expect(progress(gn(200), gn(100))).toBe(1)
  })
})
