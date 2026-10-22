/**
 * Phase 30.9:世界活性与服务层审计
 * S1 区域兴衰 / S2 宿敌记忆 / S3 事件余波
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import {
  deriveProsperity,
  hoursUntilRevive,
  prosperityName,
  recordLoss,
  recordLossBatch,
  isNemesis,
  markAvenged,
  recordEvent,
  shouldTriggerAftermath,
  aftermathText,
  isRegionRevived,
  regionReviveClock,
  regionTouchedAt,
  prosperityYieldMult,
  regionRecallFor,
  NEMESIS_THRESHOLD,
  STABLE_WINS,
  FLOURISH_WINS,
  AFTERMATH_CHANCE,
  REVIVE_AFTER_HOURS
} from './worldMemory'
import type { NemesisRecord } from '@/types'

describe('S1 区域兴衰', () => {
  const HOUR = 3600_000
  const now = Date.now()

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('初始混乱:未镇压或胜场不足', () => {
    const r = deriveProsperity({ totalWins: 5, hasSuppressed: false, lastActivityAt: now, now })
    expect(r.prosperity).toBe('chaos')
    const r2 = deriveProsperity({ totalWins: 50, hasSuppressed: false, lastActivityAt: now, now })
    expect(r2.prosperity).toBe('chaos')
  })

  it('胜场达标 + 已镇压 → 稳定;继续积累 → 繁盛', () => {
    const stable = deriveProsperity({ totalWins: STABLE_WINS, hasSuppressed: true, lastActivityAt: now, now })
    expect(stable.prosperity).toBe('stable')
    const flourish = deriveProsperity({ totalWins: FLOURISH_WINS, hasSuppressed: true, lastActivityAt: now, now })
    expect(flourish.prosperity).toBe('flourish')
  })

  it('长期无活动但胜场达标 → 回落混乱', () => {
    const idle = deriveProsperity({
      totalWins: FLOURISH_WINS,
      hasSuppressed: true,
      lastActivityAt: now - 100 * HOUR,
      now
    })
    expect(idle.prosperity).toBe('chaos')
  })

  /**
   * 「守着」本身就是活动。
   *
   * 镇压后该地不再产胜场,`lastUpdateAt` 停在镇压前最后一战;若闲置判定只看它,
   * 守到 48 小时就会被判「久无人烟」回落混乱,可镇压要到 72 小时才复聚 ——
   * 守满 24 小时的繁盛收益会在 48~72 小时这一段凭空消失。
   * 故障注入:把 `lastTouchedAt` 改回 `input.lastActivityAt` → 本条红。
   */
  it('镇压中一直守着不算无活动:守满一日仍繁盛,直到复聚那一刻', () => {
    const held10h = deriveProsperity({
      totalWins: 0,
      hasSuppressed: true,
      suppressedAt: now - 10 * HOUR,
      lastActivityAt: now - 60 * HOUR, // 最后一战比镇压还早
      now
    })
    expect(held10h.prosperity, '守到稳定档却被「久无人烟」打回混乱').toBe('stable')

    const held50h = deriveProsperity({
      totalWins: 0,
      hasSuppressed: true,
      suppressedAt: now - 50 * HOUR,
      lastActivityAt: now - 60 * HOUR, // 最后一战比镇压还早
      now
    })
    expect(held50h.prosperity, '守了 50 小时却判成混乱,等于把守土收益吃掉').toBe('flourish')

    // 未镇压的地界仍按最后一战回落 —— 修的是「守着」,不是把回落一并废掉
    const idleUnsuppressed = deriveProsperity({
      totalWins: FLOURISH_WINS,
      hasSuppressed: false,
      lastActivityAt: now - 100 * HOUR,
      now
    })
    expect(idleUnsuppressed.prosperity).toBe('chaos')
  })

  it('regionRecallFor 的 since 取镇压时刻(suppressedSince),而非最近战斗时间 — 镇压后刷战不该把「稳定时长」越打越短', () => {
    const player = usePlayerStore()
    const suppressedAt = Date.now() - 50 * HOUR
    const lastFight = Date.now() - 1 * HOUR // 镇压后仍在持续战斗
    player.suppressedRegions = ['qingyun']
    player.suppressedSince = { qingyun: suppressedAt }
    player.regionStats = {
      qingyun: { totalFights: FLOURISH_WINS, avgRounds: 3, avgDamageTakenPct: 0.4, consecutiveWins: FLOURISH_WINS, lastUpdateAt: lastFight }
    }
    const recall = regionRecallFor('qingyun')
    // since 应以镇压时刻为起点:50h 前镇压 → since 应为 50h 前的密钥
    expect(recall.suppressedAt).toBe(suppressedAt)
    expect(recall.since).toBe(suppressedAt)
    // 若误用 lastUpdateAt,since 会变成 1h 前 —— 回归点(TASK-026)
    expect(recall.since).not.toBe(lastFight)
  })

  it('兴衰名称映射正确', () => {
    expect(prosperityName('chaos')).toBe('混乱')
    expect(prosperityName('stable')).toBe('稳定')
    expect(prosperityName('flourish')).toBe('繁盛')
  })

  /**
   * 兴衰看的是「赢过多少」,不是「打过多少」。
   *
   * 此前 `regionRecallFor` 读 `regionStats.totalFights` —— 那里面连败仗一起数:
   * 同一地界连输五十场也会被判成「繁盛」,而 `regionWins`(exploration 每胜一场
   * 才 +1)一直只写不读。故障注入:把判据改回 totalFights → 本条红。
   */
  it('regionRecallFor 按净胜场判兴衰:连输再多也不算繁盛', () => {
    const player = usePlayerStore()
    player.suppressedRegions = ['qingyun']
    player.suppressedSince = { qingyun: Date.now() }
    player.regionStats = {
      qingyun: {
        totalFights: FLOURISH_WINS + 50, // 打了这么多场,但一场没赢
        avgRounds: 9,
        avgDamageTakenPct: 0.9,
        consecutiveWins: 0,
        lastUpdateAt: Date.now()
      }
    }
    player.regionWins = { qingyun: 0 }
    expect(regionRecallFor('qingyun').prosperity, '一场没赢却因打得多久而判繁盛,是错的').toBe('chaos')

    // 赢够场数才升档,阈值与 deriveProsperity 同一把尺
    player.regionWins = { qingyun: STABLE_WINS }
    expect(regionRecallFor('qingyun').prosperity).toBe('stable')
    player.regionWins = { qingyun: FLOURISH_WINS }
    expect(regionRecallFor('qingyun').prosperity).toBe('flourish')
  })

  /**
   * 兴衰要能按调用时刻重算。
   *
   * 界面停在历练页时不会重进页面,只靠每秒游戏钟重算这一张卡;若 `now`
   * 仍藏在函数体内读墙钟,传进来的时刻就被无视,守满 6 / 24 小时仍冻在
   * 进页那一刻。故障注入:删掉 `now` 形参、改回 `const now = Date.now()` → 红。
   */
  it('regionRecallFor 接受注入时刻:同一份存档随守土时长从混乱走到稳定、繁盛', () => {
    const player = usePlayerStore()
    const suppressedAt = Date.now()
    player.suppressedRegions = ['qingyun']
    player.suppressedSince = { qingyun: suppressedAt }
    player.regionStats = {
      qingyun: { totalFights: 0, avgRounds: 0, avgDamageTakenPct: 0, consecutiveWins: 0, lastUpdateAt: suppressedAt }
    }
    player.regionWins = { qingyun: 0 }

    expect(regionRecallFor('qingyun', suppressedAt + 1 * HOUR).prosperity).toBe('chaos')
    expect(regionRecallFor('qingyun', suppressedAt + 6 * HOUR).prosperity).toBe('stable')
    expect(regionRecallFor('qingyun', suppressedAt + 24 * HOUR).prosperity).toBe('flourish')
  })

  it('守土之年:镇压后守满时长也能走到稳定/繁盛(不必先刷满胜场)', () => {
    // 镇压后不再产出胜场,故「守多久」是另一条通往兴衰的路
    const held7h = deriveProsperity({
      totalWins: 0,
      hasSuppressed: true,
      suppressedAt: now - 7 * HOUR,
      lastActivityAt: now,
      now
    })
    expect(held7h.prosperity).toBe('stable')
    const held25h = deriveProsperity({
      totalWins: 0,
      hasSuppressed: true,
      suppressedAt: now - 25 * HOUR,
      lastActivityAt: now,
      now
    })
    expect(held25h.prosperity).toBe('flourish')
    // 未镇压者再久也不算数
    const notSuppressed = deriveProsperity({
      totalWins: 0,
      hasSuppressed: false,
      suppressedAt: now - 100 * HOUR,
      lastActivityAt: now,
      now
    })
    expect(notSuppressed.prosperity).toBe('chaos')
  })

  it('镇压收益微调:繁盛 110% > 稳定 105% > 混乱 100%(仍属"轻")', () => {
    expect(prosperityYieldMult('flourish')).toBeGreaterThan(prosperityYieldMult('stable'))
    expect(prosperityYieldMult('stable')).toBeGreaterThan(prosperityYieldMult('chaos'))
    expect(prosperityYieldMult('flourish')).toBeCloseTo(1.1, 6)
    expect(prosperityYieldMult('stable')).toBeCloseTo(1.05, 6)
    expect(prosperityYieldMult('chaos')).toBeCloseTo(1.0, 6)
  })

  /**
   * 复苏判定只有**一份钟**:`regionTouchedAt`(最后一次与它打交道)配
   * `isRegionRevived`。从前镇压那一路另有一个只看 `suppressedSince` 的
   * `isReviving`,同一片地界因此会在一个 tick 里被两处各报一次复聚。
   */
  it('复苏判定:从最后一次打交道起算,超过 72 小时则复苏', () => {
    const t = Date.now()
    expect(isRegionRevived(t, t + REVIVE_AFTER_HOURS * 3600_000 + 1)).toBe(true)
    expect(isRegionRevived(t, t + REVIVE_AFTER_HOURS * 3600_000 - 1)).toBe(false)
    // 从没打过交道(touchedAt 为 0)不算够钟:没有起点的钟不该自己走
    expect(isRegionRevived(0, t + REVIVE_AFTER_HOURS * 3600_000 + 1)).toBe(false)
  })

  it('复聚的钟取「最后一次打交道」:战斗 / 镇压 / 靖平三者最晚', () => {
    expect(regionTouchedAt(100, 200, 300)).toBe(300)
    expect(regionTouchedAt(undefined, undefined, undefined)).toBe(0)
    expect(regionTouchedAt(500, undefined, undefined)).toBe(500)
  })

  /**
   * 复聚倒计时 —— 界面把「还能守多久」写出来,与复苏判定共用同一个阈值。
   * 从前 72 小时的期限完全没有预告,玩家的体感是「镇压某天突然没了」。
   */
  it('复聚倒计时:与复苏判定同一条线,没有钟为 0', () => {
    const t = Date.now()
    expect(hoursUntilRevive(0, t), '没有起点的钟不该自己走').toBe(0)
    expect(hoursUntilRevive(t, t)).toBeCloseTo(REVIVE_AFTER_HOURS, 6)
    expect(hoursUntilRevive(t, t + 12 * 3600_000)).toBeCloseTo(REVIVE_AFTER_HOURS - 12, 6)
    // 倒计时归零的那一刻,正是复苏判定翻真的位置(两条口径不许分叉)
    const atRevive = t + REVIVE_AFTER_HOURS * 3600_000
    expect(hoursUntilRevive(t, atRevive)).toBe(0)
    expect(isRegionRevived(t, atRevive - 1)).toBe(false)
    expect(isRegionRevived(t, atRevive + 1)).toBe(true)
    expect(hoursUntilRevive(t, atRevive + 999 * 3600_000), '过期不出现负数').toBe(0)
  })

  /**
   * 倒计时必须吃**结算用的那一份钟** —— 三处各取各的必然分叉。
   *
   * 从前的反例:镇压 73 小时、但一小时前还在那片战斗。卡片只把 suppressedSince
   * 喂给 hoursUntilRevive,于是显示「妖气 0 时后复聚」**并停在那里**,而结算按
   * regionTouchedAt(最后一次战斗)判「还早 71 小时」—— 玩家守着一片永远「即将复聚」
   * 却从不复聚的地界。故障注入:卡片改回只读 suppressedSince → 本条红。
   */
  it('复聚倒计时与结算读同一份钟:还在最后战斗的那片地界不显示「即将复聚」', () => {
    setActivePinia(createPinia())
    const player = usePlayerStore()
    const adventure = useAdventureStore()
    const t = Date.now()
    vi.setSystemTime(t + 73 * 3600_000)
    player.suppressedRegions = ['qingyun']
    player.suppressedSince = { qingyun: t } // 73 小时前镇压下来
    player.regionStats.qingyun = {
      totalFights: 20,
      avgRounds: 2,
      avgDamageTakenPct: 0.05,
      consecutiveWins: 20,
      lastUpdateAt: t + 72 * 3600_000 // 但一小时前还在打
    }
    // 结算读整份钟 ⇒ 只看镇压时刻会误判成「已够钟」
    expect(isRegionRevived(regionReviveClock('qingyun'), Date.now()), '最后一战把钟推后了').toBe(false)
    // 倒计时同样读整份钟 ⇒ 应还剩约 71 小时,而不是 0
    expect(hoursUntilRevive(regionReviveClock('qingyun'), Date.now())).toBeCloseTo(REVIVE_AFTER_HOURS - 1, 6)
    // 只有镇压一条钟的地界(never fought since)才真的快到点
    delete player.regionStats.qingyun
    expect(hoursUntilRevive(regionReviveClock('qingyun'), Date.now())).toBe(0)
    expect(adventure.clearedAt.qingyun).toBeUndefined()
  })
})

