/** 炼丹与服丹 —— 端到端判据(材料 → 开炉 → 入包 / 赔料 → 服下 → 生效) */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** rng 的固定返回:0 → 所有概率判定都成;0.999 → 都不成 */
let mockRand = 0
vi.mock('@/utils/random', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/random')>()
  return { ...mod, rng: new mod.RandomService(() => mockRand) }
})

import { craftBatchPlan, craftPill, craftShortfall, pillCraftCost, salvageRatio, usePill } from './pillService'
import { rng } from '@/utils/random'
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
import { useDongfuStore } from '@/stores/dongfu'
import { mulN, toNum } from '@/utils/gnum'
import { ACHIEVEMENTS } from '@/data/achievements'
import { useUiStore } from '@/stores/ui'
import { qualityDef } from '@/data/qualities'
import { MAIN_QUESTS } from '@/data/quests'

/** 最低阶、有方、材料便宜的最普通路径 */
const ID = 'p_huichun'

/** 结清成就与主线的一次性赏钱:否则新档首次 track() 发「初窥仙途」24 灵石,混进开炉差额 */
function settleRewards(): void {
  const quests = useQuestsStore()
  quests.$patch({ achieved: ACHIEVEMENTS.map(a => a.id), mainIdx: MAIN_QUESTS.length - 1 })
}

