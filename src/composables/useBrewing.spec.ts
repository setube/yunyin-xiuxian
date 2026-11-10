import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { recipeCraft } from '@/data/crafting'
import { pillDef } from '@/data/pills'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'
import { useLoreStore } from '@/stores/lore'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 炉前存货账:方子行报「存 N」,读 inventory.pills(与丹匣同一份账) */

import { useBrewing } from './useBrewing'

function knowRecipe(id: string): void {
  const lore = useLoreStore()
  lore.addRecipeMastery(id, 0.8)
  for (const mid of recipeCraft(pillDef(id)!)!.materials) lore.advanceLore(mid, 3)
}

function rowOf(id: string): ReturnType<typeof useBrewing>['recipes']['value'][number] {
  const row = useBrewing().recipes.value.find(r => r.def.id === id)
  if (!row) throw new Error(`方子 ${id} 不在清单里`)
  return row
}

describe('炉前存货账(存 N · 药力状态)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('存 N 读 inventory.pills:与丹匣同一份账,入包后行读数跟着变', () => {
    knowRecipe('p_ningshen')
    const inventory = useInventoryStore()
    expect(rowOf('p_ningshen').stock).toBe(0)

    inventory.addPill('p_ningshen', 3)
    expect(rowOf('p_ningshen').stock).toBe(3)
    expect(rowOf('p_ningshen').stock).toBe(inventory.pills.p_ningshen ?? 0)

    inventory.spendPill('p_ningshen')
    expect(rowOf('p_ningshen').stock).toBe(2)
  })

  it('方子行真的把存货写出来,并与丹匣读同一份账', () => {
    knowRecipe('p_ningshen')
    useInventoryStore().addPill('p_ningshen', 8)
    expect(rowOf('p_ningshen').stock).toBe(8)
    const dialog = readFileSync(join(__dirname, '../components/inventory/BrewingDialog.vue'), 'utf8')
    expect(dialog, '方子行要写出行囊存量').toContain('存 {{ r.stock }}')
  })

  /**
   * 炉级要报在弹窗上。
   *
   * 炉级与境界共同决定「哪些丹方可习得」(core/loreService 的 reachable),
   * 而方子不够炉级的根本不会出现在下面那张清单里 —— 玩家只会以为是自己没找到。
   * 弹窗此前一个字都不写炉级。
   *
   * 故障注入:把那行炉级删掉,本条红。
   */
  it('开炉弹窗报出当前炉级 —— 方子不够炉级时玩家才看得出原因', () => {
    const dialog = readFileSync(join(__dirname, '../components/inventory/BrewingDialog.vue'), 'utf8')
    expect(dialog, '弹窗应报炉级').toContain('dongfu.alchemyLevel')
    expect(dialog, '读数要带「级」,否则一串数字读不出是什么').toContain('炉 {{ dongfu.alchemyLevel }} 级')
    // 阳性对照:炉级读的是洞府 store 的那一份,不是另算一处
    expect(dialog, '应读洞府 store').toContain('useDongfuStore()')
  })
})

describe('炉前药力账(已顶 · 将顶)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('增益丹按 buffOverflowOf 报状态:顶满已顶、再服只续到顶则将顶,即时丹不误报', () => {
    const t0 = 2_000_000
    vi.setSystemTime(t0)
    knowRecipe('p_juling')
    knowRecipe('p_jvqisan')
    const cultivation = useCultivationStore()
    // 单颗一炷香(30 分):连服 16 颗正好顶到四个时辰
    for (let i = 0; i < 16; i++) cultivation.addBuff('buff_juling', t0)

    expect(rowOf('p_juling').overflow, '已到四个时辰上限').toBe('full')
    expect(rowOf('p_jvqisan').overflow, '即时丹没有药力状态').toBeNull()

    vi.setSystemTime(t0 + 900_000)
    expect(rowOf('p_juling').overflow, '余 15 分钟时再服一颗会越过上限').toBe('partial')
  })

  it('方子行真的写出两档状态,措辞与丹匣同族', () => {
    const dialog = readFileSync(join(__dirname, '../components/inventory/BrewingDialog.vue'), 'utf8')
    expect(dialog).toContain("r.overflow === 'full'")
    expect(dialog).toContain('已顶')
    expect(dialog).toContain("r.overflow === 'partial'")
    expect(dialog).toContain('将顶')
    const composable = readFileSync(join(__dirname, 'useBrewing.ts'), 'utf8')
    // 药力判据仍读游戏钟(读的是每一行自己的 buffId),药效到期后状态自己复位
    expect(composable, '药力判据读游戏钟,药效到期后状态自己复位').toContain(
      'buffOverflowOf(cultivation.buffs, row.def.buffId, now.value)'
    )
    /*
     * 静态段与时钟段必须分开 —— 两者合一的话,整条链每秒重跑一次。
     * 实测 52 方的 craftability + craftBatchPlan 合计 3.74ms/秒,
     * 而真正随时钟走的 buffOverflowOf 只有 0.018ms/秒,差 200 倍。
     */
    expect(composable, '丹方账的静态段要单独一个 computed').toContain('const recipeBase = computed(')
    expect(composable, '时钟段须从静态段派生,不重算价签与把握').toContain('recipeBase.value')
    const baseBody = composable.slice(composable.indexOf('const recipeBase = computed('), composable.indexOf('const recipes = computed('))
    expect(baseBody, '静态段里不该读 now').not.toContain('now.value')
    for (const call of ['craftability(id)', 'craftBatchPlan(id)', 'pillCraftCost(id)']) {
      expect(baseBody, `${call} 属于静态段`).toContain(call)
    }
  })
})

