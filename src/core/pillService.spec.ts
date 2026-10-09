/**
 * 炼丹与服丹 —— 端到端判据(材料 → 开炉 → 入包 / 赔料 → 服下 → 生效)
 *
 * 这是核心功能里此前唯一**没有任何判据**的一条:craftPill / usePill 只在别的 spec 里
 * 被间接带到过,而它们各自管着两件玩家必然经历的事:
 *   · 开炉:报价即实收(灵石与灵草照扣)、失手要赔料但长本事、成功才入包;
 *   · 服丹:丹从包里出去,药力必须真的落到修为/灵气/状态上。
 *
 * 随机源用固定返回钉住(0 → 概率判定都成;0.999 → 都不成),成败不掷运气 ——
 * 这样「报的数」与「真的扣的数」才能逐位对账。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/** rng 的固定返回:0 → 所有概率判定都成;0.999 → 都不成 */
let mockRand = 0
vi.mock('@/utils/random', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/random')>()
  return { ...mod, rng: new mod.RandomService(() => mockRand) }
})

import { craftBatchPlan, craftPill, pillCraftCost, salvageRatio, usePill } from './pillService'
import { craftability } from './craftability'
import { pillDef } from '@/data/pills'
import { PILLS } from '@/data/pills'
import { maxTierForMajor } from '@/data/regions'
import { MAX_MAJOR } from '@/data/realms'
import { recipeCraft } from '@/data/crafting'
import { stoneByTier } from './formulas'
import { expRequirement } from './formulas'
import { INSTANT_EXP_LAYER_CAP } from '@/data/constants'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useLoreStore } from '@/stores/lore'
import { usePlayerStore } from '@/stores/player'
import { useCultivationStore } from '@/stores/cultivation'
import { useQuestsStore } from '@/stores/quests'
import { mulN, toNum } from '@/utils/gnum'
import { ACHIEVEMENTS } from '@/data/achievements'
import { MAIN_QUESTS } from '@/data/quests'

/** 一炉回灵丹:最低阶、有方、材料便宜 —— 端到端要跑的就是这种最普通的路径 */
const ID = 'p_huichun'

/**
 * 把成就与主线的一次性赏钱结清。
 *
 * 不结清的话,新档的第一次 track() 会顺手发掉「初窥仙途」那 24 灵石 ——
 * 混进差额里就分不清「开炉扣了多少」与「成就赏了多少」。赏钱本身有别的判据管,
 * 这里只要一条干净的账。
 */
function settleRewards(): void {
  const quests = useQuestsStore()
  quests.$patch({ achieved: ACHIEVEMENTS.map(a => a.id), mainIdx: MAIN_QUESTS.length - 1 })
}

/** 把玩家的阅历拉到「知道这张方子、方中灵材也认得」的一档 */
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

