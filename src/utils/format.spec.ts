import { describe, expect, it } from 'vitest'
import { cnNumber, formatChoiceSpan, formatClock, formatCountdown, formatDuration, formatGap, formatGN, formatNum, formatPercent, formatRate, formatStamp, formatYears, roundToSum } from './format'
import { gn, powN } from './gnum'

describe('数值格式化', () => {
  it('千位分隔', () => {
    expect(formatGN(1234)).toBe('1,234')
    expect(formatGN(999)).toBe('999')
  })

  it('中文单位', () => {
    expect(formatGN(123456)).toBe('12.35万')
    expect(formatGN(123456789)).toBe('1.235亿')
    expect(formatGN(1.24e13)).toBe('12.4兆')
  })

  it('尾零裁剪', () => {
    expect(formatGN(120000)).toBe('12万')
    expect(formatGN(100000000)).toBe('1亿')
  })

  it('超大数走科学计数法', () => {
    expect(formatGN(powN(10, 52))).toMatch(/e52$/)
  })

  it('科学计数 mantissa 四舍五入到 10 时进位(9.99…eN→1.00eN+1,不产 10.00eN)', () => {
    expect(formatGN({ m: 9.999, e: 52 })).toBe('1.00e53')
    expect(formatGN({ m: 9.494, e: 52 })).toBe('9.49e52')
  })

  it('零与负数', () => {
    expect(formatGN(gn(0))).toBe('0')
    expect(formatGN(-123456)).toBe('-12.35万')
  })

  it('时长', () => {
    expect(formatDuration(45)).toBe('45秒')
    expect(formatDuration(65)).toBe('1分5秒')
    expect(formatDuration(3660)).toBe('1小时1分')
    expect(formatDuration(90000)).toBe('1天1小时')
  })

  it('倒计时定宽:同一量级内每秒宽度不变', () => {
    const w = (s: string): number => s.length
    // 分秒量级逐秒走一遍(含 9→10 秒、59→60 秒跳档点)
    const widths = new Set<number>()
    for (let s = 1; s <= 59 * 60; s += 1) widths.add(w(formatCountdown(s)))
    expect([...widths].length, `分秒量级内的宽度有 ${[...widths].join('/')} 种`).toBe(1)
    // 小时量级同理
    const hourWidths = new Set<number>()
    for (let s = 3600; s <= 24 * 3600 - 1; s += 137) hourWidths.add(w(formatCountdown(s)))
    expect([...hourWidths].length).toBe(1)
    // 天量级同理
    const dayWidths = new Set<number>()
    for (let s = 86400; s <= 9 * 86400; s += 601) dayWidths.add(w(formatCountdown(s)))
    expect([...dayWidths].length).toBe(1)
  })

  it('倒计时读得出、且与 formatDuration 同一个意思', () => {
    expect(formatCountdown(7)).toBe('00分07秒')
    expect(formatCountdown(65)).toBe('01分05秒')
    expect(formatCountdown(3660)).toBe('01时01分')
    expect(formatCountdown(90000)).toBe('1天01时')
    // 非法值占位与 formatDuration 一致
    expect(formatCountdown(NaN)).toBe('--')
    expect(formatCountdown(-5)).toBe('00分00秒')
  })

  it('百分比', () => {
    expect(formatPercent(0.125)).toBe('12.5%')
    expect(formatPercent(0.5)).toBe('50%')
  })

  it('非法百分比显示 --', () => {
    expect(formatPercent(NaN)).toBe('--')
    expect(formatPercent(Infinity)).toBe('--')
    expect(formatPercent(-Infinity)).toBe('--')
    // x 有限但 x*100 上溢成 Infinity
    expect(formatPercent(1e307)).toBe('--')
  })

  it('非法时长显示 --', () => {
    expect(formatDuration(NaN)).toBe('--')
    expect(formatDuration(Infinity)).toBe('--')
  })

  it('小正数不丢精度为 0', () => {
    expect(formatGN(0.04)).toBe('0.04')
    expect(formatGN(0.125)).toBe('0.1')
    expect(formatGN(0.5)).toBe('0.5')
    expect(formatGN(1)).toBe('1')
  })

  it('更细碎的正数也不该显示成 0(位数随数量级抬升)', () => {
    expect(formatGN(0.004)).toBe('0.004')
    expect(formatGN(0.0004)).toBe('0.0004')
    expect(formatGN(0.09)).toBe('0.09')
  })

  it('[100,1000) 档与 <100 档一致四舍五入', () => {
    expect(formatGN(999.9)).toBe('1000')
    expect(formatGN(999.4)).toBe('999')
    // 千位档与 <1000 档同口径取整
    expect(formatGN(9999.6)).toBe('10,000')
    expect(formatGN(9999.4)).toBe('9,999')
    expect(formatGN(150)).toBe('150')
  })

  it('极小负百分比不显示为 -0%', () => {
    expect(formatPercent(-0.00001)).toBe('0%')
    expect(formatPercent(-0.005)).toBe('-0.5%')
    expect(formatPercent(0.125)).toBe('12.5%')
  })
})