describe('丹方账 · 静态段不随时钟重算', () => {
  /**
   * 从前 `overflow`(读 now)与 `craftability` / `craftBatchPlan` 写在同一个 computed 里,
   * 于是时钟每跳一秒,52 方的整条链就重跑一遍 —— 实测 craftability + craftBatchPlan
   * 合计 **3.74ms/秒**,而其中真正随时钟走的只有 buffOverflowOf 的 **0.018ms/秒**,差 200 倍。
   * 背包页(装备/材料/法宝签根本不读丹方)也照付这笔钱。
   *
   * 判据落在**源码分层**,不落在读数:两边读数一模一样,重算与否读不出来。
   * 试过用引用身份判(推进系统时间再比 `able` 是不是同一份)——**判据无效**:
   * computed 只在响应式依赖变化时才重算,而推系统时间并不 tick `now` 这个 ref,
   * 合回同一个 computed 后那条照样绿。故只留能红的两条。
   *
   * 故障注入:把两段合回一个 computed,下面两条当场红(实测)。
   */
  it('静态段自己是一个 computed,起止可辨', () => {
    const composable = readFileSync(join(__dirname, 'useBrewing.ts'), 'utf8')
    expect(composable, '丹方账的静态段要单独一个 computed').toContain('const recipeBase = computed(')
    expect(composable, '时钟段从静态段派生').toContain('recipeBase.value')
  })

  it('静态段不读 now,也不让时钟段重算价签与把握', () => {
    const composable = readFileSync(join(__dirname, 'useBrewing.ts'), 'utf8')
    const baseBody = composable.slice(
      composable.indexOf('const recipeBase = computed('),
      composable.indexOf('const recipes = computed(')
    )
    expect(baseBody, '静态段的起止没找到,判据空转').not.toBe('')
    expect(baseBody, '静态段里不该读 now —— 读了就每秒重算整条链').not.toContain('now.value')
    for (const call of ['craftability(id)', 'craftBatchPlan(id)', 'pillCraftCost(id)']) {
      expect(baseBody, `${call} 属于静态段`).toContain(call)
    }
  })
})

describe('丹药签圆点只读静态段', () => {
  /**
   * 背包页四个签共用同一个 `useBrewing()`,而圆点只需要「有没有能开炉的方子」——
   * 那由价签与批量计划决定(静态段)。从前它读 `recipes`(含每秒变的药力状态),
   * 于是装备/材料/法宝三签也陪着时钟把 52 方的整条链重算一遍。
   */
  it('anyCraftable 从 recipeBase 派生,不碰 recipes', () => {
    const composable = readFileSync(join(__dirname, 'useBrewing.ts'), 'utf8')
    expect(composable, '要单独给一个静态圆点判据').toContain('const anyCraftable = computed(')
    const start = composable.indexOf('const anyCraftable = computed(')
    const body = composable.slice(start, start + 200)
    expect(body, 'anyCraftable 该读静态段').toContain('recipeBase.value')
    expect(body, 'anyCraftable 不该读时钟段').not.toContain('recipes.value')
  })

  it('背包页的页签圆点读 anyCraftable,不自己重算一遍', () => {
    const view = readFileSync(join(__dirname, '../views/InventoryView.vue'), 'utf8')
    expect(view, '圆点该读 anyCraftable').toContain('dot: anyCraftable.value')
    expect(view, '别再在模板算一遍 plan.rounds').not.toContain('recipes.value.some(r => r.plan.rounds > 0)')
  })
})
