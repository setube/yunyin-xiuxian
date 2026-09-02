/* eslint-disable no-console */
/**
 * Phase 32.3:可炼程度审计
 *
 * 这套测试守的不是某个具体数值,而是设计口径本身:
 * 「够级必成」的二元门槛已被废除,取而代之的是知识 × 技艺 × 承受的连续曲面。
 * 一旦有人把硬门槛偷偷加回来,或者把越阶做成"随便炼",这里会先炸。
 */
import { describe, expect, it } from 'vitest'
import { bearableRank, composeSuccessRate, CRAFT_BASE_RATE, materialLoreOf, overReachFactor, weightedSkill } from './craftability'
import { discernChance, natureChance, SEEN_FOR_NATURE } from './loreService'
import { LORE_MAX, LORE_STAGE_NAMES, MATERIALS } from '@/data/materials'
import { PILLS } from '@/data/pills'
import { recipeCraft, skillLevelFromExp, skillStageName } from '@/data/crafting'

describe('Phase 32.3:成功率四乘区', () => {
  it('样样圆满且不越阶时逼近基准上限,但永远不到 100%', () => {
    const best = composeSuccessRate(1, 1, 100, 0)
    expect(best).toBeCloseTo(CRAFT_BASE_RATE, 6)
    expect(best).toBeLessThan(1)
  })

  it('四项全弱也不归零 —— 允许玩家赌,只是赌得难看', () => {
    const worst = composeSuccessRate(0, 0, 0, 0)
    expect(worst).toBeGreaterThan(0)
    expect(worst).toBeLessThan(0.05)
    console.log(`\n  一无所知开炉:${(worst * 100).toFixed(2)}%`)
  })

  it('每个乘区都单调:任一项变强,成功率必然不降', () => {
    const axes: [string, (t: number) => number][] = [
      ['掌握度', t => composeSuccessRate(t, 0.5, 50, 0)],
      ['材料认知', t => composeSuccessRate(0.5, t, 50, 0)],
      ['技艺', t => composeSuccessRate(0.5, 0.5, t * 100, 0)]
    ]
    for (const [name, f] of axes) {
      let prev = -1
      for (let t = 0; t <= 1.0001; t += 0.1) {
        const cur = f(t)
        expect(cur, `${name} 在 t=${t.toFixed(1)} 处逆行`).toBeGreaterThanOrEqual(prev)
        prev = cur
      }
    }
  })

  it('单项短板拖不垮全局:三项满分 + 一项归零仍留有余地', () => {
    console.log('\n  单项归零的代价:')
    const rows: [string, number][] = [
      ['丹方生疏', composeSuccessRate(0, 1, 100, 0)],
      ['不识药材', composeSuccessRate(1, 0, 100, 0)],
      ['技艺全无', composeSuccessRate(1, 1, 0, 0)]
    ]
    for (const [name, v] of rows) {
      console.log(`    ${name}:${(v * 100).toFixed(1)}%`)
      expect(v).toBeGreaterThan(0.15)
      expect(v).toBeLessThan(CRAFT_BASE_RATE * 0.6)
    }
  })
})

describe('Phase 32.3:越阶强炼', () => {
  it('同阶及以下无惩罚', () => {
    expect(overReachFactor(0)).toBe(1)
    expect(overReachFactor(-2)).toBe(1)
  })

  it('惩罚逐阶陡峭且严格递减,永不归零', () => {
    console.log('\n  越阶惩罚曲线:')
    let prev = 1
    for (let over = 1; over <= 6; over += 1) {
      const f = overReachFactor(over)
      console.log(`    越 ${over} 阶:×${f.toFixed(4)}`)
      expect(f).toBeLessThan(prev)
      expect(f).toBeGreaterThan(0)
      prev = f
    }
  })

  it('越一阶尚可一搏,越四阶已是赌命', () => {
    // 全知全能者越阶的实际把握 —— 这条决定了"强炼"是不是一条真出路
    const over1 = composeSuccessRate(1, 1, 100, 1)
    const over4 = composeSuccessRate(1, 1, 100, 4)
    expect(over1).toBeGreaterThan(0.5)
    expect(over4).toBeLessThan(0.1)
    expect(over4).toBeGreaterThan(0)
    console.log(`\n  大师越 1 阶:${(over1 * 100).toFixed(1)}% / 越 4 阶:${(over4 * 100).toFixed(1)}%`)
  })

  it('可承受阶位随境界线性抬升', () => {
    for (let major = 0; major < 8; major += 1) {
      expect(bearableRank(major)).toBe(major + 1)
    }
  })
})