describe('汉字数字(页面上的数量从来源数出来)', () => {
  it('一位数与十位', () => {
    expect(cnNumber(0)).toBe('零')
    expect(cnNumber(4)).toBe('四')
    expect(cnNumber(8)).toBe('八')
    expect(cnNumber(10)).toBe('十')
    expect(cnNumber(12)).toBe('十二')
    expect(cnNumber(14)).toBe('十四')
    expect(cnNumber(20)).toBe('二十')
    expect(cnNumber(21)).toBe('二十一')
    expect(cnNumber(64)).toBe('六十四')
  })

  it('百千位与内零', () => {
    expect(cnNumber(100)).toBe('一百')
    expect(cnNumber(101)).toBe('一百零一')
    expect(cnNumber(110)).toBe('一百一十')
    expect(cnNumber(999)).toBe('九百九十九')
    expect(cnNumber(1000)).toBe('一千')
    expect(cnNumber(1005)).toBe('一千零五')
    expect(cnNumber(1050)).toBe('一千零五十')
  })

  it('超出范围原样返回(此处的数字本就不该写成汉字)', () => {
    expect(cnNumber(10000)).toBe('10000')
    expect(cnNumber(-1)).toBe('-1')
    expect(cnNumber(1.5)).toBe('1.5')
  })
})

describe('时钟时刻(倒计时那句「约几时归」的落点)', () => {
  it('本地时的 HH:MM,不足两位补零', () => {
    expect(formatClock(new Date(2026, 9, 5, 14, 32).getTime())).toBe('14:32')
    expect(formatClock(new Date(2026, 9, 5, 9, 4).getTime())).toBe('09:04')
    expect(formatClock(new Date(2026, 9, 5, 0, 0).getTime())).toBe('00:00')
  })

  /**
   * 两处调用点的输入都不是本机产生的:导入确认框的 exportedAt 来自别人导出的文件,
   * diag 留档的时间戳来自可能损坏的分片。`new Date(8640000000000001)` 已超出 Date
   * 的合法范围,`getHours()` 返回 NaN —— 原先印出的是「NaN:NaN」。
   */
  it('坏时间戳印占位符,不印 NaN:NaN', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 8640000000000001]) {
      expect(formatClock(bad), `${String(bad)} 印出了 NaN`).toBe('--:--')
    }
    // 边界:Date 合法范围的最大值仍要照常印
    expect(formatClock(8640000000000000)).not.toBe('--:--')
  })
})

/**
 * 导入确认框要回答的是「这份备份比我现在这份旧多少」——只印时刻答不了。
 * 原先那行是 `导出 {{ formatClock(importInspect.exportedAt) }}`,
 * 三天前的备份与一小时前的备份印出来只差一个数字。
 */
