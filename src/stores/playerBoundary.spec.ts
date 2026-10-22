/** 玩家区域统计、奇缘与暂停顺延的公共写入边界 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import type { RegionStats } from '@/core/suppress'
import { MAX_MAJOR } from '@/data/realms'
import { SUB_LEVELS } from '@/data/constants'

function stats(over: Partial<RegionStats> = {}): RegionStats {
  return {
    consecutiveWins: 1,
    totalFights: 2,
    avgRounds: 5,
    avgDamageTakenPct: 0.2,
    lastUpdateAt: 1000,
    ...over
  }
}

describe('玩家区域统计与奇缘公共写入边界', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('区域统计只认真实地界与有限非负战报,坏调用不改旧账', () => {
    const player = usePlayerStore()
    const before = stats()
    player.regionStats = { qingyun: before }

    player.updateRegionStats('ghost', true, 3, 0.1)
    expect(player.regionStats).toEqual({ qingyun: before })

    for (const bad of [NaN, Infinity, -1]) {
      player.updateRegionStats('qingyun', true, bad, 0.1)
      player.updateRegionStats('qingyun', true, 3, bad)
    }
    expect(player.regionStats.qingyun, '坏回合或坏受伤占比不能污染均值').toEqual(before)

    player.updateRegionStats('qingyun', false, 0, 2)
    expect(player.regionStats.qingyun).toMatchObject({ consecutiveWins: 0, totalFights: 3 })
    expect(player.regionStats.qingyun?.avgDamageTakenPct, '受伤占比夹在 0..1').toBeLessThanOrEqual(1)
  })

  it('离线批量净胜只认真实地界与有限非负批量', () => {
    const player = usePlayerStore()
    const before = stats()
    player.regionStats = { qingyun: before }
    player.regionWins = { qingyun: 2 }

    for (const bad of [NaN, Infinity, -1]) player.applyRegionWinBatch('qingyun', bad, 3, 0.1)
    player.applyRegionWinBatch('ghost', 2, 3, 0.1)
    player.applyRegionWinBatch('qingyun', 2, NaN, 0.1)
    player.applyRegionWinBatch('qingyun', 2, 3, Infinity)

    expect(player.regionStats.qingyun).toEqual(before)
    expect(player.regionWins).toEqual({ qingyun: 2 })

    player.applyRegionWinBatch('qingyun', 2, 3, 0.1)
    expect(player.regionStats.qingyun).toMatchObject({ consecutiveWins: 3, totalFights: 4 })
    expect(player.regionWins.qingyun).toBe(4)
  })

  it('镇压与区域胜场只认真实地界', () => {
    const player = usePlayerStore()
    player.suppressRegion('ghost')
    player.markSuppressQualified('ghost')
    player.recordRegionWin('ghost')
    expect(player.suppressedRegions).toEqual([])
    expect(player.suppressQualified).toEqual([])
    expect(player.suppressedSince).toEqual({})
    expect(player.regionWins).toEqual({})

    player.suppressRegion('qingyun')
    player.markSuppressQualified('qingyun')
    player.recordRegionWin('qingyun')
    expect(player.suppressedRegions).toEqual(['qingyun'])
    expect(player.suppressQualified).toEqual(['qingyun'])
    expect(player.suppressedSince.qingyun).toBeGreaterThan(0)
    expect(player.regionWins.qingyun).toBe(1)
  })

  it('奇缘进度只认目录链,阶段夹在 0..链长', () => {
    const player = usePlayerStore()
    player.setEventChain('ghost_chain', 1)
    expect(player.eventChains).toEqual({})

    for (const bad of [NaN, Infinity]) player.setEventChain('old_man_stone', bad)
    expect(player.eventChains, '非有限阶段不写进度').toEqual({})
    player.setEventChain('old_man_stone', -1)
    expect(player.eventChains.old_man_stone, '负阶段夹回 0,与读档修形同口径').toBe(0)

    player.setEventChain('old_man_stone', 99)
    expect(player.eventChains.old_man_stone).toBe(3)
    player.setEventChain('old_man_stone', 1.8)
    expect(player.eventChains.old_man_stone).toBe(1)
  })

  it('暂停顺延拒绝坏时长,不把在身状态与区域计时写成 NaN', () => {
    const player = usePlayerStore()
    player.divination = {
      hexagram: '乾',
      upper: 'qian',
      lower: 'qian',
      changed: null,
      changing: 0,
      changingAt: [],
      lines: [1, 1, 1, 1, 1, 1],
      castAt: 1000,
      expiresAt: 5000
    }
    player.regionEvent = { regionId: 'qingyun', eventId: 'yaochao', endsAt: 6000 }
    player.breakthroughPrep = { bonus: 0.05, readyAt: 7000, kind: 'pill' }
    player.enlightenmentAt = 8000
    player.suppressedSince = { qingyun: 9000 }
    player.regionStats = { qingyun: stats({ lastUpdateAt: 10000 }) }

    for (const bad of [NaN, Infinity, -Infinity, -1, 0]) player.shiftTimedState(bad)
    expect(player.divination.expiresAt).toBe(5000)
    expect(player.regionEvent.endsAt).toBe(6000)
    expect(player.breakthroughPrep.readyAt).toBe(7000)
    expect(player.enlightenmentAt).toBe(8000)
    expect(player.suppressedSince.qingyun).toBe(9000)
    expect(player.regionStats.qingyun?.lastUpdateAt).toBe(10000)

    player.shiftTimedState(500)
    expect(player.divination.expiresAt).toBe(5500)
    expect(player.regionEvent.endsAt).toBe(6500)
    expect(player.breakthroughPrep.readyAt).toBe(7500)
    expect(player.enlightenmentAt).toBe(8500)
    expect(player.suppressedSince.qingyun).toBe(9500)
    expect(player.regionStats.qingyun?.lastUpdateAt).toBe(10500)
  })

  it('读档境界大阶与层数取整夹界,派生境界/名称/数值都可用', () => {
    const player = usePlayerStore()

    player.$patch({ major: Number.NaN, sub: Number.NaN })
    player.sanitize()
    expect(player.major).toBe(0)
    expect(player.sub).toBe(0)

    player.$patch({ major: 3.5, sub: 4.8 })
    player.sanitize()
    expect(player.major, '小数大阶不能当境界表下标').toBe(3)
    expect(player.sub, '小数层数不能带进公式').toBe(4)
    expect(player.realm, '境界定义必须存在').toBeDefined()
    expect(typeof player.subName, '层数名称必须是字符串').toBe('string')

    player.$patch({ major: 999, sub: 999 })
    player.sanitize()
    expect(player.major).toBe(MAX_MAJOR)
    expect(player.sub).toBe(SUB_LEVELS - 1)
    expect(Number.isFinite(player.cultPerSec), '越界大阶不得把增速算成 Infinity').toBe(true)
    expect(Number.isFinite(player.qiCapValue), '越界层数不得把灵气容量算成 Infinity').toBe(true)
  })
})