describe('Phase 32.3:材料认知与加权技艺', () => {
  it('空方子视为认知圆满(不因无料而扣分)', () => {
    expect(materialLoreOf([], () => 0)).toBe(1)
  })

  it('认知度取方中各味的均值,并在上限处截断', () => {
    const mats = ['a', 'b']
    expect(materialLoreOf(mats, () => LORE_MAX)).toBeCloseTo(1, 6)
    expect(materialLoreOf(mats, () => 0)).toBe(0)
    // 超出上限的脏数据不应把均值顶过 1
    expect(materialLoreOf(mats, () => LORE_MAX + 5)).toBeCloseTo(1, 6)
    expect(materialLoreOf(mats, id => (id === 'a' ? LORE_MAX : 0))).toBeCloseTo(0.5, 6)
  })

  it('加权技艺只看方子吃重的那几项,与无关技艺无涉', () => {
    const craft = { rank: 3, materials: [], skills: { condense: 0.6, flame: 0.4 } }
    expect(weightedSkill(craft, () => 100)).toBeCloseTo(100, 6)
    expect(weightedSkill(craft, id => (id === 'condense' ? 100 : 0))).toBeCloseTo(60, 6)
    // 铭纹是炼器技艺,再高也帮不上这张丹方
    expect(weightedSkill(craft, id => (id === 'inscribe' ? 100 : 0))).toBeCloseTo(0, 6)
  })
})

describe('Phase 32.3:丹方工艺表完整性', () => {
  it('每张可炼丹方都有工艺定义,且技艺权重和为 1', () => {
    const recipes = PILLS.filter(p => p.recipe)
    expect(recipes.length).toBeGreaterThan(0)
    for (const p of recipes) {
      const craft = recipeCraft(p)
      expect(craft, `${p.name} 缺工艺定义`).not.toBeNull()
      const sum = Object.values(craft!.skills).reduce((a, b) => a + (b ?? 0), 0)
      expect(sum, `${p.name} 权重和 ${sum}`).toBeCloseTo(1, 6)
      expect(craft!.rank).toBeGreaterThanOrEqual(1)
      expect(craft!.rank).toBeLessThanOrEqual(9)
    }
  })

  it('方中每一味灵材都在灵材谱里存在(无悬空引用)', () => {
    const known = new Set(MATERIALS.map(m => m.id))
    for (const p of PILLS.filter(x => x.recipe)) {
      for (const mid of recipeCraft(p)!.materials) {
        expect(known.has(mid), `${p.name} 引用了未定义灵材 ${mid}`).toBe(true)
      }
    }
  })

  it('材料不重复,且至少一味', () => {
    for (const p of PILLS.filter(x => x.recipe)) {
      const mats = recipeCraft(p)!.materials
      expect(mats.length).toBeGreaterThan(0)
      expect(new Set(mats).size).toBe(mats.length)
    }
  })
})

describe('Phase 32.3:技艺熟练度曲线', () => {
  it('从 0 起步,单调递增,渐近 100 而不达', () => {
    expect(skillLevelFromExp(0)).toBe(0)
    expect(skillLevelFromExp(-100)).toBe(0)
    let prev = -1
    for (const exp of [10, 100, 600, 3000, 20000, 1e6]) {
      const lv = skillLevelFromExp(exp)
      expect(lv).toBeGreaterThan(prev)
      expect(lv).toBeLessThan(100)
      prev = lv
    }
    expect(skillLevelFromExp(1e9)).toBeGreaterThan(99.9)
  })

  it('境地分档覆盖全区间且不跳档', () => {
    console.log('\n  技艺境地:')
    for (const lv of [0, 10, 25, 40, 58, 72, 85, 94, 100]) {
      const name = skillStageName(lv)
      expect(name.length).toBeGreaterThan(0)
      console.log(`    ${lv.toString().padStart(3)} → ${name}`)
    }
    expect(skillStageName(0)).toBe('生疏')
    expect(skillStageName(99)).toBe('大成')
  })
})