/** 阅历拉到知此方、识方中灵材 */
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
    // 灵石走 spy 对账:成丹会顺带触发成就/任务赏钱
    const spend = vi.spyOn(resources, 'spendStone')
    craftPill(ID)
    expect(spend, '开炉没有按报价扣灵石').toHaveBeenCalledWith(cost.stone)
    expect(stoneBefore - toNum(resources.spiritStone), '灵石扣少了或扣多了').toBeCloseTo(toNum(cost.stone), 3)
    expect(herbBefore - resources.herb).toBe(cost.herb)
    // 成本口径:灵草按方子,灵石按方子准入境界能到的最高层级折价
    expect(cost.herb).toBe(pillDef(ID)!.recipe!.herb)
    expect(toNum(cost.stone)).toBeCloseTo(
      toNum(stoneByTier(maxTierForMajor(pillDef(ID)!.minRealm), pillDef(ID)!.recipe!.stoneBase / 10)),
      6
    )
  })

  /** 层级单一事实源为区域表;自写 `minRealm × 2 + 1` 会越出区域表 */
  it('丹方灵石价按区域表取层级 —— 不超过玩家能到的最高层级', () => {
    const recipes = PILLS.filter(p => p.recipe)
    expect(recipes.length).toBeGreaterThan(0)
    for (const p of recipes) {
      const tier = maxTierForMajor(p.minRealm)
      expect(tier, `${p.name} 的计价层级超过了它准入境界的上限`).toBeLessThanOrEqual(maxTierForMajor(MAX_MAJOR))
      // 与 pillCraftCost 实际报价一致
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
    // mockRand=0 时「多得一枚」也必成
    expect(out.count).toBe(2)
    expect(inventory.pills[ID]).toBe(2)
    expect(useQuestsStore().counter('pillsCrafted')).toBe(2)
    const after = skills.map(s => lore.expOf(s as never))
    for (let i = 0; i < skills.length; i += 1) {
      expect(after[i], `技艺 ${skills[i]} 没长`).toBeGreaterThan(before[i]!)
    }
    // 开炉过手,方中灵材即算「见过」
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
    // 灵石按报价扣、一分不退;顺带的成就赏钱另算
    expect(spend, '炸炉也该按报价扣灵石').toHaveBeenCalledWith(cost.stone)
    expect(stoneBefore - toNum(resources.spiritStone), '炸炉了灵石反倒没少').toBeCloseTo(toNum(cost.stone), 3)
    // 灵草保下比例走公开口径 salvageRatio,两处同源
    const kept = Math.floor(cost.herb * salvageRatio(craftability(ID)!.skill))
    expect(herbBefore - resources.herb).toBe(cost.herb - kept)
    // 炸炉也长本事(比成功慢),方子更熟
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
    // 技艺拉满,再开一炉同样的料
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
   * 修为丹按等效闭关时长结算,不按当前需求的百分比:
   *   ① 单枚丹永远填不满一层;② 药力不随境界暴涨(按百分比则囤低阶丹成破界最优解)。
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
    // 高境界:同一枚丹只占那一层千分之几
    expect(high.gain / high.req).toBeLessThan(0.002)
    expect(high.gain / high.req, '在高境界反而更值钱 —— 按需求百分比的旧口径又回来了').toBeLessThanOrEqual(
      low.gain / low.req
    )
  })

  it('expFixed 入门丹同样封顶不满一层(与 expSecs 同一把尺)', () => {
    // 聚气丹 expFixed=80,炼气一层需求只几十
    const player = usePlayerStore()
    const inventory = useInventoryStore()
    player.$patch({ major: 0, sub: 0, exp: { m: 0, e: 0 } })
    inventory.addPill('p_jvqidan', 1)
    const req = toNum(expRequirement(0, 0))
    const before = toNum(player.exp)
    expect(usePill('p_jvqidan')).toBe(true)
    const gain = toNum(player.exp) - before
    expect(gain, 'expFixed 也该封顶「不满一层」,不复按裸点数连跳').toBeLessThanOrEqual(
      req * INSTANT_EXP_LAYER_CAP + 1e-9
    )
    expect(gain, 'expFixed 把整层填满 —— 固定点数绕过层封顶').toBeLessThan(req)
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
    // 太初丹 10800s 在低境界必然溢出;走真实 usePill 路径
    const player = usePlayerStore()
    const inventory = useInventoryStore()
    const cultivation = useCultivationStore()
    player.$patch({ major: 2, sub: 5, exp: { m: 0, e: 0 } })
    cultivation.addBuff('buff_juling', Date.now()) // 修速 +50%
    inventory.addPill('p_taichu', 1)
    const req = toNum(expRequirement(2, 5))
    const before = toNum(player.exp)
    expect(usePill('p_taichu')).toBe(true)
    const gain = toNum(player.exp) - before
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
    // 草够 7 炉、石够 3 炉
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
    expect(plan.blocked).toContain('灵草尚差')
    expect(plan.blocked).toContain('灵石尚差')
    expect(plan.reason).toBe('both')
    expect(plan.shortHerb).toBeGreaterThan(0)
  })

  /** 缺草与缺石分开报:只缺草报还差几株,只缺石不出现草的去路 */
  it('只缺草:reason=herb 且报出还差几株(界面靠它决定给不给采购入口)', () => {
    knowRecipe()
    const cost = pillCraftCost(ID)!
    const resources = useResourcesStore()
    resources.addStone({ m: 1, e: 9 })
    resources.addSmall('herb', Math.max(0, cost.herb - 1))
    const plan = craftBatchPlan(ID)
    expect(plan.rounds).toBe(0)
    expect(plan.reason).toBe('herb')
    expect(plan.shortHerb, '短缺数按「差多少才够一炉」算').toBe(1)
    expect(plan.blocked, '把缺口写进话里,玩家拿着数去坊市').toContain('灵草尚差 1 株')
    expect(plan.shortStone, '草不够时石若充足,不该报石差').toBeUndefined()
  })

  it('只缺灵石:reason=stone,不给草的去路', () => {
    knowRecipe()
    const cost = pillCraftCost(ID)!
    const resources = useResourcesStore()
    resources.addSmall('herb', cost.herb * 3)
    const plan = craftBatchPlan(ID)
    expect(plan.rounds).toBe(0)
    expect(plan.reason).toBe('stone')
    expect(plan.shortHerb, '草够的时候不该报草的缺口').toBeUndefined()
    expect(plan.blocked).toContain('灵石')
    expect(plan.blocked).not.toContain('灵草')
    expect(plan.shortStone?.m, '只缺石时计划要带实际石差').toBeGreaterThan(0)
    expect(plan.blocked, '石差按大数格式写进话里').toContain('灵石尚差')
  })

  it('一炉差额与计划同源:草按当前品库存、石按大数减法', () => {
    knowRecipe()
    const cost = pillCraftCost(ID)!
    const resources = useResourcesStore()
    resources.addSmall('herb', cost.herb - 2)
    resources.spiritStone = { m: 0, e: 0 }
    const gap = craftShortfall(cost)
    expect(gap.herb).toBe(2)
    expect(gap.stone.m).toBeGreaterThan(0)
    const plan = craftBatchPlan(ID)
    expect(plan.shortHerb).toBe(gap.herb)
    expect(plan.shortStone).toEqual(gap.stone)
  })

  it('纯未知的方子 id:报「不知此方」而非「料不足」—— 掌握问题与材料问题分得开', () => {
    const plan = craftBatchPlan('p__并_不_存_在__xyz')
    expect(plan.rounds).toBe(0)
    expect(plan.blocked).toContain('不知此方')
    expect(plan.blocked).not.toContain('灵草')
    expect(plan.reason, '未知方子补不了料,不该指去坊市').toBe('unknown')
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
    expect(salvageRatio(1000)).toBe(0.5)
  })

  it('技艺 50:线性中段 0.35(基准 + 半档 0.15)', () => {
    expect(salvageRatio(50)).toBeCloseTo(0.35, 10)
  })
})

