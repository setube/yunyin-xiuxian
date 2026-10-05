import { describe, expect, it } from 'vitest'
import { secsUntilNextMidnight } from './time'

/**
 * 日课更替时刻 —— 距下一个本地午夜的秒数,修行志「距更替」读它。
 * 纯函数(输入时间戳),与 todayStr 同一本地日口径,测试不碰墙钟。
 */
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
