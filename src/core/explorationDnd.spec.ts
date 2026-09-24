/**
 * 「遇事勿扰」· 历练际遇不再弹窗(玩家反馈:「手动关闭际遇事件触发」)。
 *
 * 开启后历练撞见际遇/机缘/奇缘:按超时同一条路(默认好愿)当场结清 ——
 * 不置 pending 弹窗、事件照计、下一场战斗照排;关掉则恢复弹窗。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { tickExploration } from './exploration'
import { useAdventureStore } from '@/stores/adventure'
import { useSettingsStore } from '@/stores/settings'

/** 让事件判定可控:on = 必触发,off = 必不触发 */
const trigger = vi.hoisted(() => ({ value: false }))
vi.mock('@/utils/random', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/random')>()
  return {
    ...mod,
    rng: {
      next: () => 0.5,
      int: (_a: number, b: number) => b,
      float: (a: number, _b: number) => a,
      pick: <T,>(arr: readonly T[]): T => arr[0]!,
      weighted: <T,>(arr: readonly T[]): T => arr[0]!,
      chance: (): boolean => trigger.value
    }
  }
})

// 战斗恒判负即可:不测战斗,只测「事件走没走弹窗」
vi.mock('./combat', async importOriginal => {
  const mod = await importOriginal<typeof import('./combat')>()
  return {
    ...mod,
    resolveCombat: () => ({ win: false, rounds: 5, playerHpPct: 0.4 }),
    makeEnemySnap: () => ({ hp: 100, def: 10, atk: 10 })
  }
})

function forgeSession(now: number, nextBattleAt = now - 1): void {
  useAdventureStore().setSession({
    regionId: 'qingyun',
    mode: 'normal',
    startedAt: now - 5000,
    endsAt: now + 3600_000,
    nextBattleAt,
    wins: 0,
    losses: 0,
    events: 0,
    itemGain: 0,
    stoneGain: { m: 0, e: 0 },
    expGain: { m: 0, e: 0 }
  })
}

describe('遇事勿扰', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    trigger.value = false
  })

  it('关闭(默认):撞见际遇照常弹窗 —— 挂起 pending,不进战斗', () => {
    const now = Date.now()
    forgeSession(now)
    trigger.value = true
    tickExploration(now)
    const adventure = useAdventureStore()
    expect(adventure.pendingEventId, '默认应挂起弹窗').toBeTruthy()
    expect(adventure.session?.events, '弹窗等玩家决断,不算已结清').toBe(0)
  })

  it('开启:当场按默认好愿结清 —— 不挂 pending、事件照计、战斗照排', () => {
    const now = Date.now()
    forgeSession(now)
    useSettingsStore().dndEvents = true
    trigger.value = true
    tickExploration(now)
    const adventure = useAdventureStore()
    expect(adventure.pendingEventId, '勿扰不弹窗').toBeNull()
    expect(adventure.session?.events, '事件已按默认好愿结清').toBe(1)
    expect(adventure.session?.nextBattleAt, '下一场战斗照旧排期').toBeGreaterThan(now)
  })

  it('勿扰只关弹窗,不吞事件:没撞见时 events 不动', () => {
    const now = Date.now()
    // battle 窗口推到将来:只测「事件判定」这一格,不触发战斗(败北会清会话)
    forgeSession(now, now + 999_999)
    useSettingsStore().dndEvents = true
    trigger.value = false // 事件判定为否:无事发生
    tickExploration(now)
    const adventure = useAdventureStore()
    expect(adventure.session?.events).toBe(0)
  })
})
