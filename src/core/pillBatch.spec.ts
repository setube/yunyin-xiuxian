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

import { usePillBatch, craftPillBatch, pillCraftCost, salvageRatio, craftBatchPlan } from './pillService'
import { pillDef } from '@/data/pills'
import { recipeCraft } from '@/data/crafting'
import { craftability } from '@/core/craftability'
import { toNum } from '@/utils/gnum'
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

  it('必成批次:rounds/made 齐、材料恰耗 cost×N、不超扣', () => {
    mockRand = 0
    const res = useResourcesStore()
    const c = pillCraftCost(ID)!
    const g = c.grade
    res.addSmall('herb', c.herb * 5)
    res.addStone({ m: 1, e: 9 })
    const h0 = res.herbOf(g)
    const s0 = toNum(res.spiritStone)
    const out = craftPillBatch(ID, 3)
    expect(out.rounds).toBe(3)
    expect(out.made).toBeGreaterThanOrEqual(3)
    expect(res.herbOf(g), '必成全额扣草').toBe(h0 - c.herb * 3)
    expect(s0 - toNum(res.spiritStone), '必成石恰扣 cost×3').toBeCloseTo(toNum(c.stone) * 3, 6)
    expect(res.herbOf(g)).toBeGreaterThanOrEqual(0)
  })

  it('炸炉批次:rounds 照开、made0 failed3、失败也烧料(草按 salvage 保下、石照扣)、不越料不欠', () => {
    mockRand = 0.999 // 必炸
    const res = useResourcesStore()
    const c = pillCraftCost(ID)!
    const g = c.grade
    res.addSmall('herb', c.herb * 5)
    res.addStone({ m: 1, e: 9 })
    const kept = Math.floor(c.herb * salvageRatio(craftability(ID)!.skill))
    const h0 = res.herbOf(g)
    const s0 = toNum(res.spiritStone)
    const out = craftPillBatch(ID, 3)
    expect(out.rounds).toBe(3)
    expect(out.made).toBe(0)
    expect(out.failed).toBe(3)
    expect(res.herbOf(g), '炸炉也烧草,只保下 salvage 那份').toBe(h0 - (c.herb - kept) * 3)
    expect(s0 - toNum(res.spiritStone), '炸炉石照扣').toBeCloseTo(toNum(c.stone) * 3, 6)
    expect(res.herbOf(g)).toBeGreaterThanOrEqual(0) // 不欠料
  })

  it('料恰够 1 炉:连炼 5 炉就 1 炉,草到 0 干净停、石不为负', () => {
    mockRand = 0
    const res = useResourcesStore()
    const c = pillCraftCost(ID)!
    res.addSmall('herb', c.herb)
    res.addStone(c.stone)
    const out = craftPillBatch(ID, 5)
    expect(out.rounds).toBe(1)
    expect(res.herbOf(c.grade)).toBe(0)
    expect(toNum(res.spiritStone)).toBeGreaterThanOrEqual(0)
  })
})

/**
 * 炼丹计划与运行守恒(craftBatchPlan ↔ craftPillBatch)。
 *
 * craftBatchPlan 是纯计划(rounds=min(草炉数,石炉数),herb/stone=rounds×单炉成本),
 * craftPillBatch 是逐炉实跑 —— 两者在不同 spec 文件里各测各的,「计划即实耗」从没
 * 交叉断言。若计划算错(漏看石、±1),界面报的「炼满 N 炉/耗 X 料」就会与实际对不上,
 * 或实跑越料。这里确定性 mockRand=0(必成)把两者钉到一起。
 */
describe('批量炼丹 · 计划与运行守恒(craftBatchPlan ↔ craftPillBatch)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0 // 必成 —— 计划按「每炉全额烧料」预测,必成才是同一语义
    settleRewards()
    knowRecipe()
  })

  it('计划即实耗:rounds 与 herb/stone 恰为实跑消耗(预测准确)', () => {
    const res = useResourcesStore()
    const c = pillCraftCost(ID)!
    const g = c.grade
    res.addSmall('herb', c.herb * 5) // 草恰够 5 炉,石充足 → rounds 由草限
    res.addStone({ m: 1, e: 9 })
    const plan = craftBatchPlan(ID)
    expect(plan.rounds).toBeGreaterThan(0)
    const h0 = res.herbOf(g)
    const s0 = toNum(res.spiritStone)
    const out = craftPillBatch(ID, plan.rounds)
    expect(out.rounds, '实跑炉数 = 计划炉数').toBe(plan.rounds)
    expect(res.herbOf(g), '实耗草 = 计划 herb').toBe(h0 - plan.herb)
    expect(s0 - toNum(res.spiritStone), '实耗石 = 计划 stone').toBeCloseTo(toNum(plan.stone), 6)
  })

  it('计划是上限:凭草只够 plan.rounds,连炼更多不会越扣', () => {
    const res = useResourcesStore()
    const c = pillCraftCost(ID)!
    const g = c.grade
    res.addSmall('herb', c.herb * 5)
    res.addStone({ m: 1, e: 9 })
    const plan = craftBatchPlan(ID)
    const out = craftPillBatch(ID, plan.rounds + 5) // 多要 5 炉
    expect(out.rounds, '受草限制仍停在计划炉数').toBe(plan.rounds)
    expect(res.herbOf(g)).toBe(0) // 草打光,不越扣
  })
})
