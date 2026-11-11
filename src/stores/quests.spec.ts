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
import { todayStr } from '@/utils/time'

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

  it('野类别与空 id 不收录、不抛错', () => {
    const quests = useQuestsStore()
    expect(quests.collect('ghost' as never, 'x')).toBe(false)
    expect(quests.collect('equip', '')).toBe(false)
    expect(quests.collectedAt).toEqual({})
  })
})

describe('成就达成时刻', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('首次达成记下时间戳,重复达成不覆盖、不重记', () => {
    const quests = useQuestsStore()
    const before = Date.now()
    expect(quests.unlockAchievement('a_test')).toBe(true)
    const stamp = quests.achievedAt['a_test']
    expect(stamp).toBeGreaterThanOrEqual(before)
    // 重复达成:不重记,保持最初那刻
    expect(quests.unlockAchievement('a_test')).toBe(false)
    expect(quests.achievedAt['a_test']).toBe(stamp)
    expect(quests.achieved).toContain('a_test')
  })
})

/** 成就/名号/图鉴是集合语义:坏档同一条写两遍时,界面按 Set 只画一枚,计数按 `.length` 会多报 */
describe('sanitize:计数器巨值要归零,不能白送成就', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /*
   * 计数器是**成就/任务/日课三处的判定依据**,不只是显示值。
   * `asNumberRecord` 只挡非有限值与负数,不管上界 —— 坏档写 `kills: 1e300`
   * 会原样留下,而 `evalCond` 的判据是 `counter(key) >= cond.value`,
   * 于是**一次解锁全部计数类成就**(实测 5 个),日课也一并判为达成。
   *
   * 超出上界归零而不是夹到上界:夹到一亿仍是「远超所有成就阈值」的合法读数,
   * 判据照样全过。归零才表达「这条读数不可信」。
   */
  it('巨值归零,不再解锁计数类成就', () => {
    const quests = useQuestsStore()
    quests.$patch({ counters: { kills: 1e300 } } as never)
    quests.sanitize()
    expect(quests.counters.kills, '巨值没被归零 —— 成就判据会全过').toBe(0)
  })

  it('正常计数原样保留', () => {
    const quests = useQuestsStore()
    quests.$patch({ counters: { kills: 500, battles: 12 } } as never)
    quests.sanitize()
    expect(quests.counters.kills).toBe(500)
    expect(quests.counters.battles).toBe(12)
  })
})

describe('sanitize:重复条目不再把计数撑破', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('成就/日课/名号/图鉴同一条写两遍,计数与列表一致', () => {
    const quests = useQuestsStore()
    quests.$patch({
      achieved: ['a_r0', 'a_r0'],
      daily: { date: '2026-10-20', base: {}, done: ['d_kill', 'd_kill'] },
      titlesOwned: ['ti_churu', 'ti_churu'],
      collections: { equip: ['e1', 'e1'], gongfa: [], pill: [], artifact: [], pet: ['p1', 'p1'], event: [], talent: [] }
    } as never)
    quests.sanitize()
    expect(quests.achieved, '成就同一条只留一次').toEqual(['a_r0'])
    expect(quests.daily.done, '日课同一条只留一次').toEqual(['d_kill'])
    expect(quests.titlesOwned, '名号同一条只留一次').toEqual(['ti_churu'])
    expect(quests.collections.equip, '装备图鉴去重').toEqual(['e1'])
    expect(quests.collections.pet, '灵兽册去重后不会画两行同 key').toEqual(['p1'])
  })

  /**
   * 日课的 done 也要按任务目录过滤。
   *
   * 写入路径(completeDaily)有 `DAILY_TASKS.some(t => t.id === taskId)` 这道闸,
   * 读档路径原先只去重 —— 手改存档塞 10 万条假 id 后 $state 到 1.29MB,存档顶到配额。
   * 同函数里 achieved / titlesOwned 早就按各自目录过滤了,只有 done 漏着。
   */
  it('读档时日课 done 里认不得的任务 id 被清掉', () => {
    const quests = useQuestsStore()
    const fake = Array.from({ length: 100000 }, (_, i) => `fake_${i}`)
    quests.$patch({ daily: { date: '2026-11-08', base: {}, done: fake } } as never)
    quests.sanitize()
    expect(quests.daily.done.length, '认不得的任务 id 不该留在 done').toBeLessThan(100)
    expect(JSON.stringify(quests.$state).length, '坏档把 state 撑爆了').toBeLessThan(5000)
  })

  it('认不出的成就/名号 id 清掉,不再虚增「N/总数」', () => {
    const quests = useQuestsStore()
    quests.$patch({
      achieved: ['a_r0', 'a_ghost'],
      titlesOwned: ['ti_churu', 'ti_ghost']
    } as never)
    quests.sanitize()
    expect(quests.achieved, '野成就画不出来,也不该占一格计数').toEqual(['a_r0'])
    expect(quests.titlesOwned, '野名号不产生词条,也不该占一格计数').toEqual(['ti_churu'])
  })
})

