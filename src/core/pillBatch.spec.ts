/**
 * 批量服丹 / 批量炼丹:结果与连点一致。
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

import { usePill, usePillBatch, craftPillBatch, pillCraftCost, salvageRatio, craftBatchPlan } from './pillService'
import { pillDef } from '@/data/pills'
import { recipeCraft } from '@/data/crafting'
import { craftability } from '@/core/craftability'
import { toNum, mulN } from '@/utils/gnum'
import { useResourcesStore } from '@/stores/resources'
import { CRAFT_BATCH_MAX } from '@/data/constants'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import { useLoreStore } from '@/stores/lore'
import { useQuestsStore } from '@/stores/quests'
import { ACHIEVEMENTS } from '@/data/achievements'
import { MAIN_QUESTS } from '@/data/quests'
import { settleProgress } from './progress'

/** 最低阶回春丹,与 pillService.spec 同一条路径 */
const ID = 'p_huichun'

/** 结清成就/主线一次性赏钱,免得搅浑开炉差账 */
function settleRewards(): void {
  const quests = useQuestsStore()
  quests.$patch({ achieved: ACHIEVEMENTS.map(a => a.id), mainIdx: MAIN_QUESTS.length - 1 })
}

/** 认得方子与灵材才炼得动 */
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

  it('成功开炉也涨一点掌握度(练成熟手,不止炸炉才长记性)', () => {
    giveMaterials()
    const lore = useLoreStore()
    const before = lore.recipeMastery(ID)
    craftPillBatch(ID, 1)
    expect(lore.recipeMastery(ID), '成功一炉也应熟稔+0.01').toBeCloseTo(before + 0.01, 6)
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
    expect(res.herbOf(g)).toBeGreaterThanOrEqual(0)
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
 * craftBatchPlan 是纯计划(rounds=min(草炉数,石炉数),herb/stone=rounds×单炉成本),craftPillBatch 逐炉实跑;
 * 界面「炼满 N 炉/耗 X 料」须与实耗一致。
 */
describe('批量炼丹 · 计划与运行守恒(craftBatchPlan ↔ craftPillBatch)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0 // 必成:计划按每炉全额烧料预测
    settleRewards()
    knowRecipe()
  })

  it('计划即实耗:rounds 与 herb/stone 恰为实跑消耗(预测准确)', () => {
    const res = useResourcesStore()
    const c = pillCraftCost(ID)!
    const g = c.grade
    res.addSmall('herb', c.herb * 5) // 草够 5 炉、石充足:rounds 由草限
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
    const out = craftPillBatch(ID, plan.rounds + 5)
    expect(out.rounds, '受草限制仍停在计划炉数').toBe(plan.rounds)
    expect(res.herbOf(g)).toBe(0)
  })

  it('计划即实耗:灵石是唯一限制时,rounds 被石限住且 stone 恰对应实跑', () => {
    const res = useResourcesStore()
    const c = pillCraftCost(ID)!
    const g = c.grade
    // 草够 10 炉、石够 2 炉:rounds 由石限
    res.addSmall('herb', c.herb * 10)
    res.addStone(mulN(c.stone, 2))
    const plan = craftBatchPlan(ID)
    expect(plan.rounds, '石限应把 plan.rounds 钳到 2').toBe(2)
    const s0 = toNum(res.spiritStone)
    const out = craftPillBatch(ID, plan.rounds)
    expect(out.rounds, '实跑炉数应等于计划(2)').toBe(2)
    expect(s0 - toNum(res.spiritStone), '实耗石 = 计划 stone = 2 炉成本,恰花光').toBeCloseTo(toNum(plan.stone), 6)
    expect(res.herbOf(g)).toBeGreaterThanOrEqual(0)
  })
})

describe('批量炼丹 · 开炉前置(方子未到手)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
  })

  it('count===1 但炉没开(方子未知):不算「开了一炉又炸了」,与连炼循环口径一致', () => {
    // 未 knowRecipe:craftability 拿不到,craftPill 直接 abort
    expect(craftPillBatch(ID, 1)).toEqual({ rounds: 0, made: 0, failed: 0 })
  })
})

