/**
 * 炼器的矿石认知与锻造技艺:通晓(第 3 层)只由 noteMaterialUsed 可达。
 * 炼器经 noteSmithingUsed 每次算「上手过」一味与装备层级相称的矿石(判据与丹药同源),并按次给 smithing 技艺经验。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLoreStore } from '@/stores/lore'
import { useInventoryStore } from '@/stores/inventory'
import { useResourcesStore } from '@/stores/resources'
import { upgradeEquipment } from './forge'
import { noteMaterialUsed, noteSmithingUsed } from './loreService'
import { LORE_MAX } from '@/data/materials'
import { gn } from '@/utils/gnum'

/** rng.pick 恒取池中第一件(精铁),chance 可控(通晓判定) */
const masteryHit = vi.hoisted(() => ({ value: true }))
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
      chance: (): boolean => masteryHit.value
    }
  }
})

describe('炼器 · 矿石认知与锻造技艺', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    masteryHit.value = true
  })

  it('炼器会涨锻造技艺 —— 熟练度看得见地升', () => {
    const lore = useLoreStore()
    const before = lore.skillLevel('smithing')
    noteSmithingUsed(6, true)
    expect(lore.skillLevel('smithing'), 'smithing 技艺应增加').toBeGreaterThan(before)
  })

  it('层 2 的矿石经炼器能爬到通晓(层 3)', () => {
    const lore = useLoreStore()
    // pool 第一件是 rank 最低的精铁(mat_jingtie)
    lore.advanceLore('mat_jingtie', 2)
    expect(lore.loreOf('mat_jingtie')).toBe(2)
    noteSmithingUsed(3, true) // tier 3 → 取 rank≈2 的矿石
    expect(lore.loreOf('mat_jingtie'), '上手过就该通晓').toBe(LORE_MAX)
  })

  it('不达通晓判据(层不足/运气差)就不强推 —— 但技艺仍涨', () => {
    const lore = useLoreStore()
    lore.advanceLore('mat_jingtie', 1) // 只在层 1
    masteryHit.value = false
    const before = lore.skillLevel('smithing')
    noteSmithingUsed(3, true)
    expect(lore.loreOf('mat_jingtie'), '层不足不硬推到通晓').toBe(1)
    expect(lore.skillLevel('smithing'), '技艺照涨,与通晓判断无关').toBeGreaterThan(before)
  })

  it('端到端:每次强化都会记一头矿 —— 强化后技艺涨', () => {
    const inv = useInventoryStore()
    const res = useResourcesStore()
    const lore = useLoreStore()
    res.addSmall('dust', 10_000)
    res.addStone(gn(1e12))
    inv.items = [{ uid: 's1', templateId: 'w_hanfeng', quality: 'heaven', tier: 4, level: 0, affixes: [] }]
    const before = lore.skillLevel('smithing')
    expect(upgradeEquipment('s1'), '强化应成功(素材给足)').toBe(true)
    expect(lore.skillLevel('smithing')).toBeGreaterThan(before)
  })
})

describe('炼器 · 未知材料 id', () => {
  // 文件顶层的 beforeEach 在别的 describe 里;新开的块要自己装,否则单独 -t 跑会崩
  beforeEach(() => setActivePinia(createPinia()))

  it('给不存在于材料表的 id 记账:什么也不做,不写 lore、不抛错', () => {
    /*
     * `if (!def) return` 是真守卫:去掉后 lore.markSeen(id) 会把一个材料表里没有的 id
     * 写进 materialLore/materialSeen,后续读它的人拿到 undefined 定义。
     * 这条路径来自旧档(材料表改过名)或手改存档。
     */
    const lore = useLoreStore()
    const seenBefore = JSON.stringify(lore.materialSeen)
    const loreBefore = JSON.stringify(lore.materialLore)

    expect(() => noteMaterialUsed('no_such_material', true)).not.toThrow()

    expect(JSON.stringify(lore.materialSeen), '未知 id 不该被记进已见表').toBe(seenBefore)
    expect(JSON.stringify(lore.materialLore), '未知 id 不该被记进认知表').toBe(loreBefore)
  })
})
