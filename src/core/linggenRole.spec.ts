/* eslint-disable no-console */
/**
 * 灵根职能审计(Phase 32.2 前置诊断,不改任何游戏逻辑)
 *
 * 待判定的问题:灵根是否已从"转世时必须关注的变量"
 * 退化为"存在,但没有决策权的属性"。
 *
 * 关键是区分两种病因——它们的处方完全相反:
 *   数值不足 → 调高倍率即可
 *   职能冲突 → 灵根负责的维度被别的系统整体覆盖,调倍率只是拼数值,
 *              最后必然长出新的最优阈值
 *
 * 四条诊断:
 *   ① 权重衰减:灵根贡献占总修速的比例,随转世世数如何变化
 *   ② 稀释来源:到底是谁盖过了灵根——聚灵阵,还是别的东西
 *   ③ 维度接线:灵根的元素维度(11 种)在游戏里产生了多少决策点
 *   ④ 交互形态:转世时玩家对灵根到底能做什么动作
 *
 * 结论(32.2 落地后的现状):
 *   ①② 仍然成立,且**不打算修复**——修炼倍率这条路是死路,
 *      凡进加法池者必被道果碾平,给灵根加倍率只是换个数字继续输。
 *      它们留在这里,是为了记住"为什么不走那条路"。
 *   ③ 已转为验收:元素维度接进了功法参悟、机缘出现、天劫解法三条通道。
 *      红线细则由 linggenAffinity.spec.ts 把守。
 *   ④ 仍然成立:转世依旧一掷定终身。32.2 的处方不是补重掷界面
 *      (那要新增页面,超出范围),而是让灵根即使不可选也仍有意义——
 *      它决定这一世的牌面形状,而非这一世的数值高低。
 */
import { describe, it, expect } from 'vitest'
import { estimateCultMult } from './progressionSim'
import { daoFruitGain } from './formulas'
import { rollLinggen } from './linggenGen'
import { fortuneAffinity, gongfaAffinity, reliefKinds, rootElements } from './linggenAffinity'
import { RandomService, mulberry32 } from '@/utils/random'
import { BUILDINGS } from '@/data/buildings'
import { CREATE_REROLL_LIMIT, DAO_FRUIT_CULT_BONUS, REINCARNATE_APTITUDE_FLOOR } from '@/data/constants'
import { EVENTS, FORTUNE_EVENTS } from '@/data/events'
import { GONGFA } from '@/data/gongfa'
import { ELEMENTS } from '@/data/linggen'
import { effectiveDaoFruit, modOf } from './statsCalc'

/** 聚灵阵:审计对照物(玩家反馈中"覆盖了灵根"的那个系统) */
const ARRAY_DEF = BUILDINGS.find(b => b.id === 'array')!
const ARRAY_PER_LEVEL = modOf(ARRAY_DEF.mods(1), 'cultivationSpeed')
const ARRAY_MAX_BONUS = modOf(ARRAY_DEF.mods(ARRAY_DEF.maxLevel), 'cultivationSpeed')

/** 各档灵根的代表倍率(取自 linggenGen 的实际取值域) */
const LINGGEN_TIERS = [
  { name: '五杂灵根(最差)', mult: 0.6 },
  { name: '伪灵根(典型)', mult: 1.15 },
  { name: '上灵根', mult: 1.34 },
  { name: '真灵根', mult: 1.8 },
  { name: '天灵根', mult: 2.67 },
  { name: '混沌灵根', mult: 4.0 }
]

/** 转世档位:世数 → (境界, 道果, 天赋修速),与 multiLifeTable 同口径 */
function lifeContext(life: number, major: number): { major: number; fruit: number; talent: number } {
  return {
    major,
    fruit: (life - 1) * daoFruitGain(3, 0),
    talent: Math.min(0.4, (life - 1) * 0.06)
  }
}

/** 灵根贡献占该档位总修速的比例 */
function linggenShare(mult: number, life: number, major: number): number {
  const ctx = lifeContext(life, major)
  const total = estimateCultMult(ctx.major, ctx.fruit, { linggenMult: mult, talentCultBonus: ctx.talent })
  return (mult - 1) / total
}

/** 最好灵根与最差灵根之间的实际速度比 */
function bestWorstRatio(life: number, major: number): number {
  const ctx = lifeContext(life, major)
  const top = LINGGEN_TIERS[LINGGEN_TIERS.length - 1]!.mult
  const bottom = LINGGEN_TIERS[0]!.mult
  const best = estimateCultMult(ctx.major, ctx.fruit, { linggenMult: top, talentCultBonus: ctx.talent })
  const worst = estimateCultMult(ctx.major, ctx.fruit, { linggenMult: bottom, talentCultBonus: ctx.talent })
  return best / worst
}

