import { describe, expect, it } from 'vitest'
import { cnNumber, formatClock, formatCountdown, formatDuration, formatGap, formatGN, formatPercent, roundToSum } from './format'
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
})