describe('带日期的时刻(导入确认框摊开备份新旧)', () => {
  const NOW = new Date(2026, 10, 5, 15, 0).getTime()

  it('同一历年只印月-日与时,不啰嗦年份', () => {
    expect(formatStamp(new Date(2026, 10, 5, 9, 4).getTime(), NOW)).toBe('11-05 09:04')
    expect(formatStamp(new Date(2026, 0, 1, 0, 0).getTime(), NOW)).toBe('01-01 00:00')
  })

  it('跨年补上年份 —— 两份「01-03 09:00」不能分不清', () => {
    expect(formatStamp(new Date(2025, 0, 3, 9, 0).getTime(), NOW)).toBe('2025-01-03 09:00')
  })

  it('坏时间戳印占位符:这个数来自别人导出的文件', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 8640000000000001]) {
      expect(formatStamp(bad, NOW), `${String(bad)} 印出了 NaN`).toBe('--:--')
    }
  })
})

describe('明细取整对账(显示出来的各行相加等于合计)', () => {
  const UNIT = 0.001
  const units = (xs: number[]): number[] => xs.map(x => Math.round(x / UNIT))

  it('一位小数的百分比:各行取整后相加正好是合计取整', () => {
    // 基础 95% · 气运 0.25% · 聚气丹 5% · 封顶 -2.25%,原值合计 98%
    const shown = roundToSum([0.95, 0.0025, 0.05, -0.0225], UNIT)
    expect(units(shown).reduce((a, b) => a + b, 0)).toBe(980)
    shown.forEach((v, i) => expect(Math.abs(v - [0.95, 0.0025, 0.05, -0.0225][i]!)).toBeLessThan(UNIT))
  })

  it('合计按原值取整,差额补给余数最大的一行', () => {
    // 80% + 0.25% = 80.25%:合计取 80.3%,补到 0.25% 那行
    expect(units(roundToSum([0.8, 0.0025], UNIT))).toEqual([800, 3])
  })

  it('浮点尾差不改变取整结果', () => {
    // 0.95 - 3 × 0.03 在浮点里是 0.8599999999999999
    expect(units(roundToSum([0.95 - 3 * 0.03], UNIT))).toEqual([860])
  })


/**
 * 1~100 区间的小数只保留一位 —— 差额提示会因此少报。
 *
 * 实测:丹药「回灵丹」单炉石耗 2.28,持有 2.0 时 `craftShortfall` 算出差 0.28,
 * 经 formatGN 显示成「灵石尚差 0.3」(多报,无害);但持有 2.28 差 0.001 时会显示 0.001,
 * 而差 1.824 这种显示成「1.8」—— 少报 0.024,玩家照提示补足仍炼不成一炉。
 *
 * 本条把现状钉住,不去改 formatGN(它是全站格式化,影响 300+ 处展示)。
 * 真要修,方向是「差额提示单独向上取整」,而不是把全站数字都改成高精度。
 */
it('1~100 之间的小数四舍五入到一位(差额提示可能少报)', () => {
  expect(formatGN(gn(1.824))).toBe('1.8') // 少报
  expect(formatGN(gn(1.86))).toBe('1.9') // 多报
  expect(formatGN(gn(2.28))).toBe('2.3')
  expect(formatGN(gn(2.04))).toBe('2')
  // 小于 0.1 反而按数量级给更多位:这条分支是对的,别一起改掉
  expect(formatGN(gn(0.04))).toBe('0.04')
  expect(formatGN(gn(0.004))).toBe('0.004')
})
})

/**
 * 差额提示专用:位数与 formatGN 同一把尺,但末位一律向上进一。
 * 判据是「按提示补足一定够」,所以每条都拿 formatGN 的读数对账:
 * formatGap(v) 换算成数字必须 ≥ v,且不多进一格。
 */