describe('丹药批量 · 未知丹药 id', () => {
  /*
   * 新 pinia = 干净的行囊。
   *
   * 原先没有 beforeEach:`--sequence.shuffle` 把本组排到最前时,
   * 头一句 `useInventoryStore()` 就抛 `[🍍] there was no active Pinia`。
   */
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('给丹药表里没有的 id:返回 0,不抛错、不动行囊', () => {
    /*
     * 两条守卫各管一段:`count < 1` 管数量,`if (!def) return 0` 管 id。
     * 去掉后者会让 def.buffId 读 undefined 上的属性抛 TypeError ——
     * 旧档里改过名的丹、或别处传入的拼错 id 都会走到这里。
     */
    const inv = useInventoryStore()
    const pillsBefore = JSON.stringify(inv.pills)
    expect(() => usePillBatch('no_such_pill', 5)).not.toThrow()
    expect(usePillBatch('no_such_pill', 5)).toBe(0)
    expect(JSON.stringify(inv.pills), '未知丹药不该动行囊').toBe(pillsBefore)
  })
})

/**
 * 「炼满」的按钮读数与执行次数分开。
 *
 * 炉数只受材料限制,而灵草没有真实上界 —— 读档自愈用的上界是 1e12(按低速产出定的),
 * 坏档正落在那个数上。实测 25000 炉在真浏览器里卡 5.7 秒,2.5e11 炉要几十分钟;
 * 点一下「开炉 ×N」主线程全被占住,心跳与写档一起停摆。
 *
 * 修法与坊市「售尽」同一类:把「材料够多少」与「这一下做多少」分成两个字段。
 * 界面那行「可炼 N 炉」仍说前者,按钮正文与执行读后者。
 *
 * 故障注入:把 `batch` 改回 `rounds`(即删掉 min 那道),第一条立刻红。
 */
describe('炼丹连开计划 · 一次开炉数封顶', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
    settleRewards()
    knowRecipe()
  })

  it('材料够几万炉时,按钮读数是封顶值,不是材料上限', () => {
    const res = useResourcesStore()
    res.addSmall('herb', 1_000_000)
    res.addStone({ m: 9, e: 30 })
    const plan = craftBatchPlan(ID)
    expect(plan.rounds, '材料够多少炉照实报(界面那行「可炼 N 炉」读它)').toBeGreaterThan(100_000)
    expect(plan.batch, '这一下开的炉数必须封顶,否则一次点击要跑几十分钟').toBe(CRAFT_BATCH_MAX)
  })

  it('材料不多时两者相等(封顶不改变正常行为)', () => {
    const res = useResourcesStore()
    const c = pillCraftCost(ID)!
    res.addSmall('herb', c.herb * 7)
    res.addStone({ m: 1, e: 9 })
    const plan = craftBatchPlan(ID)
    expect(plan.rounds).toBe(7)
    expect(plan.batch).toBe(7)
  })

  it('炼不动时两个字段都是 0', () => {
    const plan = craftBatchPlan(ID)
    expect(plan.rounds).toBe(0)
    expect(plan.batch).toBe(0)
  })

  it('按 batch 开炉:实跑炉数与计划一致,材料按实跑扣', () => {
    // 上限内的量级:这条钉的是「执行读的就是 batch」,不是耗时 ——
    // 上限被删掉时它会跑上几十秒才红(实测 52 秒),那本身也是一个信号

    const res = useResourcesStore()
    const c = pillCraftCost(ID)!
    const g = c.grade
    res.addSmall('herb', 1_000_000)
    res.addStone({ m: 9, e: 30 })
    const plan = craftBatchPlan(ID)
    const h0 = res.herbOf(g)
    const out = craftPillBatch(ID, plan.batch)
    expect(out.rounds, '实跑炉数该等于 batch').toBe(plan.batch)
    // 每炉至多扣全额草(batch 里既有成也有炸)
    expect(h0 - res.herbOf(g)).toBeLessThanOrEqual(plan.batch * c.herb)
    expect(h0 - res.herbOf(g)).toBeGreaterThan(0)
  })
})