/**
 * stoneRounds 由 ratio(spiritStone, cost.stone) 求商;灵石价为 0/异常时 ratio 可回 Infinity/NaN,
 * 非有限的石炉数收束为不构成限制(rounds 由草维度决定)。
 */
describe('炼丹计划有限性(craftBatchPlan 不产 Infinity/NaN)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('每张可炼丹方都得出有限 rounds/stone(除数收束)', () => {
    const res = useResourcesStore()
    const lore = useLoreStore()
    res.addStone({ m: 1, e: 9 })
    let checked = 0
    for (const p of PILLS) {
      const cost = pillCraftCost(p.id)
      if (!cost) continue
      // 点亮方子掌握与灵材认知,只看计划是否有限
      lore.addRecipeMastery(p.id, 1)
      for (const mid of recipeCraft(pillDef(p.id)!)?.materials ?? []) {
        lore.advanceLore(mid, 3)
      }
      res.herbByGrade[cost.grade] = 10_000
      const able = craftability(p.id)
      if ((able?.blockers?.length ?? 0) > 0) continue // 仍挡(如境界准入)则跳过
      const plan = craftBatchPlan(p.id)
      expect(Number.isFinite(plan.rounds), `${p.id} rounds 非有限`).toBe(true)
      expect(plan.rounds).toBeGreaterThanOrEqual(0)
      if (plan.rounds > 0) {
        expect(Number.isFinite(toNum(plan.stone)), `${p.id} stone 非有限`).toBe(true)
        expect(plan.herb).toBeGreaterThan(0)
      }
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('双丹概率 · 展示与结算同一个数(封顶单源)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    settleRewards()
  })

  it('结算掷的就是 craftability 印出的 bonusChanceWithYield,不是自算的 0.8', () => {
    knowRecipe(0.8)
    giveMaterials()
    useDongfuStore().setLevel('alchemy', 6) // 丹炉:alchemyYield 0.3
    const able = craftability(ID)!
    const pSecond = able.bonusChanceWithYield
    expect(pSecond, '丹炉+手艺该把双丹概率推起来').toBeGreaterThan(0.3)

    // 掷点落在 pSecond 之内;spy 抓结算真正掷的概率
    mockRand = pSecond / 2
    const chance = vi.spyOn(rng, 'chance')
    const out = craftPill(ID)
    expect(out.ok, '这一掷该成丹').toBe(true)
    expect(out.count, '掷点 < 展示的双丹概率就该多得一枚').toBe(2)
    const rollArgs = chance.mock.calls.map(c => c[0])
    expect(
      rollArgs,
      '结算必须掷 craftability 印出的那个数 —— 展示与结算同源,不再自算 Math.min(0.8, …)'
    ).toContain(pSecond)
    chance.mockRestore()
  })

  it('封顶只在 craftability 一处:结算源码不内联 0.8', () => {
    const service = readFileSync(resolve(__dirname, './pillService.ts'), 'utf8')
    expect(service).toContain('able.bonusChanceWithYield')
    expect(service, '结算不得再各写一遍 0.8 封顶').not.toContain('Math.min(0.8')
    expect(service, '结算须经 craftability 取含封顶的真实概率,不得自读 alchemyYield').not.toContain(
      "'alchemyYield'"
    )
    const able = readFileSync(resolve(__dirname, './craftability.ts'), 'utf8')
    expect(able).toContain('Math.min(PILL_SECOND_CAP')
  })
})