describe('灵根职能审计 ① 权重衰减', () => {
  it('灵根贡献占比随转世世数持续衰减(转世越多,灵根越无关)', () => {
    const stages: [number, number][] = [
      [1, 1],
      [1, 3],
      [5, 3],
      [20, 5],
      [50, 6]
    ]
    console.log('\n  世数/境界   典型灵根占比   天灵根占比   最好:最差速度比')
    const shares: number[] = []
    const ratios: number[] = []
    for (const [life, major] of stages) {
      const typical = linggenShare(1.15, life, major)
      const heaven = linggenShare(2.67, life, major)
      const ratio = bestWorstRatio(life, major)
      shares.push(typical)
      ratios.push(ratio)
      console.log(
        `  第${String(life).padStart(2)}世 major=${major}   ${(typical * 100).toFixed(1).padStart(5)}%      ${(heaven * 100).toFixed(1).padStart(5)}%       ${ratio.toFixed(2)}x`
      )
    }

    // 单调衰减:这是"职能被稀释"的形状,而非"数值偏低"的形状
    for (let i = 1; i < shares.length; i += 1) {
      expect(shares[i]!, '典型灵根占比未随世数衰减').toBeLessThan(shares[i - 1]!)
      expect(ratios[i]!, '灵根间的速度差距未随世数收敛').toBeLessThan(ratios[i - 1]!)
    }
  })

  it('后期典型灵根占总修速不足 2%,灵根间差距收敛到 20% 以内', () => {
    const share = linggenShare(1.15, 50, 6)
    const ratio = bestWorstRatio(50, 6)

    // 全档位横向对比:第1世 vs 第50世,同一批灵根拉开的差距
    const ctxEarly = lifeContext(1, 1)
    const ctxLate = lifeContext(50, 6)
    console.log('\n  灵根档位            第1世修速   第50世修速   第50世占比')
    for (const t of LINGGEN_TIERS) {
      const early = estimateCultMult(ctxEarly.major, ctxEarly.fruit, { linggenMult: t.mult, talentCultBonus: ctxEarly.talent })
      const late = estimateCultMult(ctxLate.major, ctxLate.fruit, { linggenMult: t.mult, talentCultBonus: ctxLate.talent })
      console.log(
        `  ${t.name.padEnd(16)} ×${early.toFixed(2).padStart(5)}     ×${late.toFixed(2).padStart(6)}     ${(((t.mult - 1) / late) * 100).toFixed(1).padStart(5)}%`
      )
    }
    console.log(`  第50世:典型灵根占比 ${(share * 100).toFixed(2)}% · 最好:最差 = ${ratio.toFixed(3)}x`)

    // 讽刺之处:灵根本该是转世时最该看的东西,
    // 而转世次数(道果 + 天赋)恰恰是稀释它的最大变量。
    expect(share, '典型灵根仍占可观比重——若如此,问题偏向数值而非职能').toBeLessThan(0.02)
    expect(ratio, '灵根间仍有明显速度差——若如此,灵根尚未失去决策权').toBeLessThan(1.2)
  })
})

