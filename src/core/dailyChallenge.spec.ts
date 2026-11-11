import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { todayChallenge, todayNumber } from './dailyChallenge'
import { localDayNum, todayLocalNum } from '@/utils/time'

/**
 * 今日天道确定性守卫:todayChallenge 按日期自建局部种子,不吞全局随机。
 * 改成时钟/随机盐则同日刷新换题,玩家可刷到满意的题再开打。
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
    expect(b!.draft).toEqual(a!.draft)
  })

  it('不吞全局随机:两次生成之间别处抽签,不影响同题', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_760_000_000_000)
    const a = todayChallenge()
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
    vi.setSystemTime(1_760_000_000_000 + 86_400_000) // +1 本地日(同月内,日号 +1)
    const day2 = todayNumber()
    const d2 = todayChallenge()
    expect(day2).toBe(day1 + 1)
    expect(d1).not.toBeNull()
    expect(d2).not.toBeNull()
    expect(d2!.day).toBe(day2)
    expect(d2!.day).not.toBe(d1!.day)
  })

  it('日号走本地日历(不是 UTC 日):防 UTC+8 玩家本地 08:00 白嫖双份', () => {
    // 故障注入:把 todayNumber 改成 UTC 日计数 Math.floor(Date.now()/86400000),本用例红
    vi.useFakeTimers()
    vi.setSystemTime(1_760_000_000_000)
    const local = todayLocalNum()
    expect(todayNumber()).toBe(local)
  })

  it('驻足跨午夜:墙钟日号变化才切题,同日内秒针跳动不重算', () => {
    const beforeMidnight = new Date(2026, 9, 5, 23, 59, 59).getTime()
    const afterMidnight = new Date(2026, 9, 6, 0, 0, 1).getTime()
    const wallNow = ref(beforeMidnight)
    const wallDay = computed(() => localDayNum(wallNow.value))
    const daily = computed(() => todayChallenge(wallDay.value))

    const yesterday = daily.value
    expect(yesterday?.day).toBe(localDayNum(beforeMidnight))

    wallNow.value = beforeMidnight + 500
    expect(daily.value).toBe(yesterday)

    wallNow.value = afterMidnight
    expect(daily.value).not.toBe(yesterday)
    expect(daily.value?.day).toBe(localDayNum(afterMidnight))
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
    endgame.dailyDoneDay = today
    // 驻足跨午夜、缓存未刷新:传昨日考题,题面任意
    const stale: DailyChallenge = { day: today - 1, draft: todayChallenge()!.draft, verdict: todayChallenge()!.verdict }
    // 故障注入:判闸改按传参的 day,本用例红
    expect(undertakeDaily(stale)).toBe(null)
    expect(undertakeChallenge, '落闸只认当下日号,今日已了就该直接拒,不去打昨日考题').not.toHaveBeenCalled()
    expect(endgame.dailyDoneDay).toBe(today)
  })

  it('时钟回拨时,今天的闸仍然关着 —— 等号判据会漏这一侧', () => {
    /*
     * 闸门原写 `dailyDoneDay === day`:把系统时间调回昨天,`day` 变小、
     * `dailyDoneDay` 仍是那个较大的值,等号不成立 → 天道赏可以再领一次。
     * 与洞府巡游、日课翻日是同一类:**日期判据要认「更晚」,不能只认「相等」**。
     */
    vi.useFakeTimers()
    vi.setSystemTime(1_760_000_000_000)
    setActivePinia(createPinia())
    const endgame = useEndgameStore()
    vi.mocked(undertakeChallenge).mockClear()
    endgame.dailyDoneDay = todayLocalNum()

    // 时钟往回拨一天
    vi.setSystemTime(Date.now() - 86_400_000)
    const stale: DailyChallenge = { day: todayLocalNum(), draft: todayChallenge()!.draft, verdict: todayChallenge()!.verdict }

    expect(undertakeDaily(stale), '时钟回拨后天道赏又能领了').toBe(null)
    expect(undertakeChallenge, '闸门漏了,挑战被真的发起了').not.toHaveBeenCalled()
  })
})