/** 扩界须同步往下铺主线节点 */
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

describe('任务与日课公共写入边界', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('计数器只收有限正数:NaN/Infinity/负数/零都不污染 dailyDelta', () => {
    const quests = useQuestsStore()
    quests.inc('kills', 3)
    for (const n of [NaN, Infinity, -5, 0]) quests.inc('kills', n)
    expect(quests.counter('kills')).toBe(3)
    expect(quests.dailyDelta('kills')).toBe(3)
  })

  it('主线推进止于终点:不会推成 currentMainQuest=undefined', () => {
    const quests = useQuestsStore()
    quests.$patch({ mainIdx: MAIN_QUESTS.length - 1 })
    quests.advanceMain()
    quests.advanceMain()
    expect(quests.mainIdx).toBe(MAIN_QUESTS.length - 1)
    expect(quests.currentMainQuest).toBe(MAIN_QUESTS[MAIN_QUESTS.length - 1])
  })

  it('日课标记只认目录并去重:野 id 与重复写入都不进 done', () => {
    const quests = useQuestsStore()
    quests.markDailyDone(DAILY_TASKS[0]!.id)
    quests.markDailyDone(DAILY_TASKS[0]!.id)
    quests.markDailyDone('d_ghost')
    expect(quests.daily.done).toEqual([DAILY_TASKS[0]!.id])
  })
})

/** 日课领奖与跨日重置:checkDaily(progress)随 track 判达标并发奖,engine 换日调 rolloverDailyIfNeeded */
describe('每日任务领奖与跨日重置(daily)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // 清掉成就/主线一次性赏钱,免得 checkAchievements 混进灵石差
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
    expect(after2).toBe(after1) // 不重复领
  })

  it('跨日重置:done 清空、base 重设;再达标可再领(跨日重领)', () => {
    seedDay('2026-10-10')
    const q = useQuestsStore()
    const r = useResourcesStore()
    track('kills', 15)
    const day1 = toNum(r.spiritStone)
    expect(q.daily.done).toContain('d_kill')
    q.rolloverDaily('2026-10-11') // 次日
    expect(q.daily.done).toEqual([])
    track('kills', 15)
    expect(q.daily.done).toContain('d_kill')
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
    track('kills', 15) // counters.kills=15
    q.rolloverDaily('2026-10-11') // base.kills=15
    expect(q.dailyDelta('kills')).toBe(0)
    track('kills', 3)
    expect(q.dailyDelta('kills')).toBe(3)
  })
})

/**
 * 日课基线坏档。
 *
 * dailyDelta = counters − base。base 被读成空记录(坏档、手改存档、字段改名)而
 * date 恰好还是今天时,delta 就等于**历史累计** —— 于是 checkDaily 一开局就把
 * 所有日课判为达成,白送全天奖励并刷一串 toast。
 * 实测 counters.kills=500、base={} 时 delta 是 500,而正确值应为 0。
 */
describe('日课基线坏档', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('base 缺失时把当前累计当基线,delta 归零而不是等于历史累计', () => {
    const q = useQuestsStore()
    q.counters = { kills: 500 } as never
    q.daily = { date: todayStr(), base: {} as never, done: [] }
    q.sanitize()
    expect(q.dailyDelta('kills'), 'base 丢了就把历史累计算成今日进度,日课会一开局全白送').toBe(0)
  })

  it('base 非空时原样保留,不被重置', () => {
    const q = useQuestsStore()
    q.counters = { kills: 500 } as never
    q.daily = { date: todayStr(), base: { kills: 480 } as never, done: [] }
    q.sanitize()
    expect(q.dailyDelta('kills'), '正常档的基线被冲掉了').toBe(20)
  })
})
