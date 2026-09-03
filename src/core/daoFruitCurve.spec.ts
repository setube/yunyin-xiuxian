/* eslint-disable no-console */
/**
 * 道果曲线审计
 *
 * 轮回审计已钉死一级根因:道果是唯一无界的永久收益项。
 * 本套用例把五种候选曲线放在同一把尺子下跑对照,供决策——只出数据,不改数值。
 *
 * 对照的核心问题:**第 100 世到第 200 世,玩家为什么还应该愿意轮回。**
 * 对应 marginalPer100 指标(再轮回一百世能把单世耗时再压掉多少)。
 *
 * 公平性:所有曲线在第二世(道果 168)对齐到相同有效值,
 * 比的是形状而非量级——否则某条只因整体调低就显得更优。
 */
import { describe, expect, it } from 'vitest'
import {
  convergence,
  curveTable,
  equivalentFruit,
  FRUIT_CURVES,
  fruitCurve,
  hoursToPeakUnder,
  LIFECYCLE_LIVES,
  lifecycleTable,
  marginalPerLife,
  partialCurve,
  redemptionAt
} from './daoFruitCurve'
import { FRUIT_PER_LIFE } from './samsaraAudit'

const LIVES = [2, 10, 20, 50, 100, 200, 500]

describe('道果曲线 · 五案对照', () => {
  it('各曲线的体验形状', () => {
    for (const c of FRUIT_CURVES) {
      console.log(`\n【${c.name}】${c.desc}`)
      for (const r of curveTable(c, LIVES)) {
        console.log(
          `  第 ${String(r.life).padStart(3)} 世 · ${r.hours.toFixed(1).padStart(7)}h` +
            `(第一世的 ${(r.vsFirst * 100).toFixed(1).padStart(5)}%) · 累计 ${(r.cumulative / 1000).toFixed(1)}k h` +
            ` · 再轮回百世可再省 ${(r.marginalPer100 * 100).toFixed(1)}%`
        )
      }
    }
  })

  it('五条曲线在第二世严格对齐,对照的是形状不是量级', () => {
    const h2 = FRUIT_CURVES.map(c => hoursToPeakUnder(c, 2))
    const base = h2[0]!
    for (const h of h2) {
      // E 因取对数近似,允许 2% 内偏差;其余应几乎相同
      expect(Math.abs(h - base) / base).toBeLessThan(0.02)
    }
    console.log(`\n第二世耗时:${h2.map(h => h.toFixed(0) + 'h').join(' / ')} —— 起点一致`)
  })
})

describe('道果曲线 · 当前方案的问题', () => {
  it('A 当前:深世仍在大幅压缩,五百世后单世只剩 8 小时', () => {
    const a = fruitCurve('current')
    const h500 = hoursToPeakUnder(a, 500)
    const h1 = hoursToPeakUnder(a, 1)
    expect(h500 / h1).toBeLessThan(0.01)
    // 且到五百世还有两位数的边际收益,意味着永远在加速
    const marginal = 1 - hoursToPeakUnder(a, 600) / h500
    expect(marginal).toBeGreaterThan(0.1)
    console.log(`\nA 第500世 ${h500.toFixed(1)}h(第一世的 ${((h500 / h1) * 100).toFixed(1)}%),再百世仍可省 ${(marginal * 100).toFixed(0)}%`)
  })

  it('A 的边际收益衰减太慢:百世时还能再省将近一半', () => {
    const a = fruitCurve('current')
    const m100 = 1 - hoursToPeakUnder(a, 200) / hoursToPeakUnder(a, 100)
    // 实测 46%——这正是「轮回变成永久加速器」的数值表达
    expect(m100).toBeGreaterThan(0.4)
    console.log(`\nA 第100→200世边际收益 ${(m100 * 100).toFixed(0)}%,轮回仍是强加速器`)
  })
})