describe('灵根职能审计 ② 稀释来源', () => {
  it('聚灵阵能覆盖多数灵根,但它不是稀释的主力', () => {
    const rng = new RandomService(mulberry32(0x11e66e))
    const SAMPLES = 20000
    let coveredByMaxArray = 0
    const mults: number[] = []
    for (let i = 0; i < SAMPLES; i += 1) {
      const mult = rollLinggen(rng).growthMult
      mults.push(mult)
      if (mult - 1 <= ARRAY_MAX_BONUS) coveredByMaxArray += 1
    }
    mults.sort((a, b) => a - b)
    const median = mults[Math.floor(SAMPLES / 2)]!
    const levelsForMedian = Math.ceil(Math.max(0, median - 1) / ARRAY_PER_LEVEL)

    console.log(`\n  聚灵阵:每级 +${(ARRAY_PER_LEVEL * 100).toFixed(0)}% 修速,满 ${ARRAY_DEF.maxLevel} 级 +${(ARRAY_MAX_BONUS * 100).toFixed(0)}%`)
    console.log(`  灵根中位数 ×${median.toFixed(2)}(贡献 +${((median - 1) * 100).toFixed(0)}%)≈ 聚灵阵 ${levelsForMedian} 级`)
    console.log(`  贡献 ≤ 聚灵阵满级的灵根占比:${((coveredByMaxArray / SAMPLES) * 100).toFixed(1)}%`)

    // 聚灵阵确实能吃掉多数灵根的全部差距,但它要堆到 13/20 级才追平中位灵根——
    // 玩家把账算在聚灵阵头上是因为它可见、可堆、有等级条,真正的稀释见下一条。
    expect(levelsForMedian, '聚灵阵满级都追不上中位灵根').toBeLessThanOrEqual(ARRAY_DEF.maxLevel)
    expect(coveredByMaxArray / SAMPLES, '聚灵阵满级覆盖不了多数灵根').toBeGreaterThan(0.6)
  })

  it('稀释主力是转世累积本身:后期道果独占七成修速', () => {
    // 拆解 estimateCultMult 的各项来源(第20世 major=5 口径)
    const { major, fruit, talent } = lifeContext(20, 5)
    const total = estimateCultMult(major, fruit, { linggenMult: 1.15, talentCultBonus: talent })
    const parts = [
      { name: '道果(转世累积)', v: effectiveDaoFruit(fruit) * DAO_FRUIT_CULT_BONUS },
      { name: '天赋(转世累积)', v: talent },
      { name: '基础', v: 1 },
      { name: '主修功法', v: 0.12 + 0.055 * major },
      { name: '辅修功法', v: 0.06 + 0.05 * major },
      { name: '全部建筑(含聚灵阵)', v: Math.min(1.2, 0.1 + 0.09 * major) },
      { name: '装备词条', v: 0.05 + 0.03 * major },
      { name: '灵气充沛', v: 0.15 },
      { name: '灵根(典型)', v: 0.15 }
    ].sort((a, b) => b.v - a.v)

    console.log(`\n  第20世 major=5 总修速 ×${total.toFixed(2)},来源分解:`)
    for (const p of parts) {
      console.log(`    ${p.name.padEnd(20)} +${p.v.toFixed(2)}  ${((p.v / total) * 100).toFixed(1).padStart(5)}%`)
    }

    const fruitShare = (effectiveDaoFruit(fruit) * DAO_FRUIT_CULT_BONUS) / total
    const linggenShareHere = 0.15 / total
    console.log(`  → 道果 ${(fruitShare * 100).toFixed(0)}% vs 灵根 ${(linggenShareHere * 100).toFixed(1)}%,相差 ${(fruitShare / linggenShareHere).toFixed(0)} 倍`)

    // 处方由此确定:凡是放进这个加法池的修炼倍率都会被转世累积稀释,
    // 所以给灵根加倍率无效——它必须改去负责加法池之外的东西。
    expect(fruitShare, '道果并非稀释主力,归因需重查').toBeGreaterThan(0.6)
    expect(fruitShare / linggenShareHere, '道果与灵根量级相差不大').toBeGreaterThan(20)
  })
})

describe('灵根职能审计 ④ 转世时的交互形态', () => {
  it('建号可重掷 8 次,转世一掷定终身——灵根在转世时没有决策点', () => {
    // 建号:CreateView 给 CREATE_REROLL_LIMIT 次重掷,玩家会挑
    // 转世:reincarnation.ts 直接 player.rebirth(rollLinggen(rng, floor)),没有任何挑选界面
    console.log(`\n  建号重掷次数:${CREATE_REROLL_LIMIT}  →  灵根是玩家会反复看的东西`)
    console.log('  转世重掷次数:0            →  灵根是系统发下来的一张牌')

    // "玩家看了灵根后是否改变选择"这个行为链,第二步在转世流程里不存在。
    // 这比"数值被稀释"更根本:不是决策变弱了,是压根没有决策动作。
    expect(CREATE_REROLL_LIMIT, '建号无重掷,则两处形态一致,不构成对比').toBeGreaterThan(0)
  })

  it('转世资质保底会在第 12 世彻底顶满,灵根之间只剩根数差别', () => {
    // floor = REINCARNATE_APTITUDE_FLOOR × (count+1);普通根资质下限 40
    // 当 floor ≥ 60,min(100, rng.int(40,100)+floor) 恒为 100
    const lifeWhenCapped = Math.ceil(60 / REINCARNATE_APTITUDE_FLOOR)
    console.log(`\n  转世资质保底 +${REINCARNATE_APTITUDE_FLOOR}/世,第 ${lifeWhenCapped} 世起所有根资质恒为 100`)

    // 实采:第 20 世的灵根,资质维度是否已完全塌缩
    const rng = new RandomService(mulberry32(0x5ea1ed))
    const floor = REINCARNATE_APTITUDE_FLOOR * 20
    const aptitudes = new Set<number>()
    const grades = new Set<string>()
    for (let i = 0; i < 5000; i += 1) {
      const p = rollLinggen(rng, floor)
      for (const r of p.roots) aptitudes.add(r.aptitude)
      grades.add(p.gradeName)
    }
    console.log(`  第20世采样:出现过的资质值 = [${[...aptitudes].join(', ')}]`)
    console.log(`  出现过的品阶 = [${[...grades].join('、')}]`)
    console.log('  → 资质维度塌缩为常数,灵根差异只剩"几根"与"是否变异"')

    // 转世越多,灵根资质越好;而转世越多,灵根越不重要。
    // 系统一边把这个属性喂满,一边让它失去意义。
    expect(aptitudes.size, '资质仍有分布——保底尚未顶满,塌缩点需重算').toBe(1)
    expect([...aptitudes][0]).toBe(100)
  })
})

