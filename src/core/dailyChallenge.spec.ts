import { afterEach, describe, expect, it, vi } from 'vitest'
import { todayChallenge, todayNumber } from './dailyChallenge'
import { todayLocalNum } from '@/utils/time'

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

  it('不同本地日:day 号递增,种子随之换(跨日必不同题)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_760_000_000_000)
    const day1 = todayNumber()
    const d1 = todayChallenge()
    vi.setSystemTime(1_760_000_000_000 + 86_400_000) // +1 本地日(该时刻同月内,日号+1)
    const day2 = todayNumber()
    const d2 = todayChallenge()
    expect(day2).toBe(day1 + 1)
    expect(d1).not.toBeNull()
    expect(d2).not.toBeNull()
    expect(d2!.day).toBe(day2)
    // 种子随日换 → day 必不同;题面也应按新种子生成(跨日的题号对得上当天)
    expect(d2!.day).not.toBe(d1!.day)
  })

  it('日号走本地日历(不是 UTC 日):防 UTC+8 玩家本地 08:00 白嫖双份', () => {
    // 回归:若有人把 todayNumber 改回 Math.floor(Date.now()/86400000)(UTC 日计数),
    // 它绝无可能与 todayLocalNum 的 YYYYMMDD 相等 —— 这里立刻判红,
    // 从而保证天道与洞府巡游/日课落在同一面本地日历上
    vi.useFakeTimers()
    vi.setSystemTime(1_760_000_000_000)
    const local = todayLocalNum()
    expect(todayNumber()).toBe(local)
  })
})

vi.mock('./challenge', async importOriginal => {
  const mod = await importOriginal<typeof import('./challenge')>()
  return {
    ...mod,
    undertakeChallenge: vi.fn(() => ({ cleared: true, report: { rows: [] }, title: 'mock', rewardDaoSource: 0 } as never))
  }
})

import { undertakeDaily } from './dailyChallenge'
import { undertakeChallenge } from './challenge'
import type { DailyChallenge } from './dailyChallenge'
import { useEndgameStore } from '@/stores/endgame'
import { setActivePinia, createPinia } from 'pinia'

describe('应战今日天道 · 跨午夜落闸(防一天双份赏)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('今天的闸已关时,传昨日考题也能被当下日号拦下,不发起挑战', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_760_000_000_000)
    setActivePinia(createPinia())
    const endgame = useEndgameStore()
    vi.mocked(undertakeChallenge).mockClear()
    const today = todayLocalNum()
    endgame.dailyDoneDay = today // 今天已了
    // 模拟驻足跨午夜后缓存未刷新:传「昨日」考题(day 比当下小),题面任意
    const stale: DailyChallenge = { day: today - 1, draft: todayChallenge()!.draft, verdict: todayChallenge()!.verdict }
    // 旧逻辑按传参的 day(昨日)判闸 → 昨日没做 → 放行去打,清了再标记、重算成今天还能再打一次
    expect(undertakeDaily(stale)).toBe(null)
    expect(undertakeChallenge, '落闸只认当下日号,今日已了就该直接拒,不去打昨日考题').not.toHaveBeenCalled()
    expect(endgame.dailyDoneDay).toBe(today)
  })
})
