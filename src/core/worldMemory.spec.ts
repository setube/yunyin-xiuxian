/**
 * Phase 30.9:世界活性与服务层审计
 * S1 区域兴衰 / S2 宿敌记忆 / S3 事件余波
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import {
  deriveProsperity,
  hoursUntilRevive,
  prosperityName,
  recordLoss,
  isNemesis,
  markAvenged,
  recordEvent,
  shouldTriggerAftermath,
  aftermathText,
  isReviving,
  prosperityYieldMult,
  regionRecallFor,
  NEMESIS_THRESHOLD,
  STABLE_WINS,
  FLOURISH_WINS,
  AFTERMATH_CHANCE,
  REVIVE_AFTER_HOURS
} from './worldMemory'
import { usePlayerStore } from '@/stores/player'
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

  it('复苏判定:超过 72 小时无活动则复苏', () => {
    const t = Date.now()
    expect(isReviving(t, t + REVIVE_AFTER_HOURS * 3600_000 + 1)).toBe(true)
    expect(isReviving(t, t + REVIVE_AFTER_HOURS * 3600_000 - 1)).toBe(false)
    expect(isReviving(undefined, t)).toBe(false)
  })

  /**
   * 复聚倒计时 —— 界面把「还能守多久」写出来,与 isReviving 共用同一个阈值。
   * 从前 72 小时的期限完全没有预告,玩家的体感是「镇压某天突然没了」。
   */
  it('复聚倒计时:与复苏判定同一条线,未镇压为 0', () => {
    const t = Date.now()
    expect(hoursUntilRevive(undefined, t)).toBe(0)
    expect(hoursUntilRevive(t, t)).toBeCloseTo(REVIVE_AFTER_HOURS, 6)
    expect(hoursUntilRevive(t, t + 12 * 3600_000)).toBeCloseTo(REVIVE_AFTER_HOURS - 12, 6)
    // 倒计时归零的那一刻,正是复苏判定翻真的位置(两条口径不许分叉)
    const atRevive = t + REVIVE_AFTER_HOURS * 3600_000
    expect(hoursUntilRevive(t, atRevive)).toBe(0)
    expect(isReviving(t, atRevive - 1)).toBe(false)
    expect(isReviving(t, atRevive + 1)).toBe(true)
    expect(hoursUntilRevive(t, atRevive + 999 * 3600_000), '过期不出现负数').toBe(0)
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