/**
 * 整批只判一次成就,结果与逐枚判一致。
 *
 * 逐枚判的理由原本是「与连点 N 下等价」。等价在结果上成立 —— 成就与主线的判据读的是
 * 计数器与境界,批量末尾判一次与逐次判同值(`grantReward` 不产丹药、不自动佩称号)。
 * 差别只在代价:一次判定要扫 62 条成就、每条都建 store 引用,实测 1e4 次 4.1 秒。
 *
 * 判据钉两件事:**外部结果一致**(计数、解锁集合、丹药存量),以及**判定次数确实降下来了**
 * (拿 spy 数 checkAchievements 被调的次数,而不是拿墙钟比 —— 机器快慢会整体平移)。
 *
 * 故障注入:把 usePill 的 `trackQuiet` 改回 `track`,第二条立刻红(判定次数变成 N 次)。
 */
describe('连服 · 成就判定整批只跑一次', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
  })

  /**
   * 判定次数怎么数。
   *
   * 不能在模块命名空间上 spy `checkAchievements` —— 模块内部的直接调用走的是本地绑定,
   * 绕开 spy(实测注掉整批收尾后仍是 0 次,判据成了空跑)。
   * 改数 `quests.hasAchieved`:`checkAchievements` 对 62 条成就逐条调它,
   * 而它挂在 **store 实例**上,每次调用都过属性查找 —— 数得到真次数。
   */
  const countChecks = (count: number) => {
    const inv = useInventoryStore()
    const quests = useQuestsStore()
    inv.$patch({ pills: { [ID]: count } })
    let seen = 0
    const orig = quests.hasAchieved
    const spy = vi.spyOn(quests, 'hasAchieved').mockImplementation(id => {
      seen += 1
      return orig.call(quests, id)
    })
    const eaten = usePillBatch(ID, count)
    spy.mockRestore()
    return { eaten, seen, perCheck: ACHIEVEMENTS.length }
  }

  it('不论连服几枚,成就扫描只跑一轮', () => {
    const one = countChecks(2)
    const many = countChecks(50)
    // 一轮扫描 = 每条成就查一次;两枚与五十枚的轮数必须一样
    const rounds = (r: { seen: number; perCheck: number }) => Math.round(r.seen / r.perCheck)
    expect(one.eaten).toBe(2)
    expect(many.eaten).toBe(50)
    /*
     * 判据要**与单批基线相等**,不许留 +1 的余量。
     *
     * 评审指出:原先写 `<= rounds(one) + 1`,于是「批量里多扫一轮」也能通过 ——
     * 而那正是这条要防的东西(一笔批量干了两次成就扫描)。两枚与五十枚的扫描轮数
     * 必须完全一样;两枚那次也走整批路径,故基线本身是 1 轮。
     */
    expect(
      rounds(many),
      `连服 50 枚扫了 ${rounds(many)} 轮成就(每轮 ${many.perCheck} 条),而连服 2 枚只扫 ${rounds(one)} 轮 —— 批量里多扫了`
    ).toBe(rounds(one))
  })

  it('外部结果与逐枚判一致:计数、存量、成就解锁都对得上', () => {
    const inv = useInventoryStore()
    const quests = useQuestsStore()
    inv.$patch({ pills: { [ID]: 50 } })
    expect(usePillBatch(ID, 50), '五十枚该一枚不剩地服下').toBe(50)
    expect(quests.counter('pillsUsed'), '计数该按实服枚数入账').toBe(50)
    expect(inv.pills[ID] ?? 0, '五十枚该服尽').toBe(0)
    /*
     * 成就本该在整批收尾那一刻就解锁 —— 数据表里 a_pill20 / a_pill100 读的是
     * 「服用 N 枚丹药」这个计数器,50 枚已过 20 那档。
     * 若收尾漏掉判定,成就要等引擎下一拍的 checkStateAchievements 才补上,
     * 结果不丢但界面晚一拍;这里钉住「当场就在」。
     */
    expect(quests.achieved.length, '整批之后该有成就在当场解锁,不等引擎下一拍').toBeGreaterThan(0)
  })
})

