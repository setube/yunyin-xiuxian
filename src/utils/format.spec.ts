import { describe, expect, it } from 'vitest'
import { cnNumber, formatClock, formatCountdown, formatDuration, formatGN, formatPercent } from './format'
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

  /**
   * 倒计时的存在理由只有一个:**每一秒的文本宽度必须一样**。
   * 状态胶囊是 nowrap 的,倒数文本一涨一缩,整排胶囊就会被推来推去
   * (玩家原话:「状态信息总在抖」)。故这里按「宽度」断言,不按字符串花样。
   */
  it('倒计时定宽:同一量级内每秒宽度不变', () => {
    const w = (s: string): number => s.length
    // 同一分钟量级内逐秒走一遍,宽度必须恒定(9→10 秒、59→60 秒这些跳档点在内)
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
    // 非法值与 formatDuration 一致地给占位
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
    // x 有限但 x*100 上溢成 Infinity 时同样要给占位,不能吐 "Infinity%"(见 format.ts)
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
