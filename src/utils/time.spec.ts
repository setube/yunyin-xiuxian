import { describe, expect, it } from 'vitest'
import { formatDate, localDayNum, secsUntilNextMidnight } from './time'

/** 日课重置时刻:修行志「距重置」读它 */
describe('secsUntilNextMidnight 距本地午夜更替', () => {
  const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m, d, h, min, 0, 0).getTime()

  it('正午 12:00 → 还有 12 时整', () => {
    expect(secsUntilNextMidnight(at(2026, 9, 5, 12, 0))).toBe(12 * 3600)
  })

  it('刚过午夜 00:00 → 还有整整一日', () => {
    expect(secsUntilNextMidnight(at(2026, 9, 5, 0, 0))).toBe(24 * 3600)
  })

  it('23:59 → 只剩 60 秒,未成即作罢的压力看得见', () => {
    expect(secsUntilNextMidnight(at(2026, 9, 5, 23, 59))).toBe(60)
  })

  it('月末跨月:10 月最后一日 23:00 → 恰 1 时(月界不错位)', () => {
    expect(secsUntilNextMidnight(at(2026, 9, 31, 23, 0))).toBe(3600)
  })

  it('非整数秒:带毫秒的 now 也能给正数(永不误报已过)', () => {
    const ts = new Date(2026, 9, 5, 8, 0, 0, 500).getTime()
    const secs = secsUntilNextMidnight(ts)
    expect(secs).toBeGreaterThan(0)
    expect(secs).toBeLessThanOrEqual(86400)
  })
})

describe('坏时间戳不许印成日期或 NaN 日号', () => {
  /**
   * `Number.isFinite` 挡不住「有限的超范围数」。
   *
   * 坏档写 `lastAt: 1e300`(或 `8640000000000001`)时值仍是有限数,顺利通过
   * `asFiniteNumber` 那一关,然后被 `new Date()` 判成 Invalid Date:
   *   · `formatDate` → 「NaN月NaN日」(真浏览器实测)
   *   · `localDayNum` → NaN —— 而它要与「今天的日号」比等号,NaN 与任何数比较都是 false,
   *     于是「今日已做」的闸门永久恒假
   */
  const BAD = [8_640_000_000_000_001, 1e300, Number.MAX_SAFE_INTEGER, Number.NaN]

  it('formatDate 给占位符,不印「NaN月NaN日」', () => {
    for (const ts of BAD) {
      expect(formatDate(ts), `ts=${ts} 印出了 NaN 月日`).not.toContain('NaN')
      expect(formatDate(ts)).toBe('--')
    }
    // 正常值照旧
    expect(formatDate(new Date(2026, 9, 5).getTime())).toBe('10月5日')
  })

  it('localDayNum 坏值给 0,不给 NaN', () => {
    for (const ts of BAD) {
      const day = localDayNum(ts)
      expect(Number.isNaN(day), `ts=${ts} 得出了 NaN 日号`).toBe(false)
      expect(day).toBe(0)
    }
    expect(localDayNum(new Date(2026, 9, 5).getTime())).toBe(20261005)
  })

  it('判据抓得住:把范围守卫去掉即红', () => {
    // 阴性对照:未守卫的写法确实会产出 NaN 与「NaN月」——证明这两条断言有约束力
    const raw = new Date(1e300)
    expect(raw.getTime()).toBeNaN()
    expect(`${raw.getMonth() + 1}月${raw.getDate()}日`).toContain('NaN月')
    expect(String(raw.getFullYear() * 10000)).toBe('NaN')
  })
})
