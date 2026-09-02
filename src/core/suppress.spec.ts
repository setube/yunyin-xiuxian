import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { checkSuppression, settleSuppressedRegions } from './suppress'

describe('区域镇压系统', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('checkSuppression', () => {
    it('战斗次数不足时不触发镇压', () => {
      const player = usePlayerStore()
      player.regionStats.qingyun = {
        totalFights: 10,
        avgRounds: 2,
        avgDamageTakenPct: 0.05,
        consecutiveWins: 10,
        lastUpdateAt: Date.now()
      }

      expect(checkSuppression(player, 'qingyun')).toBe(false)
    })

    it('平均回合数过高时不触发镇压', () => {
      const player = usePlayerStore()
      player.regionStats.qingyun = {
        totalFights: 20,
        avgRounds: 5, // 超过阈值 3
        avgDamageTakenPct: 0.05,
        consecutiveWins: 20,
        lastUpdateAt: Date.now()
      }

      expect(checkSuppression(player, 'qingyun')).toBe(false)
    })

    it('平均受伤过高时不触发镇压', () => {
      const player = usePlayerStore()
      player.regionStats.qingyun = {
        totalFights: 20,
        avgRounds: 2,
        avgDamageTakenPct: 0.15, // 超过阈值 10%
        consecutiveWins: 20,
        lastUpdateAt: Date.now()
      }

      expect(checkSuppression(player, 'qingyun')).toBe(false)
    })

    it('满足所有条件时触发镇压', () => {
      const player = usePlayerStore()
      player.regionStats.qingyun = {
        totalFights: 20,
        avgRounds: 2,
        avgDamageTakenPct: 0.05,
        consecutiveWins: 20,
        lastUpdateAt: Date.now()
      }

      expect(checkSuppression(player, 'qingyun')).toBe(true)
    })

    it('已镇压的区域不重复触发', () => {
      const player = usePlayerStore()
      player.suppressedRegions = ['qingyun']
      player.regionStats.qingyun = {
        totalFights: 20,
        avgRounds: 2,
        avgDamageTakenPct: 0.05,
        consecutiveWins: 20,
        lastUpdateAt: Date.now()
      }

      expect(checkSuppression(player, 'qingyun')).toBe(false)
    })
  })

  describe('settleSuppressedRegions', () => {
    it('无镇压区域时不产出', () => {
      const resources = useResourcesStore()
      const initialStone = { ...resources.spiritStone }

      settleSuppressedRegions(60) // 1 分钟

      expect(resources.spiritStone).toEqual(initialStone)
    })

    it('镇压区域每小时产出灵石', () => {
      const player = usePlayerStore()
      player.major = 3 // 筑基境
      player.suppressedRegions = ['qingyun']
      const resources = useResourcesStore()
      const initialStone = { ...resources.spiritStone }

      // 模拟 1 小时
      settleSuppressedRegions(3600)

      // 应该有灵石增长
      expect(resources.spiritStone.m).toBeGreaterThan(initialStone.m)
    })

    it('镇压区域产出装备的概率正确', () => {
      const player = usePlayerStore()
      player.major = 3
      player.suppressedRegions = ['qingyun']
      const inventory = useInventoryStore()

      // 模拟随机数确保掉落
      vi.spyOn(Math, 'random').mockReturnValue(0.1) // 低于 0.4 的概率

      settleSuppressedRegions(3600) // 1 小时

      // 应该获得装备
      expect(inventory.items.length).toBeGreaterThan(0)

      vi.restoreAllMocks()
    })

    it('多个镇压区域同时产出', () => {
      const player = usePlayerStore()
      player.major = 5
      player.suppressedRegions = ['qingyun', 'cangwu']
      const resources = useResourcesStore()
      const initialStone = { ...resources.spiritStone }

      settleSuppressedRegions(3600)

      // 灵石增长应该是两个区域的总和
      const gain = resources.spiritStone.m - initialStone.m
      expect(gain).toBeGreaterThan(0)
    })
  })
})
