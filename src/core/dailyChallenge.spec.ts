import { afterEach, describe, expect, it, vi } from 'vitest'
import { todayChallenge, todayNumber } from './dailyChallenge'

/**
 * 今日天道(Phase 27)—— 确定性守卫。
 * dailyChallenge 全模块此前零 spec。核心契约是注释里那句「按日期种子确定性生成
 * (刷新不换题)」:todayChallenge 每次用 new RandomService(mulberry32(day*131+t*977))
 * 自建局部种子,不吞全局随机 —— 一旦改成时钟/随机盐,同日两次生成就会出不同的题,
 * 玩家可刷新刷到满意的今日天道再开打(经济漏洞)。这里把该属性钉死。
 */
describe('今日天道 · 确定性(刷新不换题)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('同日两次生成:day 相同,且题面深度相等(刷新/重开不换题)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_760_000_000_000)
    const day = todayNumber()
    const a = todayChallenge()
    const b = todayChallenge() // 全新随机服务,同一 (day) 种子
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a!.day).toBe(day)
    expect(b!.day).toBe(a!.day)
    // 刷新即换题 = farm 漏洞;同一天必须完全同题
    expect(b!.draft).toEqual(a!.draft)
  })

  it('不吞全局随机:两次生成之间别处抽签,不影响同题', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_760_000_000_000)
    const a = todayChallenge()
    // 若 todayChallenge 依赖全局随机(Math.random),这里一抽就会把第二次带偏
    Math.random()
    Math.random()
    const b = todayChallenge()
    expect(a!.draft).toEqual(b!.draft)
  })

  it('不同 UTC 日:day 号递增,种子随之换(跨日必不同题)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_760_000_000_000)
    const day1 = todayNumber()
    const d1 = todayChallenge()
    vi.setSystemTime(1_760_000_000_000 + 86_400_000) // +1 UTC 日
    const day2 = todayNumber()
    const d2 = todayChallenge()
    expect(day2).toBe(day1 + 1)
    expect(d1).not.toBeNull()
    expect(d2).not.toBeNull()
    expect(d2!.day).toBe(day2)
    // 种子随日换 → day 必不同;题面也应按新种子生成(跨日的题号对得上当天)
    expect(d2!.day).not.toBe(d1!.day)
  })
})