describe('道果曲线 · 候选方案的取舍', () => {
  it('D 总量封顶确有断崖:拐点后边际收益直接归零', () => {
    const rows = convergence()
    const d = rows.find(r => r.curve.id === 'hardcap')!
    expect(d.hasCliff).toBe(true)
    expect(d.marginal100).toBeCloseTo(0, 6)
    expect(d.h100).toBeCloseTo(d.h500, 6)
    // 这就是玩家会读成「人为封顶」的那个形状:第 20 世往后完全静止
    console.log(`\nD 第100世与第500世耗时相同(${d.h100.toFixed(1)}h),此后轮回零收益`)
  })

  it('只有 D 是有界的,其余四条都无界——但无界不等于没收敛', () => {
    for (const c of FRUIT_CURVES) {
      expect(c.bounded).toBe(c.id === 'hardcap')
    }
    const rows = convergence()
    for (const r of rows) {
      if (r.curve.id === 'hardcap') continue
      // 无界曲线在深世仍有正收益,不会给玩家「到此为止」的观感
      expect(r.marginal400).toBeGreaterThan(0)
    }
  })

  it('B 对数压得最狠:代价是第十世起几乎不再有轮回收益', () => {
    const b = fruitCurve('log')
    const h10 = hoursToPeakUnder(b, 10)
    const h1 = hoursToPeakUnder(b, 1)
    // 十世后仍需第一世的四成时间,轮回的正反馈基本被掐断
    expect(h10 / h1).toBeGreaterThan(0.35)
    const m10 = 1 - hoursToPeakUnder(b, 110) / h10
    expect(m10).toBeLessThan(0.2)
    console.log(`\nB 第10世仍需 ${h10.toFixed(0)}h(第一世的 ${((h10 / h1) * 100).toFixed(0)}%),再百世只省 ${(m10 * 100).toFixed(0)}%`)
  })

  it('C 分段软帽在拐点处收得很急,前十世与当前一致、之后近乎静止', () => {
    const c = fruitCurve('softcap')
    // 拐点前与 A 完全重合
    expect(hoursToPeakUnder(c, 10)).toBeCloseTo(hoursToPeakUnder(fruitCurve('current'), 10), 6)
    // 拐点后迅速趋平:第 20 世到第 500 世只再省两成
    const drop = 1 - hoursToPeakUnder(c, 500) / hoursToPeakUnder(c, 20)
    expect(drop).toBeLessThan(0.25)
    console.log(`\nC 第20→500世仅再省 ${(drop * 100).toFixed(0)}%,拐点后体验接近静止`)
  })

  it('E 周期折算的衰减最平顺:无断点,且深世仍留有可感知的收益', () => {
    const rows = convergence()
    const e = rows.find(r => r.curve.id === 'partial')!
    const a = rows.find(r => r.curve.id === 'current')!
    // 相比 A 明显收敛:百世边际从 46% 降到 18%
    expect(e.marginal100).toBeLessThan(a.marginal100 * 0.5)
    // 但四百世时仍有正收益,不至于让玩家觉得「到头了」
    expect(e.marginal400).toBeGreaterThan(0.02)
    expect(e.hasCliff).toBe(false)
    console.log(
      `\nE 第100→200世边际 ${(e.marginal100 * 100).toFixed(0)}%(A 为 ${(a.marginal100 * 100).toFixed(0)}%),` +
        `第400→500世仍有 ${(e.marginal400 * 100).toFixed(1)}%,全程无断点`
    )
  })
})

describe('道果曲线 · 折算口径自洽', () => {
  it('等效道果折算能还原各曲线的有效值', () => {
    for (const c of FRUIT_CURVES) {
      for (const f of [0, FRUIT_PER_LIFE, FRUIT_PER_LIFE * 50]) {
        const eq = equivalentFruit(c, f)
        // 折算后再走一遍当前曲线,应回到该曲线自己的有效值
        expect(Math.pow(eq, 0.9)).toBeCloseTo(c.effective(f), 6)
      }
    }
  })

  it('道果为零时各曲线一致,不会凭空产生加成', () => {
    for (const c of FRUIT_CURVES) {
      expect(c.effective(0)).toBeCloseTo(0, 6)
      expect(equivalentFruit(c, 0)).toBeCloseTo(0, 6)
    }
  })

  it('各曲线单调不减:道果只多不少,收益不应倒退', () => {
    for (const c of FRUIT_CURVES) {
      let prev = -1
      for (let n = 0; n <= 500; n += 50) {
        const v = c.effective(n * FRUIT_PER_LIFE)
        expect(v).toBeGreaterThanOrEqual(prev)
        prev = v
      }
    }
  })
})