describe('Phase 32.3:认知检定', () => {
  it('辨识概率随技艺升、随阶位降,且始终留有一线', () => {
    expect(discernChance(1, 100, 0)).toBeGreaterThan(discernChance(1, 0, 0))
    expect(discernChance(8, 50, 0)).toBeLessThan(discernChance(1, 50, 0))
    // 最难的情况也不为 0 —— 见得多总有认出来的一天
    expect(discernChance(9, 0, 0)).toBeGreaterThan(0)
    expect(discernChance(1, 100, 999)).toBeLessThanOrEqual(0.9)
  })

  it('照面次数给保底,但边际收益封顶', () => {
    const a = discernChance(5, 20, 0)
    const b = discernChance(5, 20, 10)
    const c = discernChance(5, 20, 1000)
    expect(b).toBeGreaterThan(a)
    expect(c - b).toBeLessThan(0.2)
  })

  it('知性需要足够照面,不到次数一律为 0', () => {
    expect(natureChance(1, 100, 100, SEEN_FOR_NATURE - 1)).toBe(0)
    expect(natureChance(1, 100, 100, SEEN_FOR_NATURE)).toBeGreaterThan(0)
  })

  it('知性吃专业技艺:锻打/辨药高则更易通性', () => {
    const low = natureChance(4, 30, 0, 10)
    const high = natureChance(4, 30, 100, 10)
    expect(high).toBeGreaterThan(low)
    console.log(`\n  四阶灵材知性:技艺 0 → ${(low * 100).toFixed(1)}% / 技艺 100 → ${(high * 100).toFixed(1)}%`)
  })
})

describe('Phase 32.3:端到端口径 —— 开局到大师', () => {
  /** 用真实丹方走一遍完整链路,确认"知识决定成败"不是纸上谈兵 */
  function rateFor(pillId: string, mastery: number, lore: number, skill: number, major: number): number {
    const def = PILLS.find(p => p.id === pillId)!
    const craft = recipeCraft(def)!
    const matLore = materialLoreOf(craft.materials, () => lore)
    return composeSuccessRate(mastery, matLore, skill, Math.max(0, craft.rank - bearableRank(major)))
  }

  /** 开局实况:三张方子烂熟(掌握度 1)、方中药仅「已辨识」、技艺有 STARTER_SKILL_EXP 的底子 */
  const DAY_ONE_SKILL = skillLevelFromExp(200)

  it('首炉不是必输:开局聚气散把握在四分之一以上', () => {
    const day1 = rateFor('p_jvqisan', 1, 1, DAY_ONE_SKILL, 0)
    console.log(`\n  开局首炉聚气散:${(day1 * 100).toFixed(1)}%(技艺 ${DAY_ONE_SKILL.toFixed(0)},药材仅已辨识)`)
    // 低于 25% 意味着五炉炸四炉,那是劝退不是设计
    expect(day1).toBeGreaterThan(0.25)
    // 高于 50% 则开局就不用学了,失去了整个体系的意义
    expect(day1).toBeLessThan(0.5)
  })

  it('同一张方子,只补药材认知不动技艺,把握显著上抬', () => {
    console.log('\n  聚气散随药材认知的成长:')
    const curve = [0, 1, 2, 3].map(stage => rateFor('p_jvqisan', 1, stage, DAY_ONE_SKILL, 0))
    for (const [i, v] of curve.entries()) {
      console.log(`    ${LORE_STAGE_NAMES[i]}:${(v * 100).toFixed(1)}%`)
    }
    // 严格单调:多认识一层药,就该多一分把握
    for (let i = 1; i < curve.length; i += 1) expect(curve[i]!).toBeGreaterThan(curve[i - 1]!)
    // 从"叫不出名字"到"通晓用法",光靠认药就该有实质飞跃
    expect(curve[3]! / curve[0]!).toBeGreaterThan(1.8)
  })

  it('老手几乎必成,且成的是同一张方子', () => {
    const master = rateFor('p_jvqisan', 1, LORE_MAX, 100, 0)
    console.log(`\n  大师炼聚气散:${(master * 100).toFixed(1)}%`)
    expect(master).toBeCloseTo(CRAFT_BASE_RATE, 6)
  })

  it('高阶方子对新手是灾难,对老手才是买卖', () => {
    const novice = rateFor('p_jiuzhuan', 0.2, 0, DAY_ONE_SKILL, 0)
    const master = rateFor('p_jiuzhuan', 1, LORE_MAX, 100, 8)
    console.log(`\n  九转还魂丹:新手 ${(novice * 100).toFixed(3)}% → 老手 ${(master * 100).toFixed(1)}%`)
    expect(novice).toBeLessThan(0.02)
    expect(master).toBeGreaterThan(0.8)
  })

  it('丹方掌握度本身也是一条独立的成长轴', () => {
    const raw = rateFor('p_huichun', 0.1, 1, DAY_ONE_SKILL, 1)
    const fluent = rateFor('p_huichun', 1, 1, DAY_ONE_SKILL, 1)
    console.log(`  回灵丹(药材技艺不变,只把方子读熟):${(raw * 100).toFixed(1)}% → ${(fluent * 100).toFixed(1)}%`)
    expect(fluent / raw).toBeGreaterThan(2.5)
  })
})
