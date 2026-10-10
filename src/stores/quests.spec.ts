/** 图鉴收录时间打点测试 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useQuestsStore } from '@/stores/quests'
import { useResourcesStore } from '@/stores/resources'
import { toNum } from '@/utils/gnum'
import { DAILY_TASKS, MAIN_QUESTS } from '@/data/quests'
import { ACHIEVEMENTS } from '@/data/achievements'
import { track } from '@/core/progress'
import { MAX_MAJOR } from '@/data/realms'

describe('图鉴收录', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('首次收录记下时间戳,重复收录不覆盖', () => {
    const quests = useQuestsStore()
    const before = Date.now()
    expect(quests.collect('gongfa', 'gf-test')).toBe(true)
    const stamp = quests.collectedAt['gongfa:gf-test']
    expect(stamp).toBeGreaterThanOrEqual(before)

    expect(quests.collect('gongfa', 'gf-test')).toBe(false)
    expect(quests.collectedAt['gongfa:gf-test']).toBe(stamp)
  })

  it('不同类别互不串扰', () => {
    const quests = useQuestsStore()
    quests.collect('equip', 'same-id')
    quests.collect('pill', 'same-id')
    expect(quests.collections.equip).toContain('same-id')
    expect(quests.collections.pill).toContain('same-id')
    expect(quests.collectedAt['equip:same-id']).toBeDefined()
    expect(quests.collectedAt['pill:same-id']).toBeDefined()
  })
})

/**
 * 主线任务链是游戏的脊梁:它曾只铺到化神(第 5 个大境界)。
 * 扩界后若忘了往下铺,玩家在 16 个新境界里会失去全部主线指引。
 */
describe('主线任务链覆盖', () => {
  it('每一个大境界都有对应的主线节点,且最后一个落在当前最高境界', () => {
    const questRealms = MAIN_QUESTS.filter(q => q.cond.type === 'realm').map(q => (q.cond as { major: number }).major)
    for (let major = 1; major <= MAX_MAJOR; major += 1) {
      expect(questRealms, `第 ${major} 个大境界没有主线节点`).toContain(major)
    }
    expect(Math.max(...questRealms), '主线终点未抵达当前最高境界').toBe(MAX_MAJOR)
  })

  it('主线 id 全局唯一,奖励/描述不缺', () => {
    expect(new Set(MAIN_QUESTS.map(q => q.id)).size).toBe(MAIN_QUESTS.length)
    for (const q of MAIN_QUESTS) {
      expect(q.name.length).toBeGreaterThan(0)
      expect(q.desc.length).toBeGreaterThan(0)
    }
  })

  it('每日任务仍为三条(扩界不得挤占日课)', () => {
    expect(DAILY_TASKS.length).toBeGreaterThanOrEqual(3)
  })
})

/**
 * 每日任务领奖与跨日重置。
 *
 * checkDaily(progress)在每次 track 时走:当日达标 → markDailyDone + 发奖;
 * engine 在日期变化时调 rolloverDailyIfNeeded。quests.spec 之前只断言「每日任务仍为
 * 三条」,领奖一次/跨日可重领/按日 dailyDelta 从没直接测过。这里用显式日期字符串
 * 定死「当天/次日」,并清掉成就/主线的一次性赏钱(免干扰),只断言日课自己的账。
 */
describe('每日任务领奖与跨日重置(daily)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // 清掉成就/主线的一次性赏钱,免得 track 里 checkAchievements 的推进混进灵石差
  function seedDay(date: string): void {
    useQuestsStore().$patch({ achieved: ACHIEVEMENTS.map(a => a.id), mainIdx: MAIN_QUESTS.length - 1 })
    useQuestsStore().rolloverDaily(date)
  }

  it('当日达标:领奖一次(d_kill 入 done、灵石入账);同日再杀不再加倍', () => {
    seedDay('2026-10-10')
    const q = useQuestsStore()
    const r = useResourcesStore()
    const stone0 = toNum(r.spiritStone)
    track('kills', 15)
    expect(q.daily.done).toContain('d_kill')
    const after1 = toNum(r.spiritStone)
    expect(after1).toBeGreaterThan(stone0) // 领到 stoneTier 20
    track('kills', 15) // 同一天再达标:done 已含
    const after2 = toNum(r.spiritStone)
    expect(after2).toBe(after1) // 不重复领 —— no-double-claim
  })

  it('跨日重置:done 清空、base 重设;再达标可再领(跨日重领)', () => {
    seedDay('2026-10-10')
    const q = useQuestsStore()
    const r = useResourcesStore()
    track('kills', 15)
    const day1 = toNum(r.spiritStone)
    expect(q.daily.done).toContain('d_kill')
    q.rolloverDaily('2026-10-11') // 次日
    expect(q.daily.done).toEqual([]) // done 重置
    track('kills', 15)
    expect(q.daily.done).toContain('d_kill') // 跨日可再领
    expect(toNum(r.spiritStone)).toBeGreaterThan(day1)
  })

  it('当日不足门槛不领;凑够才领(dailyDelta 门槛)', () => {
    seedDay('2026-10-10')
    const q = useQuestsStore()
    track('kills', 10)
    expect(q.daily.done).not.toContain('d_kill')
    track('kills', 5)
    expect(q.daily.done).toContain('d_kill')
  })

  it('跨日后 dailyDelta 只算新一天,不把前一天进度并进来', () => {
    seedDay('2026-10-10')
    const q = useQuestsStore()
    track('kills', 15) // 第一天完成,counters.kills=15
    q.rolloverDaily('2026-10-11') // base.kills=15
    expect(q.dailyDelta('kills')).toBe(0) // 前一天不累计
    track('kills', 3)
    expect(q.dailyDelta('kills')).toBe(3) // 只算新一天的 3
  })
})