/**
 * 开炉开出顶档(神品 / 道品)那一炉要翻开得宝仪典。
 *
 * 为什么钉在结算侧:仪典只给最顶那一档,而「最顶」由丹药品阶决定 ——
 * 若把判断放到界面,弹窗里每一味丹都会各自算一遍门槛,迟早分叉。
 * 判据同时守另一头:开出通品丹时**不该**翻开(不是「每次成丹都演一遍」)。
 */
describe('得宝仪典 · 开炉出顶档那一炉', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
    settleRewards()
  })

  /** 把玩家抬到能承受该丹方,并给足材料与技艺;顶档丹方按 stoneByTier 折价,灵石要多给 */
  function readyFor(id: string): void {
    const def = pillDef(id)!
    const craft = recipeCraft(def)!
    const player = usePlayerStore()
    player.$patch({ major: Math.max(player.major, def.minRealm) })
    useLoreStore().addRecipeMastery(id, 1)
    for (const mid of craft.materials) useLoreStore().advanceLore(mid, 3)
    const resources = useResourcesStore()
    resources.addSmall('herb', 4000)
    resources.addStone({ m: 1, e: 30 })
  }

  it('开出神品丹翻开,开出凡品丹不翻', () => {
    const ui = useUiStore()
    const mortal = PILLS.find(p => p.quality === 'mortal' && p.recipe)!
    readyFor(mortal.id)
    ui.clearTreasure()
    expect(craftPill(mortal.id).ok, '前置:凡品丹该开得成').toBe(true)
    expect(ui.treasure, '凡品丹不该翻开仪典').toBeNull()

    const divine = PILLS.find(p => p.quality === 'divine' && p.recipe)!
    readyFor(divine.id)
    ui.clearTreasure()
    const out = craftPill(divine.id)
    expect(out.ok, '前置:神品丹该开得成').toBe(true)
    expect(ui.treasure, '开出神品丹该翻开仪典').not.toBeNull()
    expect(ui.treasure!.kindName).toBe('丹药')
    expect(ui.treasure!.name).toBe(divine.name)
    expect(ui.treasure!.grade).toBe(qualityDef('divine').name)
  })

  it('道品丹(不在共享品阶表里)同样翻开,品阶名报「道品」', () => {
    const ui = useUiStore()
    const dao = PILLS.find(p => p.quality === 'dao' && p.recipe)!
    readyFor(dao.id)
    ui.clearTreasure()
    const out = craftPill(dao.id)
    expect(out.ok, '前置:道品丹该开得成').toBe(true)
    expect(ui.treasure, '道品该开仪典').not.toBeNull()
    expect(ui.treasure!.grade).toBe('道品')
  })

  it('炸炉不翻开 —— 没成丹就没有「那一刻」', () => {
    const ui = useUiStore()
    const divine = PILLS.find(p => p.quality === 'divine' && p.recipe)!
    readyFor(divine.id)
    mockRand = 0.999 // 所有概率判定都成不了
    ui.clearTreasure()
    const out = craftPill(divine.id)
    expect(out.ok).toBe(false)
    expect(ui.treasure, '炸炉不该翻开仪典').toBeNull()
  })

  it('quiet(连炼 / 批量)不翻开 —— 一炉一炉演会把「那一刻」演成噪声', () => {
    const ui = useUiStore()
    const divine = PILLS.find(p => p.quality === 'divine' && p.recipe)!
    readyFor(divine.id)
    mockRand = 0
    ui.clearTreasure()
    const out = craftPill(divine.id, true)
    expect(out.ok, '前置:静默也照常成丹').toBe(true)
    expect(ui.treasure, '静默开炉不该翻开仪典').toBeNull()
  })
})
