/**
 * sanitizeAllStores —— 逐仓字段级自愈的唯一入口。
 *
 * 启动(首次渲染前)、引擎 start、离线结算前三处都走这一份清单;这里钉住两件事:
 * ①坏字段(NaN/负值)确实被修平;②健康存档幂等(修了等于没修,不产生意外改动)。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { sanitizeAllStores } from '@/stores/sanitizeAll'
import { useResourcesStore } from '@/stores/resources'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { suppressionProgress } from '@/core/suppress'

describe('sanitizeAllStores 逐仓自愈', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('坏字段被修平:资源 NaN / 负值夹回 0', () => {
    const r = useResourcesStore()
    r.$patch({ wudao: Number.NaN, ore: -5 })
    sanitizeAllStores()
    expect(r.wudao).toBe(0) // NaN → 0
    expect(r.ore).toBe(0) // -5 → max(0,·) = 0
  })

  it('健康存档幂等:逐仓自愈后原样不变', () => {
    const r = useResourcesStore()
    r.$patch({ wudao: 3, ore: 4 })
    sanitizeAllStores()
    expect(r.wudao).toBe(3)
    expect(r.ore).toBe(4)
  })
})

describe('sanitizeAllStores 修「按 id 认对象」的坏账', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('区域战绩里的 NaN 不会让镇压资格永远差一项,也不会写出 NaN 读数', () => {
    const p = usePlayerStore()
    p.$patch({
      regionStats: {
        qingyun: {
          totalFights: 25,
          avgRounds: Number.NaN,
          avgDamageTakenPct: Number.NaN,
          consecutiveWins: Number.NaN,
          lastUpdateAt: Number.NaN
        },
        // 认不出的地界没有战绩可言
        nowhere: { totalFights: 3, avgRounds: 2, avgDamageTakenPct: 0.02, consecutiveWins: 1, lastUpdateAt: 1 }
      } as never
    })
    sanitizeAllStores()

    const st = p.regionStats.qingyun!
    expect(st.avgRounds).toBe(0)
    expect(st.avgDamageTakenPct).toBe(0)
    expect(st.consecutiveWins).toBe(0)
    expect(st.lastUpdateAt).toBe(0)
    expect(p.regionStats.nowhere, '认不出的地界整条丢掉').toBeUndefined()
    // 25 战、均 0 回合、均 0 受伤 —— 三条判据都该判过,而不是卡在 NaN 上
    const progress = suppressionProgress(st)
    expect(progress.roundsOk).toBe(true)
    expect(progress.damageOk).toBe(true)
  })

  it('镇压起钟修平:坏时刻按此刻重新起钟,不在镇压表里的残项清掉', () => {
    const p = usePlayerStore()
    p.major = 20
    p.$patch({
      suppressedRegions: ['qingyun', 'wanyao'],
      suppressedSince: { qingyun: Number.NaN, wanyao: 12345, heifeng: 999 } as never
    })
    const before = Date.now()
    sanitizeAllStores()

    // NaN 会让 72 小时复聚永远等不到,但不是「没镇压过」—— 按此刻重新起钟
    expect(p.suppressedSince.qingyun, 'NaN 起钟改为此刻,收益不丢、复聚照常').toBeGreaterThanOrEqual(before)
    expect(p.suppressedSince.wanyao).toBe(12345)
    // 没在镇压表里的起钟不会凭空生效
    expect(p.suppressedSince.heifeng).toBeUndefined()
  })

  it('连胜/巡游日期被写成 NaN 时归零,而不是每 30 秒重掷一次', () => {
    const p = usePlayerStore()
    p.$patch({ winStreak: Number.NaN, lastCaveEventDay: Number.NaN, regionWins: { qingyun: Number.NaN, wanyao: 4 } as never })
    sanitizeAllStores()
    expect(p.winStreak).toBe(0)
    expect(p.lastCaveEventDay).toBe(0)
    expect(p.regionWins).toEqual({ wanyao: 4 })
  })

  it('事件记忆按事件 id 合并:坏时刻/坏计数不再写进征战录', () => {
    const a = useAdventureStore()
    a.$patch({
      eventMemories: {
        // 同一条写两遍:取较大计数与较晚时刻
        ev_spring: { eventId: 'ev_spring', times: 2, lastAt: 100, lastChoiceIdx: 0 },
        // 另一条要用真 id(以 /eventMemories 为键的查表)
        ev_herb_garden: { eventId: 'ev_herb_garden', times: Number.NaN, lastAt: Number.NaN, lastChoiceIdx: Number.NaN }
      } as never
    })
    // 同一条事件重复键只能用一次,故再灌一条形状坏掉的记录到另一事件
    a.$patch({
      eventMemories: {
        ...a.eventMemories,
        ev_old_man: { eventId: 'ev_old_man', times: 3, lastAt: Number.POSITIVE_INFINITY, lastChoiceIdx: 99 }
      } as never
    })
    sanitizeAllStores()

    expect(a.eventMemories.ev_herb_garden, '计数不是正整数的记录直接丢弃').toBeUndefined()
    const mem = a.eventMemories.ev_old_man!
    expect(mem.times).toBe(3)
    expect(Number.isFinite(mem.lastAt)).toBe(true)
    expect(mem.lastChoiceIdx).toBeGreaterThanOrEqual(0)
    expect(a.eventMemories.ev_spring!.times).toBe(2)
  })

  it('本世之界残骸整份作废,不让世界页在渲染期抛错', () => {
    const a = useAdventureStore()
    // 空链:worldIdentity 会读 sorted[0]!,worldView 也会 map 出一张空白地图
    a.$patch({
      mortalWorld: { seed: 1, chain: [], ruleId: 'x', ruleName: 'x', bias: 'x' } as never
    })
    sanitizeAllStores()
    expect(a.mortalWorld).toBeNull()
  })

  it('本世之界内节点字段坏掉时同样整份作废,好世界原样保留', () => {
    const a = useAdventureStore()
    a.$patch({
      mortalWorld: {
        seed: 1,
        chain: [{ nodeId: 'n0_qingyun', fromId: 'qingyun', name: '青云', tier: Number.NaN }],
        ruleId: 'x',
        ruleName: 'x',
        bias: 'x'
      } as never
    })
    sanitizeAllStores()
    expect(a.mortalWorld).toBeNull()
  })

  it('战报结果形状坏掉时整份作废,不让战斗面板读出 NaN', () => {
    const a = useAdventureStore()
    a.$patch({
      lastBattle: {
        enemyName: '石傀',
        enemyIcon: 'x',
        isBoss: false,
        result: { win: true, log: [null, { text: '一记' }], rounds: Number.NaN, playerHpPct: Number.NaN },
        at: Number.NaN
      } as never
    })
    sanitizeAllStores()
    const b = a.lastBattle
    expect(b, '日志可救,不该整份丢').not.toBeNull()
    expect(b!.result.log).toHaveLength(1)
    expect(b!.result.rounds).toBe(0)
    expect(b!.result.playerHpPct).toBe(0)
    expect(Number.isFinite(b!.at)).toBe(true)
  })

  it('待处理事件认不出时清掉,不让历练一直堵到超时', () => {
    const a = useAdventureStore()
    a.$patch({ pendingEventId: 'ev_does_not_exist', pendingEventSince: Number.NaN })
    sanitizeAllStores()
    expect(a.pendingEventId).toBeNull()
    expect(a.pendingEventSince).toBe(0)
  })
})