describe('炼丹 · 开炉前的两道门', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
    settleRewards()
  })

  it('不知此方:不开炉,且分毫不取', () => {
    giveMaterials()
    const resources = useResourcesStore()
    const stone = toNum(resources.spiritStone)
    const out = craftPill(ID)
    expect(out.aborted, '不知方子却开了炉').toBe(true)
    expect(out.count).toBe(0)
    expect(toNum(resources.spiritStone)).toBe(stone)
    expect(resources.herb).toBe(400)
  })

  it('材料不足:不开炉,也不留下任何痕迹', () => {
    knowRecipe()
    const resources = useResourcesStore()
    resources.addSmall('herb', -resources.herb + 1)
    resources.$patch({ spiritStone: { m: 1, e: 2 } })
    const out = craftPill(ID)
    expect(out.aborted).toBe(true)
    expect(resources.herb, '不开炉就不该动材料').toBe(1)
    expect(useInventoryStore().pills[ID] ?? 0).toBe(0)
    expect(useQuestsStore().counter('pillsFailed')).toBe(0)
  })

  it('报价即实收:界面上的成本与真正扣掉的数逐位相等', () => {
    knowRecipe()
    giveMaterials()
    const resources = useResourcesStore()
    const cost = pillCraftCost(ID)!
    const stoneBefore = toNum(resources.spiritStone)
    const herbBefore = resources.herb
    // 灵石走 spy 对账:成丹会顺带触发成就/任务,那笔赏钱是另一回事,
    // 混进差额里就分不清「扣了多少」与「赏了多少」
    const spend = vi.spyOn(resources, 'spendStone')
    craftPill(ID)
    expect(spend, '开炉没有按报价扣灵石').toHaveBeenCalledWith(cost.stone)
    expect(stoneBefore - toNum(resources.spiritStone), '灵石扣少了或扣多了').toBeCloseTo(toNum(cost.stone), 3)
    expect(herbBefore - resources.herb).toBe(cost.herb)
    // 成本口径本身:灵草按方子,灵石按**这张方子准入境界能到的最高层级**折价
    expect(cost.herb).toBe(pillDef(ID)!.recipe!.herb)
    expect(toNum(cost.stone)).toBeCloseTo(
      toNum(stoneByTier(maxTierForMajor(pillDef(ID)!.minRealm), pillDef(ID)!.recipe!.stoneBase / 10)),
      6
    )
  })

  /**
   * 层级只有一个事实源(ISS-211):丹方灵石价从前自写 `minRealm × 2 + 1`,
   * 界外就飞出区域表了 —— 第 18 境的方子算层级 37,而玩家在混沌海最高只能到 32,
   * 一张方子凭空贵 322 倍,炼丹被自己的报价挡在门外。现在按区域表取。
   */
  it('丹方灵石价按区域表取层级 —— 不超过玩家能到的最高层级', () => {
    const recipes = PILLS.filter(p => p.recipe)
    expect(recipes.length).toBeGreaterThan(0)
    for (const p of recipes) {
      const tier = maxTierForMajor(p.minRealm)
      expect(tier, `${p.name} 的计价层级超过了它准入境界的上限`).toBeLessThanOrEqual(maxTierForMajor(MAX_MAJOR))
      // 与 pillCraftCost 的实际报价一致(报价即实收那条判据的另一面)
      const cost = pillCraftCost(p.id)!
      expect(toNum(cost.stone)).toBeCloseTo(toNum(stoneByTier(tier, p.recipe!.stoneBase / 10)), 6)
    }
  })
})

