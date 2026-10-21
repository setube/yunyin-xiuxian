/** 历练公共写入边界 —— 会话/区域/事件/暂停顺延 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAdventureStore } from '@/stores/adventure'
import type { AdventureSession } from '@/types'
import { gnZero } from '@/utils/gnum'

function session(over: Partial<AdventureSession> = {}): AdventureSession {
  return {
    regionId: 'qingyun',
    mode: 'normal',
    startedAt: 1000,
    endsAt: 2000,
    nextBattleAt: 1500,
    wins: 0,
    losses: 0,
    events: 0,
    stoneGain: gnZero(),
    expGain: gnZero(),
    itemGain: 0,
    ...over
  }
}

describe('历练公共写入边界', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('setSession 拒绝野区域与坏时刻,不清掉现有会话', () => {
    const a = useAdventureStore()
    const valid = session()
    a.setSession(valid)
    a.setSession(session({ regionId: 'ghost' }))
    a.setSession(session({ endsAt: NaN }))
    a.setSession(session({ nextBattleAt: Infinity }))
    expect(a.session, '坏写入不覆盖现有会话').toEqual(valid)
    a.setSession(null)
    expect(a.session).toBeNull()
  })

  it('unlock/markCleared/markRevived 只认区域目录', () => {
    const a = useAdventureStore()
    expect(a.unlock('ghost')).toBe(false)
    expect(a.unlocked).not.toContain('ghost')
    expect(a.markCleared('ghost')).toBe(false)
    expect(a.cleared).not.toContain('ghost')
    expect(a.markRevived('ghost')).toBe(false)
    expect(a.revived).not.toContain('ghost')
  })

  it('待处理事件只认事件目录与有限非负时刻', () => {
    const a = useAdventureStore()
    a.setPendingEvent('ghost_event', 1000)
    expect(a.pendingEventId).toBeNull()
    a.setPendingEvent('ft_sword_remnant', NaN)
    expect(a.pendingEventId, '坏时刻不挂事件').toBeNull()
    a.setPendingEvent('ft_sword_remnant', 1000)
    expect(a.pendingEventId).toBe('ft_sword_remnant')
    expect(a.pendingEventSince).toBe(1000)
  })

  it('暂停顺延拒绝坏时长,不把会话时刻写成 NaN', () => {
    const a = useAdventureStore()
    a.setSession(session())
    a.setPendingEvent('ft_sword_remnant', 1000)
    for (const ms of [NaN, Infinity, -1]) a.shiftTimedState(ms)
    expect(a.session!.endsAt).toBe(2000)
    expect(a.pendingEventSince).toBe(1000)
    a.shiftTimedState(500)
    expect(a.session!.endsAt).toBe(2500)
    expect(a.pendingEventSince).toBe(1500)
  })

  it('一次见闻与路线节点只收非空 id', () => {
    const a = useAdventureStore()
    a.markEventSeen('ghost_event')
    expect(a.seenOnceEvents).toEqual([])
    a.markEventSeen('ft_sword_remnant')
    expect(a.seenOnceEvents).toEqual(['ft_sword_remnant'])
    expect(a.markNodeCleared('')).toBe(false)
    expect(a.mortalCleared).toEqual([])
  })
})