/**
 * 整批一次结算,与逐枚同值。
 *
 * 逐枚那条在正常存量(几十枚)没有区别,但存量没有真实上界 —— 读档自愈只夹到一亿,
 * 坏档正落在那个数上;实测 20 万枚 8.3 秒、一亿枚要跑几十分钟,点一下「连服」
 * 主线程全被占住(与坊市「售尽」、炼丹「炼满」同一类)。
 *
 * 等价性靠三条:即时丹每种只带一个效果键;药力的入参只随境界与属性变(吃丹不升级);
 * 灵气按容量封顶,逐枚连加 N 次等于一次加 N 倍再夹。
 *
 * 判据拿**逐枚旧路径**当参照:同一份初始状态下,一次批量与「循环调 usePill」的
 * 修为/灵气/寿元/悟道点必须逐项相同 —— 那正是「等价」的可执行定义。
 *
 * 故障注入:把灵气那行改回 `setQi(qi + cap*pct)`(漏掉 ×eaten),第二条红。
 */
describe('连服 · 整批一次结算与逐枚同值', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
  })

  /** 参照:逐枚调 usePill 得到的四项读数 */
  const byEach = (id: string, count: number) => {
    setActivePinia(createPinia())
    const player = usePlayerStore()
    const res = useResourcesStore()
    useInventoryStore().addPill(id, count)
    player.$patch({ major: 3, sub: 2, exp: { m: 0, e: 0 }, age: 100, lifespanBonusYears: 0 })
    // 参照是**上一版批量实现**:逐枚 usePill(quiet) 循环 + 收尾判一次
    for (let i = 0; i < count; i += 1) usePill(id, true)
    settleProgress()
    return {
      exp: toNum(player.exp),
      qi: res.qi,
      lifespan: player.lifespanBonusYears,
      wudao: res.wudao,
      left: useInventoryStore().pills[id] ?? 0
    }
  }

  /** 批量路径:同一份初始状态,一次 usePillBatch */
  const byBatch = (id: string, count: number) => {
    setActivePinia(createPinia())
    const player = usePlayerStore()
    const res = useResourcesStore()
    useInventoryStore().addPill(id, count)
    player.$patch({ major: 3, sub: 2, exp: { m: 0, e: 0 }, age: 100, lifespanBonusYears: 0 })
    const eaten = usePillBatch(id, count)
    return {
      eaten,
      exp: toNum(player.exp),
      qi: res.qi,
      lifespan: player.lifespanBonusYears,
      wudao: res.wudao,
      left: useInventoryStore().pills[id] ?? 0
    }
  }

  for (const [label, id] of [
    ['修为丹(等效秒数)', 'p_xuanyuan'],
    ['修为丹(固定点数)', 'p_jvqidan'],
    ['灵气丹', 'p_huichun'],
    ['寿元丹', 'p_yanshou']
  ] as const) {
    it(`${label}:四项读数逐一对拍`, () => {
      const each = byEach(id, 8)
      const batch = byBatch(id, 8)
      expect(batch.eaten, '八枚都该服下').toBe(8)
      expect(batch.exp, '修为与逐枚不一致').toBeCloseTo(each.exp, 6)
      expect(batch.qi, '灵气与逐枚不一致').toBeCloseTo(each.qi, 6)
      expect(batch.lifespan, '寿元与逐枚不一致').toBe(each.lifespan)
      expect(batch.wudao, '悟道点与逐枚不一致').toBe(each.wudao)
      expect(batch.left, '存量与逐枚不一致').toBe(each.left)
    })
  }

  it('存量不够时按实有数服下,不动别人的丹', () => {
    const inv = useInventoryStore()
    const other = useInventoryStore()
    inv.addPill('p_xuanyuan', 3)
    other.addPill('p_huichun', 5)
    expect(usePillBatch('p_xuanyuan', 10)).toBe(3)
    expect(inv.pills['p_xuanyuan'] ?? 0).toBe(0)
    expect(inv.pills['p_huichun'], '不该动别的丹').toBe(5)
  })

  it('九十万枚也不按枚数耗时间', () => {
    const inv = useInventoryStore()
    inv.addPill('p_xuanyuan', 1)
    const t0 = performance.now()
    usePillBatch('p_xuanyuan', 1)
    const oneMs = Math.max(0.05, performance.now() - t0)
    inv.addPill('p_xuanyuan', 900_000)
    const t1 = performance.now()
    const eaten = usePillBatch('p_xuanyuan', 900_000)
    const hugeMs = performance.now() - t1
    expect(eaten, '九十枚万该一枚不剩地服下').toBe(900_000)
    expect(hugeMs, `九十万枚花了 ${hugeMs.toFixed(0)}ms,与服一枚不同量级 —— 又走回逐枚循环了`).toBeLessThan(oneMs * 100)
  })
})

