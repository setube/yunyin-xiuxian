/**
 * 星象值日定向的判据:界面置灰、按钮拒因与真正扣费都读这一份。
 * 判据顺序就是玩家看到的顺序:已定向此界 > 今日已用尽 > 灵石不足。
 */
import { describe, expect, it } from 'vitest'
import { MANSION_REDIRECT_COST, MANSION_REDIRECT_MAX } from '@/data/constants'
import { gn, gnZero, toNum } from '@/utils/gnum'
import { mansionRedirectCheck, type MansionRedirect } from './mansionRedirect'

const DAY = 12345
const COST = MANSION_REDIRECT_COST
const RICH = gn(COST * 10)
const rec = (over: Partial<MansionRedirect> = {}): MansionRedirect => ({ gameDay: DAY, worldId: 'mortal', count: 1, ...over })

describe('星象值日定向 · 能否定向', () => {
  it('今日没定向过、灵石够:放行且不报差额', () => {
    const r = mansionRedirectCheck(DAY, null, 'immortal', RICH)
    expect(r.blocked).toBeNull()
    expect(r.reason).toBeNull()
    expect(toNum(r.stoneShort)).toBe(0)
  })

  it('记录属于别的游戏日:视同今天还没定向', () => {
    const stale = rec({ gameDay: DAY - 1 })
    expect(mansionRedirectCheck(DAY, stale, 'mortal', RICH), '昨天的记录不该拦住今天').toMatchObject({ blocked: null })
  })

  it('已定向到同一界:挡住,且此时不报灵石差额', () => {
    const r = mansionRedirectCheck(DAY, rec({ worldId: 'mortal', count: MANSION_REDIRECT_MAX }), 'mortal', gnZero())
    expect(r.blocked).toBe('already')
    expect(r.reason).toBe('已定向此界')
    expect(toNum(r.stoneShort), '已定向此界时余额为 0 也不该报差石').toBe(0)
  })

  it('今日用尽却要定向别的界:报「今日已用尽」,不报灵石', () => {
    const r = mansionRedirectCheck(DAY, rec({ worldId: 'mortal', count: MANSION_REDIRECT_MAX }), 'immortal', gnZero())
    expect(r.blocked).toBe('limit')
    expect(r.reason).toBe('今日已用尽')
    expect(toNum(r.stoneShort)).toBe(0)
  })

  it('次数未到上限:可以定向别的界,按灵石判', () => {
    const r = mansionRedirectCheck(DAY, rec({ worldId: 'mortal', count: MANSION_REDIRECT_MAX - 1 }), 'immortal', RICH)
    expect(r.blocked, '还没用尽就该放行').toBeNull()
  })

  it('灵石不足:报差额,差额等于 需要 - 余额', () => {
    const have = gn(COST - 40)
    const r = mansionRedirectCheck(DAY, null, 'immortal', have)
    expect(r.blocked).toBe('stone')
    expect(toNum(r.stoneShort)).toBeCloseTo(40)
    expect(r.reason, '拒因直接写差额').toBe('灵石尚差 40')
  })

  it('灵石刚好等于代价:放行(边界含等号)', () => {
    expect(mansionRedirectCheck(DAY, null, 'immortal', gn(COST)).blocked).toBeNull()
  })

  it('零灵石:差额就是全价', () => {
    const r = mansionRedirectCheck(DAY, null, 'immortal', gnZero())
    expect(toNum(r.stoneShort)).toBe(COST)
  })

  it('判据顺序:已定向此界优先于灵石不足', () => {
    const r = mansionRedirectCheck(DAY, rec({ worldId: 'mortal', count: 1 }), 'mortal', gnZero())
    expect(r.blocked, '同界且没钱,应先报「已定向此界」').toBe('already')
  })
})