describe('灵根职能审计 ③ 维度接线(Phase 32.2:已接线)', () => {
  it('元素维度已接入机缘池:同源机缘更容易撞见,非同源照样能遇到', () => {
    const withElement = FORTUNE_EVENTS.filter(ev => ev.element)
    const neutral = FORTUNE_EVENTS.filter(ev => !ev.element)
    console.log(`\n  机缘 ${FORTUNE_EVENTS.length} 条:带元素 ${withElement.length}、中性 ${neutral.length}`)
    for (const ev of withElement) {
      const el = ev.element!
      const same = fortuneAffinity(el, [el])
      const diff = fortuneAffinity(el, [el === 'metal' ? 'wood' : 'metal'])
      console.log(`    ${ev.title}(${ELEMENTS[el].name})  同源权重 ×${same}  非同源 ×${diff}`)
      expect(same, '同源机缘未加权,接线是死的').toBeGreaterThan(1)
      expect(diff, '非同源机缘被压低,倾向已变成门槛').toBe(1)
    }
    console.log('  → 灵根接进了"机缘 → 师承 → 功法分支 → 流派"的因果链起点')
    expect(withElement.length, '没有任何机缘带元素,机缘接线未生效').toBeGreaterThan(0)
    expect(neutral.length, '所有机缘都带元素,灵根已从倾向变成职业分配').toBeGreaterThan(0)
  })

  it('元素维度已接入功法参悟:灵根与功法之间那条线已经连上', () => {
    const withElement = GONGFA.filter(g => g.element)
    const byElement = new Map<string, number>()
    for (const g of withElement) byElement.set(g.element!, (byElement.get(g.element!) ?? 0) + 1)
    console.log(
      `\n  带元素的功法:${withElement.length}/${GONGFA.length} [${[...byElement].map(([e, n]) => `${ELEMENTS[e as keyof typeof ELEMENTS].name}×${n}`).join(' ')}]`
    )
    let wired = 0
    for (const el of byElement.keys()) {
      const id = el as keyof typeof ELEMENTS
      if (gongfaAffinity(id, [id]) > 1 && gongfaAffinity(id, []) === 1) wired += 1
    }
    console.log(`  已接线的元素:${wired}/${byElement.size} —— 同源加权、无灵根不减权`)
    expect(wired, '功法元素与灵根之间仍无连接').toBe(byElement.size)
  })

  it('灵根画像对下游不再只是一个数字:roots 已被 core/ 三处消费', () => {
    const rng = new RandomService(mulberry32(7))
    const profile = rollLinggen(rng)
    const elements = rootElements(profile.roots)
    console.log(`\n  灵根画像字段:[${Object.keys(profile).join(', ')}]`)
    console.log(`  roots 元素:[${elements.map(e => ELEMENTS[e].name).join('、')}]`)

    // 三条下游通道,逐一验明确实读到了 element 而不只是 growthMult
    const el = elements[0]!
    const channels = {
      功法参悟: gongfaAffinity(el, elements) > 1,
      机缘出现: fortuneAffinity(el, elements) > 1,
      天劫解法: reliefKinds(elements).length > 0
    }
    for (const [name, on] of Object.entries(channels)) console.log(`    ${name}  ${on ? '已接线' : '未接线'}`)
    console.log('  → growthMult 仍在(且仍被道果稀释,见 ①②),但它已不再是灵根的唯一职能')

    expect(elements.length, 'roots 为空,灵根画像已失效').toBeGreaterThan(0)
    expect(Object.values(channels).every(Boolean), '仍有下游通道未读到 roots').toBe(true)
  })

  it('记账:EventCond.element 这条入口至今仍是 0 使用', () => {
    // 32.2 走的是"权重偏向 + 解法空间",没有动选项级的元素门槛。
    // 保留这条观测——它现在只是一条未启用的入口,不再意味着元素维度是装饰。
    const all = [...EVENTS, ...FORTUNE_EVENTS]
    let elementGated = 0
    for (const ev of all) {
      for (const choice of ev.choices) {
        if (choice.cond?.type === 'element') elementGated += 1
      }
    }
    console.log(`\n  事件总数 ${all.length},以灵根元素为「选项条件」的:${elementGated} 个`)
    console.log('  → 这条入口是硬门槛(无此灵根即不可选),与"灵根提供倾向"相抵触,故 32.2 未使用')
    expect(elementGated).toBe(0)
  })
})