describe('道果曲线 · 生命周期窗口(1~30 世)', () => {
  it('主要设计窗口内的逐世读数', () => {
    const cases = [fruitCurve('current'), partialCurve(3), partialCurve(5), partialCurve(10)]
    for (const c of cases) {
      console.log(`\n【${c.name}】`)
      console.log('   世    耗时   占首世  逐世收益  兑现度')
      for (const r of lifecycleTable(c)) {
        console.log(
          `  ${String(r.life).padStart(2)} ${r.hours.toFixed(0).padStart(6)}h ` +
            `${(r.vsFirst * 100).toFixed(1).padStart(6)}% ${(r.marginal * 100).toFixed(1).padStart(7)}% ` +
            `${(r.redemption * 100).toFixed(0).padStart(6)}%`
        )
      }
    }
  })

  it('关键发现:拐点参数改不了兑现节奏,只改最终地板', () => {
    // 直觉上「把 KNEE 前移就能让衰减更早发生」——数据否定了这个假设。
    // 兑现节奏由道果的累积方式决定(每世固定 +168,前几世的增量占比天然最大),
    // 各方案在窗口内的兑现进度几乎重合
    const cases = [fruitCurve('current'), partialCurve(2), partialCurve(5), partialCurve(10)]
    const at10 = cases.map(c => redemptionAt(c, 10))
    for (const r of at10) {
      expect(r).toBeGreaterThan(0.88)
      expect(r).toBeLessThan(0.94)
    }
    console.log(`\n第10世兑现度:${at10.map(r => (r * 100).toFixed(0) + '%').join(' / ')} —— 四条曲线几乎重合`)

    // 真正被拐点改变的是第 30 世的地板
    const floors = cases.map(c => hoursToPeakUnder(c, 30) / hoursToPeakUnder(c, 1))
    console.log(`第30世地板:${floors.map(f => (f * 100).toFixed(1) + '%').join(' / ')} —— 差异全在这里`)
    expect(Math.max(...floors) / Math.min(...floors)).toBeGreaterThan(2)
  })

  it('因此决策项不是「衰减发生在第几世」,而是「第30世该剩多少」', () => {
    // 当前方案把第 30 世压到首世的 5.6%(约 97h,四天就能重修一遍完整人生)
    const a = hoursToPeakUnder(fruitCurve('current'), 30) / hoursToPeakUnder(fruitCurve('current'), 1)
    expect(a).toBeLessThan(0.07)
    // 拐点越靠前,地板越高:第30世仍需首世的一到两成
    const k3 = hoursToPeakUnder(partialCurve(3), 30) / hoursToPeakUnder(partialCurve(3), 1)
    const k10 = hoursToPeakUnder(partialCurve(10), 30) / hoursToPeakUnder(partialCurve(10), 1)
    expect(k3).toBeGreaterThan(k10)
    expect(k10).toBeGreaterThan(a)
    console.log(
      `\n第30世耗时占首世:当前 ${(a * 100).toFixed(1)}% / 拐点10世 ${(k10 * 100).toFixed(1)}% / 拐点3世 ${(k3 * 100).toFixed(1)}%`
    )
  })

  it('前十世兑现九成优势,十一世往后本就该转向「走不同的人生」', () => {
    // 这条对所有候选都成立,是道果累积方式的固有性质,不是某条曲线的特性。
    // 它给出的设计含义:11~30 世不必再靠压缩耗时提供动力,
    // 那段该由解锁、命题、规则适应之类的非战力收益承接
    for (const c of [fruitCurve('current'), partialCurve(3), partialCurve(5), partialCurve(10)]) {
      expect(redemptionAt(c, 10)).toBeGreaterThan(0.88)
      // 而 11~30 世只剩不到一成二的优势可兑现
      expect(1 - redemptionAt(c, 10)).toBeLessThan(0.12)
    }
  })

  it('逐世收益在窗口内衰减平顺,无某一世突然归零', () => {
    for (const c of [fruitCurve('current'), partialCurve(3), partialCurve(10)]) {
      let prev = Infinity
      for (const life of LIFECYCLE_LIVES) {
        const m = marginalPerLife(c, life)
        expect(m).toBeGreaterThan(0)
        expect(m).toBeLessThanOrEqual(prev + 1e-9)
        prev = m
      }
    }
  })
})
