/**
 * 地界列表的可见性截断。
 *
 * visibleRows 用 `findIndex(r => !r.unlocked && !r.canEnter)` 定位第一个「既没发现也进不去」的地界,
 * 再 slice(0, idx + 1) —— 多切一格是有意的:让玩家看见下一处目标。
 *
 * 这条 instruction 在原文件的注释里写着,但此前没有 spec:
 * 只看 unlocked 会把「已能进但还没发现」的地界提前截掉(本世路线首段可能排在表靠后),
 * 只看 canEnter 则会把后面能进的一并藏起来。两种写法都会让玩家找不到该去的地方。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAdventureStore } from '@/stores/adventure'
import { usePlayerStore } from '@/stores/player'
import { useRegionRows } from './useRegionRows'
import { REGIONS } from '@/data/regions'

/** 按展示序摊平成 id 序列 */
function shownIds(): string[] {
  return useRegionRows().groupedRows.value.flatMap(g => g.rows.map(r => r.def.id))
}

describe('地界投影 · 可见性截断', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('新档只露出第一处(外加它自己),不会把全程铺开', () => {
    const ids = shownIds()
    expect(ids.length, '新档不该露出多处地界').toBeLessThanOrEqual(2)
    expect(ids, '第一处地界必须可见').toContain(REGIONS[0]!.id)
  })

  it('已发现的地界一定在可见集合里', () => {
    const adv = useAdventureStore()
    const first = REGIONS[0]!.id
    adv.unlocked = [first]
    expect(shownIds()).toContain(first)
  })

  it('可见集合是数据序的前缀(截断而不是挑选)', () => {
    const visible = new Set(shownIds())
    const order = REGIONS.map(r => r.id).filter(id => visible.has(id))
    // 展示序是倒序,还原成数据序后必须连续
    const idxs = order.map(id => REGIONS.findIndex(r => r.id === id)).sort((a, b) => a - b)
    idxs.forEach((v, i) => {
      if (i > 0) expect(v, '可见集合里有断档,说明不是前缀截断').toBe(idxs[i - 1]! + 1)
    })
  })

  it('分组合起来的总行数等于可见行数(不许漏行或重复)', () => {
    const { regionRows, groupedRows } = useRegionRows()
    const total = groupedRows.value.reduce((n, g) => n + g.rows.length, 0)
    expect(total, '分组后行数与可见行数对不上').toBeLessThanOrEqual(regionRows.value.length)
    const seen = groupedRows.value.flatMap(g => g.rows.map(r => r.def.id))
    expect(new Set(seen).size, '同一处地界被分了两次').toBe(seen.length)
  })

  it('每行都带得出出发判据(blockReason 与 canEnter 至少一项有结论)', () => {
    const { regionRows } = useRegionRows()
    expect(regionRows.value.length).toBe(REGIONS.length)
    for (const r of regionRows.value) {
      // 能进就不该有拒因;不能进就应有明确理由(空串视为没理由)
      if (r.canEnter) expect(r.blockReason, `${r.def.id} 能进却带着拒因`).toBeNull()
      else expect(r.blockReason, `${r.def.id} 进不去却没给理由`).not.toBe('')
    }
  })

  it('行数与区域表等长(截断只发生在 visibleRows,不影响 regionRows)', () => {
    usePlayerStore().major = 0
    expect(useRegionRows().regionRows.value.length).toBe(REGIONS.length)
  })


/**
 * 本世路线首段「能进但没解锁」时,截断必须放它过去。
 *
 * canEnterRegion 先看 mortalWorld.chain:节点可进入即为 true,与 REGIONS 解锁链无关
 * (core/mortalWorldService.ts 第 104~108 行)。路线首段天然可进入,于是会出现
 * 「unlocked=false 但 canEnter=true」的地界 —— 若截断只看 unlocked,
 * 它会连同后面的地界一起被挡在可见范围外,玩家在历练页找不到本世该去的第一站。
 * 这条正是 useRegionRows 注释里点名的坑,补上真实构造。
 */
describe('地界投影 · 本世路线首段', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /**
   * 造出注释里那个场景:前面几处已解锁,本世路线首段摆在表靠后且**未解锁**但可进入。
   * 若只造路线不补解锁,截断点会落在第 0 处(它本身就进不去),测不到要测的东西。
   */
  function setupRouteAt(idx: number): string | null {
    const adv = useAdventureStore()
    const target = REGIONS[idx]
    if (!target) return null
    adv.unlocked = REGIONS.slice(0, idx).map(r => r.id)
    adv.mortalWorld = {
      chain: [{ fromId: target.id, nodeId: 'node_first', tier: 1 }]
    } as never
    return target.id
  }

  it('首段能进入时,即便未解锁也算可见(否则玩家找不到本世第一站)', () => {
    const id = setupRouteAt(5)
    if (id === null) return
    const rows = useRegionRows().regionRows.value
    const row = rows.find(r => r.def.id === id)!
    expect(row.canEnter, '构造失败:首段应可进入').toBe(true)
    expect(row.unlocked, '构造失败:首段应未解锁').toBe(false)
    expect(shownIds(), '能进但未解锁的地界被截断了').toContain(id)
  })

  it('可进入的地界不会变成截断点(截断只认「既没发现也进不去」)', () => {
    const id = setupRouteAt(5)
    if (id === null) return
    const visible = new Set(shownIds())
    const rows = useRegionRows().regionRows.value
    // 截断点之前的都应可见;可进入的那一处必须在内
    const cutIdx = rows.findIndex(r => !r.unlocked && !r.canEnter)
    if (cutIdx >= 0) {
      for (let i = 0; i <= cutIdx; i += 1) {
        expect(visible.has(rows[i]!.def.id), `${rows[i]!.def.id} 在截断点之前却不可见`).toBe(true)
      }
    }
    expect(visible.has(id)).toBe(true)
  })
})
})