describe('formatGap 差额向上取整', () => {
  /** 把「1.9」「12.35万」这类读数换回数字,单位按 formatGN 的 4 位一档 */
  const back = (s: string): number => {
    const unit = /万|亿|兆|京|垓/.exec(s)
    const scale = unit ? Math.pow(10000, '万亿兆京垓'.indexOf(unit[0]!) + 1) : 1
    return Number(s.replace(/[,万兆京垓亿]/g, '')) * scale
  }

  it('少报的那一档补足到位:1.824 不再印成 1.8', () => {
    expect(formatGap(gn(1.824))).toBe('1.9')
    expect(back(formatGap(gn(1.824)))).toBeGreaterThanOrEqual(1.824)
    // 同一档里本来就四舍五入上去的值不该再多进一格
    expect(formatGap(gn(1.86))).toBe('1.9')
    expect(formatGap(gn(2.28))).toBe('2.3')
    expect(formatGap(gn(2.04))).toBe('2.1')
  })

  it('小数与整数档都只进到 formatGN 会显示的那一位', () => {
    expect(formatGap(gn(0.04))).toBe('0.04')
    expect(formatGap(gn(0.004))).toBe('0.004')
    expect(formatGap(gn(0.28))).toBe('0.3')
    expect(formatGap(gn(7))).toBe('7')
    expect(formatGap(gn(999))).toBe('999')
    expect(formatGap(gn(1234))).toBe('1,234')
  })

  it('中文单位档同口径向上进,不整档进位', () => {
    expect(formatGap(gn(123500))).toBe('12.35万')
    expect(formatGap(gn(123510))).toBe('12.36万')
    expect(formatGap(gn(1.2351e8))).toBe('1.236亿')
    expect(formatGap(gn(1e6))).toBe('100万')
  })

  it('浮点尾差不会多进一格', () => {
    // 1.8000000000000002 这类值按 0.1 进格仍应是 1.8
    expect(formatGap({ m: 1.8000000000000002, e: 0 })).toBe('1.8')
    expect(formatGap(gn(0.1))).toBe('0.1')
    expect(formatGap(gn(2.3))).toBe('2.3')
  })

  it('零与负数没有「尚差」语义,退回原格式化', () => {
    expect(formatGap(gn(0))).toBe('0')
    expect(formatGap(gn(-5))).toBe('-5')
  })

  /**
   * 坏值守卫。
   *
   * formatGN / formatGap 的入参是 `GNum | number`,走的是
   * `typeof v === 'number' ? gn(v) : v` —— **对象分支不经过 gn()**,
   * 于是反序列化进来的坏 GNum 会直接进后面的算术。
   *
   * 补守卫之前实测:
   *   gn(1, NaN)      → 「NaNundefined」
   *   gn(1, Infinity) → 「1.00eInfinity」
   *   gn(NaN, 0)      → 「∞」
   * 而 formatPercent / formatDuration / formatCountdown 早就返回 `--` 了,只有这两个口漏着。
   */
  it('坏 GNum 印占位符「--」,不印 NaNundefined / 1.00eInfinity / ∞', () => {
    const bads = [
      { m: Number.NaN, e: 0 },
      { m: 1, e: Number.NaN },
      { m: 1, e: Number.POSITIVE_INFINITY },
      { m: Number.POSITIVE_INFINITY, e: 1 },
      { m: Number.NEGATIVE_INFINITY, e: 2 }
    ]
    for (const v of bads) {
      for (const [name, fn] of [
        ['formatGN', formatGN],
        ['formatGap', formatGap]
      ] as const) {
        expect(fn(v), `${name}(${JSON.stringify(v)}) 印出了乱码`).toBe('--')
      }
    }
  })

  it('守卫不误伤正常值', () => {
    expect(formatGN({ m: 1, e: 4 })).toBe('1万')
    expect(formatGN(gn(1234))).toBe('1,234')
    expect(formatGap(gn(880))).toBe('880')
  })

  /**
   * 同一类缺口:formatYears 与 cnNumber 也漏了守卫。
   *
   * 补之前实测:formatYears(NaN) → 「NaN 载」、formatYears(-Infinity) → 「-Infinity 载」、
   * cnNumber(NaN) → 「NaN」。cnNumber 更隐蔽 —— 它的范围判断是
   * `!Number.isInteger(n) || ...`,NaN 恰好命中第一个条件,直接落到 `String(n)`。
   */
  it('formatYears 与 cnNumber 对坏值也印「--」', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(formatYears(bad), `formatYears(${bad}) 印出了乱码`).toBe('--')
      expect(cnNumber(bad), `cnNumber(${bad}) 印出了乱码`).toBe('--')
    }
  })

  /**
   * roundToSum 的坏值守卫。
   *
   * 补之前实测:unit 为 0 / NaN / Infinity 时每一项都变 NaN;
   * values 里某一项是 NaN / Infinity 时那一项变 NaN,还会把 target 合计带偏。
   * 返回的 NaN 会原样进调用方的展示与配色判断
   * (唯一调用点 cultivationText.ts 的 breakthroughRateView)。
   */
  it('roundToSum 遇坏输入返回全 0,不返回 NaN', () => {
    const badCases = [
      ['unit=0', roundToSum([1, 2], 0)],
      ['unit=NaN', roundToSum([1, 2], Number.NaN)],
      ['unit=Infinity', roundToSum([1, 2], Number.POSITIVE_INFINITY)],
      ['unit=-1', roundToSum([1, 2], -1)],
      ['含 NaN', roundToSum([1, Number.NaN, 2], 0.001)],
      ['含 Infinity', roundToSum([1, Number.POSITIVE_INFINITY], 0.001)]
    ] as const
    for (const [tag, out] of badCases) {
      expect(out.every(Number.isFinite), `${tag} 返回了非有限值:${JSON.stringify(out)}`).toBe(true)
      expect(out.every(v => v === 0), `${tag} 应返回全 0,实际 ${JSON.stringify(out)}`).toBe(true)
    }
  })

  /**
   * 全导出终验:13 个函数、14 个调用点,喂 NaN 都不许印脏值。
   *
   * 这是「喂坏值」系列的总闸 —— 逐个修好之后,用一条判据把整组行为钉住,
   * 免得将来新增函数或改动某个守卫时悄悄退化。判据本身不关心印的是 `--` 还是 `0`,
   * 只要求别出现 NaN / undefined / Infinity / Invalid / null 这些一眼能看出的脏串。
   */
  it('format 的全部导出对坏值都不印脏字符串', () => {
    const calls: readonly (readonly [string, () => string])[] = [
      ['formatGN', () => formatGN(Number.NaN)],
      ['formatGN(坏对象)', () => formatGN({ m: Number.NaN, e: 0 })],
      ['formatGap', () => formatGap(Number.NaN)],
      ['formatNum', () => formatNum(Number.NaN)],
      ['formatRate', () => formatRate(Number.NaN)],
      ['formatPercent', () => formatPercent(Number.NaN)],
      ['formatDuration', () => formatDuration(Number.NaN)],
      ['formatChoiceSpan', () => formatChoiceSpan(Number.NaN)],
      ['formatCountdown', () => formatCountdown(Number.NaN)],
      ['formatClock', () => formatClock(Number.NaN)],
      ['formatStamp', () => formatStamp(Number.NaN)],
      ['formatYears', () => formatYears(Number.NaN)],
      ['cnNumber', () => cnNumber(Number.NaN)],
      ['roundToSum', () => JSON.stringify(roundToSum([1, 2], Number.NaN))]
    ]
    const dirty: string[] = []
    for (const [name, fn] of calls) {
      let out: string
      try {
        out = fn()
      } catch (e) {
        out = `抛错:${String(e).slice(0, 40)}`
      }
      if (/NaN|undefined|Infinity|Invalid|null/.test(out)) dirty.push(`${name} → ${out}`)
    }
    expect(dirty, `这些导出还印脏值:\n${dirty.join('\n')}`).toEqual([])
  })

  it('roundToSum 的正常路径与空数组不受守卫影响', () => {
    expect(roundToSum([], 0.001)).toEqual([])
    const shown = roundToSum([0.95, 0.0025, 0.05, -0.0225], 0.001)
    expect(shown.reduce((a, b) => a + b, 0)).toBeCloseTo(0.98, 6)
  })

  it('这两个函数的正常值不受守卫影响', () => {
    expect(formatYears(300)).toBe('300 载')
    expect(formatYears(20000)).toBe('2万 载')
    expect(cnNumber(21)).toBe('二十一')
    expect(cnNumber(0)).toBe('零')
    // 范围外原样返回阿拉伯数字,这条语义保留
    expect(cnNumber(10000)).toBe('10000')
    expect(cnNumber(-3)).toBe('-3')
  })
})