describe('炼丹 · 成与败各自的账', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    settleRewards()
  })

  it('丹成:入包、技艺见长、账目记上,材料照方子用尽', () => {
    mockRand = 0
    knowRecipe()
    giveMaterials()
    const inventory = useInventoryStore()
    const lore = useLoreStore()
    const skills = Object.keys(recipeCraft(pillDef(ID)!)!.skills)
    const before = skills.map(s => lore.expOf(s as never))

    const out = craftPill(ID)
    expect(out.ok).toBe(true)
    // mockRand=0 时连「多得一枚」也必成 —— 出丹数就是 2
    expect(out.count).toBe(2)
    expect(inventory.pills[ID]).toBe(2)
    expect(useQuestsStore().counter('pillsCrafted')).toBe(2)
    const after = skills.map(s => lore.expOf(s as never))
    for (let i = 0; i < skills.length; i += 1) {
      expect(after[i], `技艺 ${skills[i]} 没长`).toBeGreaterThan(before[i]!)
    }
    // 开炉过手,方中灵材就算「见过」——这是认知线的起点
    for (const mid of recipeCraft(pillDef(ID)!)!.materials) {
      expect(lore.seenOf(mid), '用过的灵材该留下见过的记录').toBeGreaterThan(0)
    }
  })

  it('失手:灵石照扣、灵草按技艺保下一部分、技艺照长、丹不入包', () => {
    mockRand = 0.999
    knowRecipe(0.8)
    giveMaterials()
    const resources = useResourcesStore()
    const inventory = useInventoryStore()
    const lore = useLoreStore()
    const cost = pillCraftCost(ID)!
    const skills = Object.keys(recipeCraft(pillDef(ID)!)!.skills)
    const skillBefore = skills.map(s => lore.expOf(s as never))
    const herbBefore = resources.herb
    const stoneBefore = toNum(resources.spiritStone)
    const mastery = lore.recipeMastery(ID)
    const spend = vi.spyOn(resources, 'spendStone')

    const out = craftPill(ID)
    expect(out.ok).toBe(false)
    expect(out.count).toBe(0)
    expect(inventory.pills[ID] ?? 0, '炸炉了还入包').toBe(0)
    // 灵石一分不退(开了炉就是要烧的)—— 按报价扣,顺带的成就赏钱另算
    expect(spend, '炸炉也该按报价扣灵石').toHaveBeenCalledWith(cost.stone)
    // 灵石一分不退(开了炉就是要烧的)
    expect(stoneBefore - toNum(resources.spiritStone), '炸炉了灵石反倒没少').toBeCloseTo(toNum(cost.stone), 3)
    // 灵草按技艺保下一部分 —— 保下的比例是公开口径(salvageRatio),两处同源
    const kept = Math.floor(cost.herb * salvageRatio(craftability(ID)!.skill))
    expect(herbBefore - resources.herb).toBe(cost.herb - kept)
    // 炸炉也长本事(比成功慢),而且这张方子反而更熟了一点
    for (let i = 0; i < skills.length; i += 1) {
      expect(lore.expOf(skills[i] as never), `失手也该长技艺 ${skills[i]}`).toBeGreaterThan(skillBefore[i]!)
    }
    expect(lore.recipeMastery(ID)).toBeGreaterThan(mastery)
    expect(useQuestsStore().counter('pillsFailed')).toBe(1)
  })

  it('技艺越高,失手时赔得越少(同一炉料,同一掷点)', () => {
    mockRand = 0.999
    knowRecipe()
    giveMaterials()
    const resources = useResourcesStore()
    const lore = useLoreStore()
    const cost = pillCraftCost(ID)!
    const herb0 = resources.herb
    craftPill(ID)
    const lostByNovice = herb0 - resources.herb
    // 把方中技艺拉满,再开一炉同样的料
    for (const s of Object.keys(recipeCraft(pillDef(ID)!)!.skills)) lore.addSkillExp(s as never, 600)
    resources.addSmall('herb', 400)
    const herb1 = resources.herb
    craftPill(ID)
    const lostByMaster = herb1 - resources.herb
    expect(cost.herb, '这一炉本该全赔才说明差异').toBeGreaterThan(0)
    expect(lostByMaster, '熟练了反而赔得更多').toBeLessThan(lostByNovice)
  })

  it('出丹数如实对账:报几枚就入包几枚', () => {
    mockRand = 0
    knowRecipe()
    giveMaterials()
    const counts: number[] = []
    for (let i = 0; i < 3; i += 1) {
      const inv = useInventoryStore()
      const before = inv.pills[ID] ?? 0
      const out = craftPill(ID)
      counts.push(out.count)
      expect((inv.pills[ID] ?? 0) - before, '报的枚数与入包的枚数对不上').toBe(out.count)
    }
    expect(counts.every(c => c >= 1)).toBe(true)
  })
})

