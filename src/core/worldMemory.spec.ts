/** 世界记忆:S1 区域兴衰 / S2 宿敌记忆 / S3 事件余波 */
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

  /** 故障注入:闲置判定改回只看 `input.lastActivityAt`,本条红 */
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
      lastActivityAt: now - 60 * HOUR,
      now
    })
    expect(held50h.prosperity, '守了 50 小时却判成混乱,等于把守土收益吃掉').toBe('flourish')

    // 未镇压的地界仍按最后一战回落
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
    expect(recall.suppressedAt).toBe(suppressedAt)
    expect(recall.since).toBe(suppressedAt)
    // 回归点
    expect(recall.since).not.toBe(lastFight)
  })

  it('兴衰名称映射正确', () => {
    expect(prosperityName('chaos')).toBe('混乱')
    expect(prosperityName('stable')).toBe('稳定')
    expect(prosperityName('flourish')).toBe('繁盛')
  })

  /** 故障注入:把胜场判据改回 regionStats.totalFights(本例故意与 regionWins 不一致),本条红 */
  it('regionRecallFor 按净胜场判兴衰:连输再多也不算繁盛', () => {
    const player = usePlayerStore()
    player.suppressedRegions = ['qingyun']
    player.suppressedSince = { qingyun: Date.now() }
    player.regionStats = {
      qingyun: {
        totalFights: FLOURISH_WINS + 50, // 只在胜场累计;此处故意与 regionWins 错开
        avgRounds: 9,
        avgDamageTakenPct: 0.9,
        consecutiveWins: 0,
        lastUpdateAt: Date.now()
      }
    }
    player.regionWins = { qingyun: 0 }
    expect(regionRecallFor('qingyun').prosperity, '本世一场没赢却判繁盛,是错的').toBe('chaos')

    player.regionWins = { qingyun: STABLE_WINS }
    expect(regionRecallFor('qingyun').prosperity).toBe('stable')
    player.regionWins = { qingyun: FLOURISH_WINS }
    expect(regionRecallFor('qingyun').prosperity).toBe('flourish')
  })

  /** 故障注入:删掉 `now` 形参、改回 `const now = Date.now()`,本条红 */
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

  it('复苏判定:从最后一次打交道起算,超过 72 小时则复苏', () => {
    const t = Date.now()
    expect(isRegionRevived(t, t + REVIVE_AFTER_HOURS * 3600_000 + 1)).toBe(true)
    expect(isRegionRevived(t, t + REVIVE_AFTER_HOURS * 3600_000 - 1)).toBe(false)
    // touchedAt 为 0 不算够钟
    expect(isRegionRevived(0, t + REVIVE_AFTER_HOURS * 3600_000 + 1)).toBe(false)
  })

  it('复聚的钟取「最后一次打交道」:战斗 / 镇压 / 靖平三者最晚', () => {
    expect(regionTouchedAt(100, 200, 300)).toBe(300)
    expect(regionTouchedAt(undefined, undefined, undefined)).toBe(0)
    expect(regionTouchedAt(500, undefined, undefined)).toBe(500)
  })

  it('复聚倒计时:与复苏判定同一条线,没有钟为 0', () => {
    const t = Date.now()
    expect(hoursUntilRevive(0, t), '没有起点的钟不该自己走').toBe(0)
    expect(hoursUntilRevive(t, t)).toBeCloseTo(REVIVE_AFTER_HOURS, 6)
    expect(hoursUntilRevive(t, t + 12 * 3600_000)).toBeCloseTo(REVIVE_AFTER_HOURS - 12, 6)
    // 倒计时归零处即复苏判定翻真处
    const atRevive = t + REVIVE_AFTER_HOURS * 3600_000
    expect(hoursUntilRevive(t, atRevive)).toBe(0)
    expect(isRegionRevived(t, atRevive - 1)).toBe(false)
    expect(isRegionRevived(t, atRevive + 1)).toBe(true)
    expect(hoursUntilRevive(t, atRevive + 999 * 3600_000), '过期不出现负数').toBe(0)
  })

  /** 故障注入:regionReviveClock 改回只读 suppressedSince,本条红 */
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
    expect(isRegionRevived(regionReviveClock('qingyun'), Date.now()), '最后一战把钟推后了').toBe(false)
    expect(hoursUntilRevive(regionReviveClock('qingyun'), Date.now())).toBeCloseTo(REVIVE_AFTER_HOURS - 1, 6)
    // 只剩镇压一条钟时才到点
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

  /** 故障注入:recordLoss 旗标改回 `lossCount >= threshold`,本条红 */
  it('逐场败北:宿敌旗标只在跨过门槛那一败为真', () => {
    const losses = NEMESIS_THRESHOLD + 2
    let list: NemesisRecord[] = []
    const flags: boolean[] = []
    for (let i = 0; i < losses; i++) {
      const r = recordLoss(list, 'e_wolf', '赤目野狼', 'qingyun', Date.now())
      list = r.list
      flags.push(r.becameNemesis)
    }
    const expected = Array.from({ length: losses }, (_, i) => i + 1 === NEMESIS_THRESHOLD)
    expect(flags, '跨门槛那一败报一次,之后每败都不再报').toEqual(expected)
    expect(list[0]?.lossCount, '败场照常累加').toBe(losses)
  })

  /** 雪耻永久(avengedAt 只写一次)且 lossCount 不清零:雪耻后此敌不再成宿敌 */
  it('雪耻后再败:逐场与整批都不再报宿敌', () => {
    const now = Date.now()
    let list: NemesisRecord[] = []
    for (let i = 0; i < NEMESIS_THRESHOLD; i++) list = recordLoss(list, 'e_icejiao', '玄冰蛟', 'hantan', now).list
    list = markAvenged(list, 'e_icejiao', now)
    const afterAvenge = list
    for (let i = 0; i < NEMESIS_THRESHOLD; i++) {
      const r = recordLoss(list, 'e_icejiao', '玄冰蛟', 'hantan', now)
      list = r.list
      expect(r.becameNemesis, `雪耻后第 ${i + 1} 败不报`).toBe(false)
    }
    expect(isNemesis(list, 'e_icejiao'), '雪耻后仍不是宿敌').toBe(false)
    expect(list[0]?.lossCount, '败场照常累加').toBe(NEMESIS_THRESHOLD * 2)
    expect(
      recordLossBatch(afterAvenge, 'e_icejiao', '玄冰蛟', 'hantan', now, NEMESIS_THRESHOLD).becameNemesis,
      '整批同样不报'
    ).toBe(false)
  })

  /** 坏档经 sanitize 可留下败场低于门槛的已雪耻记录;故障注入:旗标去掉 avengedAt 条件,本条红 */
  it('已雪耻记录从门槛下再跨过门槛也不报', () => {
    const now = Date.now()
    const avenged: NemesisRecord[] = [
      { enemyId: 'e_wolf', enemyName: '赤目野狼', regionId: 'qingyun', lossCount: 0, lastLossAt: 0, avengedAt: now }
    ]
    let list = avenged
    for (let i = 0; i < NEMESIS_THRESHOLD; i++) {
      const r = recordLoss(list, 'e_wolf', '赤目野狼', 'qingyun', now)
      list = r.list
      expect(r.becameNemesis, `第 ${i + 1} 败不报`).toBe(false)
    }
    expect(isNemesis(list, 'e_wolf')).toBe(false)
    expect(recordLossBatch(avenged, 'e_wolf', '赤目野狼', 'qingyun', now, NEMESIS_THRESHOLD).becameNemesis).toBe(false)
  })

  /** 故障注入:旗标改回 `lossCount >= threshold`,或去掉 avengedAt 条件,本条红 */
  it('穷举:整批与逐场同一份账,旗标 = 逐场取或 = isNemesis 由假转真', () => {
    const now = Date.now()
    const id = 'e_wolf'
    const fillers: NemesisRecord[] = Array.from({ length: 50 }, (_, i) => ({
      enemyId: `e_filler${i}`,
      enemyName: '路人',
      regionId: 'qingyun',
      lossCount: 1,
      lastLossAt: 0
    }))
    const initials: (NemesisRecord | undefined)[] = [undefined]
    for (let c = 0; c <= NEMESIS_THRESHOLD + 2; c++) {
      initials.push({ enemyId: id, enemyName: '赤目野狼', regionId: 'qingyun', lossCount: c, lastLossAt: 0 })
      initials.push({ enemyId: id, enemyName: '赤目野狼', regionId: 'qingyun', lossCount: c, lastLossAt: 0, avengedAt: 1 })
    }
    for (const full of [false, true]) {
      for (const init of initials) {
        // 满表:新敌入账要挤掉最早一条(上限 50)
        const start = init ? [...(full ? fillers.slice(1) : []), init] : full ? fillers : []
        for (let times = 0; times <= NEMESIS_THRESHOLD * 2; times++) {
          let single = start
          const flags: boolean[] = []
          for (let i = 0; i < times; i++) {
            const r = recordLoss(single, id, '赤目野狼', 'qingyun', now)
            single = r.list
            flags.push(r.becameNemesis)
          }
          const batch = recordLossBatch(start, id, '赤目野狼', 'qingyun', now, times)
          const initTag = init ? `${init.lossCount}${init.avengedAt === undefined ? '' : '(已雪耻)'}` : '无'
          const tag = `满表=${full} 初始=${initTag} 本批=${times}`
          expect(batch.list, `${tag}:同一份账`).toEqual(single)
          expect(flags.filter(Boolean).length, `${tag}:逐场至多报一次`).toBeLessThanOrEqual(1)
          expect(batch.becameNemesis, `${tag}:整批 = 逐场取或`).toBe(flags.some(Boolean))
          expect(batch.becameNemesis, `${tag}:旗标 = isNemesis 由假转真`).toBe(
            !isNemesis(start, id) && isNemesis(batch.list, id)
          )
        }
      }
    }
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


/**
 * 复聚钟的两个候选(镇压起钟 / 通关时刻)都要按**时间戳**修形。
 *
 * `regionTouchedAt` 在 `lastUpdateAt` / `suppressedSince` / `clearedAt` 三者间取 max,
 * 而 `isRegionRevived` 判 `(now - touchedAt) / 3600_000 > REVIVE_AFTER_HOURS`。
 * 任一候选是坏档巨值时,那个减法恒为极大负数 —— **该地界永不复苏**。
 */
describe('复聚钟 · 坏档巨值不许让地界永不复苏', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('镇压起钟是巨值时按此刻重起', () => {
    const player = usePlayerStore()
    player.$patch({ suppressedRegions: ['qingyun'], suppressedSince: { qingyun: 1e300 } } as never)
    player.sanitize()
    const clock = player.suppressedSince.qingyun!
    expect(clock, '巨值起钟没被重起 —— 复聚钟会停在它上面').toBeLessThanOrEqual(Date.now())
    expect(clock, '重起钟该落在「此刻」附近').toBeGreaterThan(Date.now() - 5000)
  })

  it('正常镇压起钟原样保留', () => {
    const player = usePlayerStore()
    const at = Date.now() - 50 * 3600_000
    player.$patch({ suppressedRegions: ['qingyun'], suppressedSince: { qingyun: at } } as never)
    player.sanitize()
    expect(player.suppressedSince.qingyun, '正常起钟被误改了').toBe(at)
  })
})
