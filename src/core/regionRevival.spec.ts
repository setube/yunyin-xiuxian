import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAdventureStore } from '@/stores/adventure'
import { usePlayerStore } from '@/stores/player'
import { settleRegionRevivals } from './regionRevival'
import { settleSuppressedRegions } from './suppress'
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
    expect(settleRegionRevivals(T0)).toEqual([])
    expect(adventure.revived).toEqual([])
  })

  it('已靖满 REVIVE_AFTER_HOURS 的地界旧主归来:不再已靖、进 revived', () => {
    vi.setSystemTime(T0)
    const adventure = useAdventureStore()
    const id = REGIONS[0]!.id
    adventure.markCleared(id) // 已靖起钟 = T0

    vi.setSystemTime(T0 + (REVIVE_AFTER_HOURS + 1) * H) // 73 小时后
    const returned = settleRegionRevivals(Date.now())

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
    expect(settleRegionRevivals(Date.now())).toEqual([])
    expect(adventure.revived.includes(id)).toBe(false)
    expect(adventure.cleared.includes(id)).toBe(true) // 仍已靖
  })

  it('旧主已归来的地界不重复复聚', () => {
    vi.setSystemTime(T0)
    const adventure = useAdventureStore()
    const id = REGIONS[0]!.id
    adventure.markCleared(id)
    vi.setSystemTime(T0 + (REVIVE_AFTER_HOURS + 1) * H)
    expect(settleRegionRevivals(Date.now())).toContain(id) // 第一次复聚

    vi.setSystemTime(T0 + (REVIVE_AFTER_HOURS + 3) * H) // 再熬更久
    expect(settleRegionRevivals(Date.now())).toEqual([]) // 不重复(已归来,待再靖)
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
    expect(settleRegionRevivals(now)).toEqual([])
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
})