describe('服丹 · 丹从包里出去,药力真的落下', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
    settleRewards()
  })

  it('包里没有这味丹:服不了,也不该有任何副作用', () => {
    const player = usePlayerStore()
    const before = toNum(player.exp)
    expect(usePill(ID)).toBe(false)
    expect(toNum(player.exp)).toBe(before)
  })

  it('即时丹:五成灵气要落在灵气上,丹要出包', () => {
    const inventory = useInventoryStore()
    const resources = useResourcesStore()
    const player = usePlayerStore()
    player.$patch({ major: 3, sub: 2 })
    inventory.addPill(ID, 2)
    const cap = player.qiCapValue
    resources.$patch({ qi: 0 })

    expect(usePill(ID)).toBe(true)
    expect(inventory.pills[ID], '服下之后包里该少一枚').toBe(1)
    expect(resources.qi, `五成灵气该落在灵气上(容量 ${cap})`).toBeGreaterThan(cap * 0.4)
    expect(useQuestsStore().counter('pillsUsed')).toBe(1)
  })

  it('修为丹:修为精进落在修为上,而不是只在提示条里', () => {
    const inventory = useInventoryStore()
    const player = usePlayerStore()
    player.$patch({ major: 2, sub: 1, exp: { m: 0, e: 0 } })
    inventory.addPill('p_jvqidan', 1)
    const before = toNum(player.exp)
    expect(usePill('p_jvqidan')).toBe(true)
    expect(toNum(player.exp) - before).toBeCloseTo(80, 3)
  })

  /**
   * Phase 39:修为丹从「当前需求的百分比」改成「一段等效闭关时长」。
   *
   * 这条守的正是那次改动的两个后果,缺一不可:
   *   ① 单枚丹**永远填不满一层** —— 低境界一层只要刻把钟,不封顶的话
   *      一枚写在纸上的"闭关一个半时辰"能连跳好几层;
   *   ② 药力不随境界暴涨 —— 一枚金丹期的丹在混沌海只该是一点药力,
   *      旧口径下它按"当前一层需求的百分比"结算,在任何境界都同样能顶掉一块墙,
   *      于是囤低阶丹成了破界的最优解。
   */
  it('修为丹按等效闭关时长结算:单枚不满一层,且不随境界暴涨', () => {
    const gainAt = (major: number, sub: number): { gain: number; req: number } => {
      setActivePinia(createPinia())
      const player = usePlayerStore()
      const inventory = useInventoryStore()
      player.$patch({ major, sub, exp: { m: 0, e: 0 } })
      inventory.addPill('p_xuanyuan', 1)
      const before = toNum(player.exp)
      expect(usePill('p_xuanyuan')).toBe(true)
      return { gain: toNum(player.exp) - before, req: toNum(expRequirement(major, sub)) }
    }
    const low = gainAt(2, 5)
    const high = gainAt(8, 5)
    expect(low.gain / low.req).toBeLessThanOrEqual(INSTANT_EXP_LAYER_CAP + 1e-9)
    expect(low.gain, '单枚丹把整层填满了 —— 低境界那一层只要几十秒,这条一破就是连跳几层').toBeLessThan(low.req)
    // 高境界:同一枚丹只占那一层千分之几(旧口径下它在任何境界都占同样的百分比)
    expect(high.gain / high.req).toBeLessThan(0.002)
    expect(high.gain / high.req, '在高境界反而更值钱 —— 按需求百分比的旧口径又回来了').toBeLessThanOrEqual(
      low.gain / low.req
    )
  })

  it('增益丹:状态真的加到身上(带到期时间),不是只弹一句话', () => {
    const inventory = useInventoryStore()
    const cultivation = useCultivationStore()
    inventory.addPill('p_ningshen', 1)
    expect(usePill('p_ningshen')).toBe(true)
    const buffs = cultivation.buffs.filter(b => b.defId === pillDef('p_ningshen')!.buffId)
    expect(buffs.length, '丹说的状态没落到身上').toBe(1)
    expect(buffs[0]!.endsAt, '状态没有到期时间,等于永久').toBeGreaterThan(Date.now())
  })

  it('修为丹到顶 clamp:等效闭关远超一层时,药力封顶在「不满一层」,不按 cultPerSec×secs 白给', () => {
    // 低境界一层只要刻把钟,配 10800s 的大修为丹(太初丹)必然溢出 —— 走真实 usePill 路径
    const player = usePlayerStore()
    const inventory = useInventoryStore()
    const cultivation = useCultivationStore()
    player.$patch({ major: 2, sub: 5, exp: { m: 0, e: 0 } })
    cultivation.addBuff('buff_juling', Date.now()) // 修速 +50%,把 cultPerSec 顶到必然溢出
    inventory.addPill('p_taichu', 1)
    const req = toNum(expRequirement(2, 5))
    const before = toNum(player.exp)
    expect(usePill('p_taichu')).toBe(true)
    const gain = toNum(player.exp) - before
    // 封顶在「不满一层」= expReq × INSTANT_EXP_LAYER_CAP,而非 cultPerSec×10800
    expect(gain).toBeCloseTo(req * INSTANT_EXP_LAYER_CAP, 3)
    expect(gain, '整层填满 —— clamp 失效').toBeLessThan(req)
    expect(Number.isFinite(gain)).toBe(true)
    expect(inventory.pills['p_taichu'] ?? 0, '服下该出包').toBe(0)
  })

  it('正对照:低药效丹在高境界远不满一层 —— 不封顶(证明 clamp 不是每颗都截)', () => {
    const player = usePlayerStore()
    const inventory = useInventoryStore()
    player.$patch({ major: 8, sub: 5, exp: { m: 0, e: 0 } })
    inventory.addPill('p_xuanyuan', 1) // 玄元丹 expSecs=900,高境界一层极大
    const req = toNum(expRequirement(8, 5))
    const before = toNum(player.exp)
    expect(usePill('p_xuanyuan')).toBe(true)
    const gain = toNum(player.exp) - before
    expect(Number.isFinite(gain) && gain > 0).toBe(true)
    expect(gain, '正对照不该被 clamp(它本来就远不满一层)').toBeLessThan(req * INSTANT_EXP_LAYER_CAP)
  })
})