/**
 * 批量炼丹的上界落在函数自己身上。
 *
 * `CraftBatchPlan.batch` 是**界面**那条路的封顶;但 `craftPillBatch` 是导出函数,
 * 任何调用点直接传材料数就绕开它 —— 坏档 1e12 株灵草 = 2.5e11 炉,一次调用跑几十分钟。
 * 上界写进函数,「无论谁传什么都跑得完」才是这个函数自己的性质。
 *
 * 故障注入:删掉 `Math.min(..., CRAFT_BATCH_MAX)` 那道,第一条会跑到超时。
 */
describe('批量炼丹 · 函数自己也有上界', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
    settleRewards()
    knowRecipe()
  })

  it('直接传一个巨大的炉数也只开 CRAFT_BATCH_MAX 炉', () => {
    const res = useResourcesStore()
    const c = pillCraftCost(ID)!
    res.addSmall('herb', c.herb * 5000)
    res.addStone({ m: 9, e: 30 })
    const out = craftPillBatch(ID, 5000)
    expect(out.rounds, `直接传 5000 炉却开了 ${out.rounds} 炉 —— 上界没落在函数上`).toBe(CRAFT_BATCH_MAX)
  })

  it('上界之内原样执行(封顶不改变正常行为)', () => {
    const res = useResourcesStore()
    const c = pillCraftCost(ID)!
    res.addSmall('herb', c.herb * 7)
    res.addStone({ m: 1, e: 9 })
    expect(craftPillBatch(ID, 7).rounds).toBe(7)
  })
})

/**
 * 入口拒收非有限批次 —— 评审 Sourcery 指出的两处。
 *
 * `Math.floor(NaN)` 仍是 NaN,而 `NaN <= 0` / `NaN < 1` 都是 **false**:
 * 下面那些「非正数就返回」的守卫根本拦不住它(AGENTS.md 记过这一类)。
 *
 * `craftPillBatch` 那侧是真的会出事:循环一次不跑、`rounds` 停在 0,
 * 随后 `rounds === 0` 的回退分支**非静默开炉** —— 一个非法请求照样扣料出丹
 * (修之前实测:草 400 → 396、丹 0 → 2)。
 *
 * 故障注入:去掉任一处的 `Number.isFinite` 判断,对应那条红。
 */
describe('批量入口 · 非有限批次不成交', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRand = 0
  })

  it('连服:NaN / Infinity 不扣丹、不返回枚数', () => {
    const inv = useInventoryStore()
    inv.$patch({ pills: { [ID]: 10 } })
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(usePillBatch(ID, bad), `count=${bad} 不该服下任何一枚`).toBe(0)
      expect(inv.pills[ID], `count=${bad} 不该动库存`).toBe(10)
    }
  })

  it('连炼:NaN / Infinity 不扣料、不出丹、更不许回退开一炉', () => {
    settleRewards()
    knowRecipe()
    const res = useResourcesStore()
    const inv = useInventoryStore()
    const cost = pillCraftCost(ID)!
    res.addSmall('herb', cost.herb * 100)
    res.addStone({ m: 1, e: 9 })
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const herbsBefore = res.herbOf(cost.grade)
      const pillsBefore = useQuestsStore().counter('pillsCrafted')
      const out = craftPillBatch(ID, bad)
      expect(out, `count=${bad} 该原样返回零`).toEqual({ rounds: 0, made: 0, failed: 0 })
      expect(res.herbOf(cost.grade), `count=${bad} 不该扣草 —— 回退分支会非静默开一炉`).toBe(herbsBefore)
      expect(useQuestsStore().counter('pillsCrafted'), `count=${bad} 不该产出丹药`).toBe(pillsBefore)
    }
    void inv
  })
})
