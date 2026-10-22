import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAdventureStore } from '@/stores/adventure'
import { usePlayerStore } from '@/stores/player'
import { useUiStore } from '@/stores/ui'
import { settleRegionRevivals } from './regionRevival'
import { settleSuppressedRegions } from './suppress'
import { regionBossCleared, winsUntilRegionBoss } from './exploration'
import { REGIONS } from '@/data/regions'
import { REVIVE_AFTER_HOURS } from './worldMemory'

const T0 = 1_000_000
const H = 3600_000

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.useRealTimers())

describe('妖气复聚(regionRevival)', () => {
  it('未靖平的地界无妖气可聚,不复聚', () => {
    const adventure = useAdventureStore()
    const id = REGIONS[0]!.id
    expect(adventure.cleared.includes(id)).toBe(false)
    expect(settleRegionRevivals(T0)).toEqual({ returned: [], loosened: [] })
    expect(adventure.revived).toEqual([])
  })

  it('已靖满 REVIVE_AFTER_HOURS 的地界旧主归来:不再已靖、进 revived', () => {
    vi.setSystemTime(T0)
    const adventure = useAdventureStore()
    const id = REGIONS[0]!.id
    adventure.markCleared(id) // 已靖起钟 = T0

    vi.setSystemTime(T0 + (REVIVE_AFTER_HOURS + 1) * H) // 73 小时后
    const { returned } = settleRegionRevivals(Date.now())

    expect(returned).toContain(id)
    expect(adventure.cleared.includes(id)).toBe(false) // 旧主归来,不再已靖
    expect(adventure.revived.includes(id)).toBe(true)
  })

  it('未满 REVIVE_AFTER_HOURS 不复聚', () => {
    vi.setSystemTime(T0)
    const adventure = useAdventureStore()
    const id = REGIONS[0]!.id
    adventure.markCleared(id)

    vi.setSystemTime(T0 + 1 * H) // 1 小时后
    expect(settleRegionRevivals(Date.now())).toEqual({ returned: [], loosened: [] })
    expect(adventure.revived.includes(id)).toBe(false)
    expect(adventure.cleared.includes(id)).toBe(true) // 仍已靖
  })

  it('旧主已归来的地界不重复复聚', () => {
    vi.setSystemTime(T0)
    const adventure = useAdventureStore()
    const id = REGIONS[0]!.id
    adventure.markCleared(id)
    vi.setSystemTime(T0 + (REVIVE_AFTER_HOURS + 1) * H)
    expect(settleRegionRevivals(Date.now()).returned).toContain(id) // 第一次复聚

    vi.setSystemTime(T0 + (REVIVE_AFTER_HOURS + 3) * H) // 再熬更久
    expect(settleRegionRevivals(Date.now()).returned).toEqual([]) // 不重复(已归来,待再靖)
  })

  it('再靖一次即复位:revived 收掉,待下一次复聚', () => {
    vi.setSystemTime(T0)
    const adventure = useAdventureStore()
    const id = REGIONS[0]!.id
    adventure.markCleared(id)
    vi.setSystemTime(T0 + (REVIVE_AFTER_HOURS + 1) * H)
    settleRegionRevivals(Date.now()) // 复聚
    expect(adventure.revived.includes(id)).toBe(true)

    adventure.markCleared(id) // 再靖
    expect(adventure.revived.includes(id)).toBe(false) // 复位
    expect(adventure.cleared.includes(id)).toBe(true)
  })

  it('近期镇压推迟旧主归来:已靖很久但刚镇压,未满 72h 不复聚', () => {
    vi.setSystemTime(T0)
    const adventure = useAdventureStore()
    const player = usePlayerStore()
    const id = REGIONS[0]!.id
    adventure.markCleared(id) // 早就靖了(起钟 T0)
    const now = T0 + (REVIVE_AFTER_HOURS + 1) * H
    player.suppressedSince = { [id]: now - 1 * H } // 但 1 小时前才镇压

    // touchedAt = max(clearedAt=旧, suppressedSince=新) = suppressedSince ⇒ 只过 1h,未满钟
    expect(settleRegionRevivals(now)).toEqual({ returned: [], loosened: [] })
    expect(adventure.revived.includes(id)).toBe(false)
    expect(adventure.cleared.includes(id)).toBe(true)
  })

  it('经 settleSuppressedRegions 接线:一份镇压都没有的已靖地界满钟也复聚(早退挡不住)', () => {
    vi.setSystemTime(T0)
    const adventure = useAdventureStore()
    const player = usePlayerStore()
    const id = REGIONS[0]!.id
    adventure.markCleared(id)
    vi.setSystemTime(T0 + (REVIVE_AFTER_HOURS + 1) * H) // 73 小时后,始终没镇压过

    expect(player.suppressedRegions).toEqual([]) // 一份镇压都没有
    settleSuppressedRegions(60) // 在线每 tick 同走这一处;复聚在「无镇压直接返回」之前结算

    expect(adventure.revived.includes(id)).toBe(true) // 旧主归来
    expect(adventure.cleared.includes(id)).toBe(false)
  })

  /**
   * 既已靖又镇压的地界够钟时只是**一桩事**:旧主归来,镇压随之松开。
   *
   * 镇压那一半从前由 suppress.settleSuppressedRegions 自己按 suppressedSince
   * 单独判「满 72 小时」并弹一条「镇压松动」,已靖那一半由这里按 regionTouchedAt
   * 判、弹一条「旧主归来」—— 两把钟各判各的,同一个 tick 弹两条,把一次复聚
   * 说成两桩事。故障注入:把松闸那段搬回 suppress.ts 各弹一条 → 本条红。
   */
  it('已靖且镇压同时够钟:只报一条,旧主归来与镇压松动一并说清', () => {
    vi.setSystemTime(T0)
    const adventure = useAdventureStore()
    const player = usePlayerStore()
    const ui = useUiStore()
    const id = REGIONS[0]!.id
    adventure.markCleared(id)
    player.suppressedRegions = [id]
    player.suppressedSince = { [id]: T0 }

    vi.setSystemTime(T0 + (REVIVE_AFTER_HOURS + 1) * H)
    settleRegionRevivals(Date.now())

    expect(ui.toasts, '同一次复聚只该弹一条').toHaveLength(1)
    expect(ui.toasts[0]!.text).toContain('旧主归来')
    expect(player.suppressedRegions, '妖气都聚起来了,镇压该松').not.toContain(id)
    expect(adventure.revived).toContain(id)
    expect(adventure.cleared).not.toContain(id)
  })

  /**
   * 松闸看的也是**那一片地方**的钟,不是镇压表另起的一把。
   *
   * 从前 suppress.settleSuppressedRegions 按 suppressedSince 判满 72h 就解镇压:
   * 玩家今天还在那片打怪(regionStats.lastUpdateAt 是刚才),镇压却按更早的镇压
   * 时刻被收了回去 —— 明明一直在守,收益却被判「久无人烟」。故障注入:松闸改回
   * isReviving(player.suppressedSince[...]) → 本条红。
   */
  it('镇压满 72h 但今天仍在那片战斗:不松闸(钟取最后一次打交道)', () => {
    const adventure = useAdventureStore()
    const player = usePlayerStore()
    const id = REGIONS[0]!.id
    const now = T0 + (REVIVE_AFTER_HOURS + 1) * H
    vi.setSystemTime(now)
    player.suppressedRegions = [id]
    player.suppressedSince = { [id]: T0 }
    player.regionStats[id] = {
      totalFights: 20,
      avgRounds: 2,
      avgDamageTakenPct: 0.05,
      consecutiveWins: 20,
      lastUpdateAt: now - 1 * H // 一小时前还在这片打过
    }

    expect(settleRegionRevivals(now)).toEqual({ returned: [], loosened: [] })
    expect(player.suppressedRegions, '还在守的地界不该被按旧时刻收掉').toContain(id)
    expect(adventure.revived).not.toContain(id)
  })

  /**
   * 旧主归来 = 首领该复出 —— 哪怕这处地界在本世路线上。
   *
   * markRevived 只收掉旧链 cleared 与起钟,本世路线节点 mortalCleared **不动**
   * (那个节点还扛着后续路段的可达性,撤掉会把整条路线重新锁死)。于是
   * regionBossCleared 必须自己补问一次 revived:路线内的区域复聚后,首领判定
   * 要回到「未靖」,runBattle 才会再召出旧主,玩家读到的「再历一程即可复靖」
   * 才兑现。此前它只看 mortalCleared,复聚后那条路线节点仍算已通 ——
   * 旧主永不再现,界面上却挂着「妖气复聚 · 再历一程即可复靖」。
   */
  it('复聚后首领判定转回未靖:路线内区域的本世节点仍通,也不再算「已靖」(首领复出)', () => {
    vi.setSystemTime(T0)
    const adventure = useAdventureStore()
    const regionId = 'qingyun'
    adventure.$patch({
      mortalWorld: {
        seed: 1, shapeId: 's', shapeName: 's', rhythmId: 'r', rhythmName: 'r', ruleId: 'r', ruleName: 'r', bias: 'b',
        chain: [{ nodeId: 'n1_qingyun', fromId: regionId, name: '青云山麓', tier: 1, enemies: [], boss: 'b', archetype: 'a', eventTags: [] }]
      } as never,
      cleared: [] as string[]
    } as never)
    adventure.markCleared(regionId) // 首领被靖:旧链 cleared 与起钟都在这一刻
    adventure.markNodeCleared('n1_qingyun') // 本世路线推进
    expect(regionBossCleared(regionId), '构型前提:首领已靖').toBe(true)
    expect(winsUntilRegionBoss(0, regionBossCleared(regionId))).toBeNull()

    vi.setSystemTime(T0 + (REVIVE_AFTER_HOURS + 1) * H)
    expect(settleRegionRevivals(Date.now()).returned).toContain(regionId) // 旧主归来

    expect(adventure.mortalCleared, '路线节点照旧留着 —— 撤掉会把整条路线重新锁死').toContain('n1_qingyun')
    expect(regionBossCleared(regionId), '归来即不再已靖,首领该复出').toBe(false)
    expect(winsUntilRegionBoss(0, regionBossCleared(regionId)), '首领重新排队,不再是 null').not.toBeNull()
  })
})