describe('炼丹连开计划 craftBatchPlan —— 纯算不动炉,按料保底算清能开几炉', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
    settleRewards()
  })

  it('未知此方:rounds=0 且说明掌握不足,材料分文未动', () => {
    const resources = useResourcesStore()
    resources.addSmall('herb', 400)
    resources.addStone({ m: 1, e: 9 })
    const plan = craftBatchPlan(ID)
    expect(plan.rounds).toBe(0)
    expect(plan.blocked).toBeTruthy()
    expect(resources.herb).toBe(400)
  })

  it('料足时 rounds=灵草口径与灵石口径的较小者,总账=每炉成本 × rounds', () => {
    knowRecipe()
    const cost = pillCraftCost(ID)!
    const resources = useResourcesStore()
    // 灵草足开 7 炉,灵石只够 3 炉 → 计划停在 3
    resources.addSmall('herb', cost.herb * 7)
    resources.addStone(mulN(cost.stone, 3))
    const plan = craftBatchPlan(ID)
    expect(plan.rounds).toBe(3)
    expect(plan.herb).toBe(cost.herb * 3)
    expect(plan.stone).toEqual(mulN(cost.stone, 3))
    expect(plan.blocked).toBeUndefined()
  })

  it('灵草是短板的另一侧:灵石富余、草只够 4 炉 → rounds=4', () => {
    knowRecipe()
    const cost = pillCraftCost(ID)!
    const resources = useResourcesStore()
    resources.addSmall('herb', cost.herb * 4)
    resources.addStone({ m: 1, e: 9 })
    const plan = craftBatchPlan(ID)
    expect(plan.rounds).toBe(4)
  })

  it('一份料都没有:rounds=0 且 blocked 是「料不足」,把话说明白', () => {
    knowRecipe()
    const plan = craftBatchPlan(ID)
    expect(plan.rounds).toBe(0)
    expect(plan.blocked).toContain('灵草或灵石未足')
  })

  it('纯未知的方子 id:报「不知此方」而非「料不足」—— 掌握问题与材料问题分得开', () => {
    const plan = craftBatchPlan('p__并_不_存_在__xyz')
    expect(plan.rounds).toBe(0)
    expect(plan.blocked).toContain('不知此方')
    expect(plan.blocked).not.toContain('灵草')
  })

  it('计划绝不动材料 —— 调多少次,资源原样', () => {
    knowRecipe()
    const cost = pillCraftCost(ID)!
    const resources = useResourcesStore()
    resources.addSmall('herb', cost.herb * 6)
    resources.addStone(mulN(cost.stone, 6))
    const beforeHerb = resources.herb
    const beforeStone = resources.spiritStone
    craftBatchPlan(ID)
    craftBatchPlan(ID)
    expect(resources.herb).toBe(beforeHerb)
    expect(resources.spiritStone).toEqual(beforeStone)
  })
})

describe('炸炉保残料比 · salvageRatio 自身边界(去自证)', () => {
  it('闲手(技艺 0):恰按基准 0.2 保料', () => {
    expect(salvageRatio(0)).toBe(0.2)
  })

  it('技艺 100:到顶 0.5(基准 + 满档 0.3)', () => {
    expect(salvageRatio(100)).toBe(0.5)
  })

  it('技艺 200(超满):被夹回 0.5,不上浮(否则保料比该门手艺失控)', () => {
    expect(salvageRatio(200)).toBe(0.5)
    expect(salvageRatio(1000)).toBe(0.5) // 大幅超限同样不越 0.5
  })

  it('技艺 50:线性中段 0.35(基准 + 半档 0.15)', () => {
    expect(salvageRatio(50)).toBeCloseTo(0.35, 10)
  })
})