describe('S2 宿敌记忆', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('败北不足 3 次不成宿敌', () => {
    let list: NemesisRecord[] = []
    for (let i = 0; i < 2; i++) {
      const r = recordLoss(list, 'e_wolf', '赤目野狼', 'qingyun', Date.now())
      list = r.list
      expect(r.becameNemesis).toBe(false)
    }
    expect(list[0]?.lossCount).toBe(2)
  })

  it('第 3 次败北标记宿敌', () => {
    let list: NemesisRecord[] = []
    let flag = false
    for (let i = 0; i < NEMESIS_THRESHOLD; i++) {
      const r = recordLoss(list, 'e_wolfking', '独角妖狼', 'qingyun', Date.now())
      list = r.list
      flag = r.becameNemesis
    }
    expect(flag).toBe(true)
    expect(isNemesis(list, 'e_wolfking')).toBe(true)
  })

  it('成敌 toast 的次数字与 NEMESIS_THRESHOLD 同源:不手抄「三次」', () => {
    const exploration = readFileSync(resolve(__dirname, './exploration.ts'), 'utf8')
    expect(exploration, 'toast 应读宿敌门槛').toContain('NEMESIS_THRESHOLD}次')
    expect(exploration, 'toast 不应把 3 写死').not.toContain('败北三次')
  })

  it('雪耻后不再是宿敌', () => {
    let list: NemesisRecord[] = []
    for (let i = 0; i < NEMESIS_THRESHOLD; i++) {
      list = recordLoss(list, 'e_icejiao', '玄冰蛟', 'hantan', Date.now()).list
    }
    expect(isNemesis(list, 'e_icejiao')).toBe(true)
    list = markAvenged(list, 'e_icejiao', Date.now())
    expect(isNemesis(list, 'e_icejiao')).toBe(false)
    expect(list[0]?.avengedAt).toBeDefined()
  })

  it('同敌多次败北累加,不新增条目', () => {
    let list: NemesisRecord[] = []
    for (let i = 0; i < 5; i++) {
      list = recordLoss(list, 'e_bwking', '黑风妖王', 'heifeng', Date.now()).list
    }
    expect(list.length).toBe(1)
    expect(list[0]?.lossCount).toBe(5)
  })

  /**
   * 整批败北(离线整段结算)与逐场等价:
   * 一批 N 场与连调 N 次 recordLoss 得到同一份账,且 only 过门槛那一批报「新成宿敌」。
   */
  it('整批败北与逐场入账等价,门槛只在跨过的那一批报一次', () => {
    const now = Date.now()
    let single: NemesisRecord[] = []
    for (let i = 0; i < 5; i++) single = recordLoss(single, 'e_wolf', '赤目野狼', 'qingyun', now).list

    const first = recordLossBatch([], 'e_wolf', '赤目野狼', 'qingyun', now, 2)
    expect(first.list[0]?.lossCount, '两场一批记两次').toBe(2)
    expect(first.list[0]?.lastLossAt, '最后败北时刻与本批同一时刻').toBe(now)
    expect(first.becameNemesis, '两场还没过门槛').toBe(false)

    const second = recordLossBatch(first.list, 'e_wolf', '赤目野狼', 'qingyun', now, 3)
    expect(second.list[0]?.lossCount, '累计与本批相加').toBe(5)
    expect(second.becameNemesis, '这一批跨过门槛 → 报一次').toBe(true)
    expect(second.list, '整批与逐场得到同一份账').toEqual(single)

    const third = recordLossBatch(second.list, 'e_wolf', '赤目野狼', 'qingyun', now, 1)
    expect(third.becameNemesis, '已过门槛的再败不重复报').toBe(false)
  })

  it('整批次数不是正数时原样返回,不凭空立敌', () => {
    const before: NemesisRecord[] = []
    expect(recordLossBatch(before, 'e_wolf', '赤目野狼', 'qingyun', Date.now(), 0)).toEqual({
      list: before,
      becameNemesis: false
    })
  })
})

describe('S3 事件余波', () => {
  it('未完成事件不触发余波', () => {
    expect(shouldTriggerAftermath({}, 'ev_jade_slip', 0.1)).toBe(false)
  })

  it('完成过事件:小概率触发', () => {
    const mem = recordEvent({}, 'ev_jade_slip', 0, Date.now())
    expect(shouldTriggerAftermath(mem, 'ev_jade_slip', AFTERMATH_CHANCE - 0.01)).toBe(true)
    expect(shouldTriggerAftermath(mem, 'ev_jade_slip', AFTERMATH_CHANCE + 0.01)).toBe(false)
  })

  it('记忆累加次数与最近选择', () => {
    let mem = recordEvent({}, 'ev_merchant', 1, Date.now() - 1000)
    mem = recordEvent(mem, 'ev_merchant', 2, Date.now())
    expect(mem.ev_merchant?.times).toBe(2)
    expect(mem.ev_merchant?.lastChoiceIdx).toBe(2)
  })

  it('余波文案三类', () => {
    expect(aftermathText('青石上的老者', 'good')).toContain('暖意')
    expect(aftermathText('青石上的老者', 'echo')).toContain('余韵')
    expect(aftermathText('青石上的老者', 'silence')).toContain('寂静')
  })
})
