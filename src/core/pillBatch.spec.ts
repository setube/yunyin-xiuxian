/**
 * 批量服丹 / 批量炼丹(玩家反馈:「批量吃丹,批量炼丹」)。
 *
 * 高界玩家的丹匣动辄成百上千枚,逐枚点按与逐炉开炼都很废手指 ——
 * 批量只是把「点 N 下」合成「点 1 下」,结果与连点完全一致:
 * 逐枚结算(修为/状态/计数/破题照旧),只把提示合为一条。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/** rng 固定返回 0 → 概率判定全成 */
let mockRand = 0
vi.mock('@/utils/random', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/random')>()
  return { ...mod, rng: new mod.RandomService(() => mockRand) }
})

import { usePillBatch, craftPillBatch, pillCraftCost } from './pillService'
import { pillDef } from '@/data/pills'
import { recipeCraft } from '@/data/crafting'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useLoreStore } from '@/stores/lore'
import { useQuestsStore } from '@/stores/quests'
import { ACHIEVEMENTS } from '@/data/achievements'
import { MAIN_QUESTS } from '@/data/quests'

/** 最低阶回春丹:有方、材料便宜 —— 与 pillService.spec 同一条最普通的路径 */
const ID = 'p_huichun'

/** 结清成就/主线一次性赏钱,免得开炉的差账被赏钱搅浑 */
function settleRewards(): void {
  const quests = useQuestsStore()
  quests.$patch({ achieved: ACHIEVEMENTS.map(a => a.id), mainIdx: MAIN_QUESTS.length - 1 })
}

/** 让玩家「认得方子、认得灵材」,才炼得动 */
function knowRecipe(mastery = 0.8): void {
  const lore = useLoreStore()
  lore.addRecipeMastery(ID, mastery)
  for (const mid of recipeCraft(pillDef(ID)!)!.materials) {
    lore.advanceLore(mid, 3)
  }
}

function giveMaterials(): void {
  const resources = useResourcesStore()
  resources.addSmall('herb', 400)
  resources.addStone({ m: 1, e: 9 })
}

describe('批量服丹', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
  })

  it('存量足够:按量连服,与逐枚点按结果一致', () => {
    useInventoryStore().addPill(ID, 8)
    const eaten = usePillBatch(ID, 5)
    expect(eaten).toBe(5)
    expect(useInventoryStore().pills[ID]).toBe(3)
  })

  it('存量不足:吃到没有就停,不报错不溢出', () => {
    useInventoryStore().addPill(ID, 3)
    const eaten = usePillBatch(ID, 10)
    expect(eaten).toBe(3)
    expect(useInventoryStore().pills[ID] ?? 0).toBe(0)
  })

  it('一枚都没有:返回 0', () => {
    expect(usePillBatch(ID, 5)).toBe(0)
  })

  it('要求 0 枚:一枚也不动(不借单次路径偷吃)', () => {
    const inv = useInventoryStore()
    inv.addPill(ID, 3)
    expect(usePillBatch(ID, 0), '0 枚不应消耗任何丹药').toBe(0)
    expect(inv.pills[ID]).toBe(3)
    expect(usePillBatch(ID, -1), '负数同样不可消耗').toBe(0)
    expect(inv.pills[ID]).toBe(3)
  })
})

describe('批量炼丹', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
    settleRewards()
    knowRecipe()
  })

  it('材料足够且必成:连炼 N 炉,成丹入囊', () => {
    giveMaterials()
    const res = craftPillBatch(ID, 3)
    expect(res.rounds).toBe(3)
    expect(res.failed).toBe(0)
    expect(res.made).toBeGreaterThanOrEqual(3)
    expect(useInventoryStore().pills[ID]).toBeGreaterThanOrEqual(3)
  })

  it('材料只够一炉:连炼 5 炉就炼 1 炉,不多扣料', () => {
    const cost = pillCraftCost(ID)!
    useResourcesStore().addSmall('herb', cost.herb)
    useResourcesStore().addStone(cost.stone)
    const res = craftPillBatch(ID, 5)
    expect(res.rounds, '材料见底就停,不空转').toBe(1)
    expect(useResourcesStore().herb).toBe(0)
  })

  it('要求 0 炉:一炉也不开(不借单次路径偷炼)', () => {
    giveMaterials()
    expect(craftPillBatch(ID, 0)).toEqual({ rounds: 0, made: 0, failed: 0 })
    expect(useResourcesStore().herb, '材料不应被扣').toBe(400)
    expect(craftPillBatch(ID, -1)).toEqual({ rounds: 0, made: 0, failed: 0 })
    expect(useResourcesStore().herb, '负数同样不扣材料').toBe(400)
  })
})
