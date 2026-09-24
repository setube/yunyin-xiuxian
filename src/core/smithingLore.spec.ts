/**
 * 炼器的矿石认知与锻造技艺(玩家反馈:「识材部分矿物无法达到通晓」
 * 「大量强化装备或重铸却看不见熟练度提升」)。
 *
 * 根因:通晓(第 3 层)只由 noteMaterialUsed 可达,而它此前只在炼丹路径被调;
 * 炼器(强化/重铸)从不登记 —— 矿石永远卡在 2 层,锻造技艺也原地踏步。
 * 修法:noteSmithingUsed —— 每次炼器算「上手过」一味与装备层级相称的矿石,
 * 判据与丹药同源;并按次给 smithing 技艺经验。这里钉死:
 * 1) 炼器之后锻造技艺确实在涨(看得见的熟练度);
 * 2) 层 2 的矿石经炼器能爬到通晓(层 3)。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLoreStore } from '@/stores/lore'
import { useInventoryStore } from '@/stores/inventory'
import { useResourcesStore } from '@/stores/resources'
import { upgradeEquipment } from './forge'
import { noteSmithingUsed } from './loreService'
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
    lore.advanceLore('mat_jingtie', 1) // 只在层 1:还谈不上"通用"
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
