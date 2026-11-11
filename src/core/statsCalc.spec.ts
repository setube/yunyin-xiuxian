/**
 * 属性汇总:同键相加、条件词条按贡献递减、软阈值削顶。
 * 三条最容易改坏的约定:递减只对正值生效(负值直接相加)、权重按贡献从大到小分配、
 * 软阈值缩放后各来源明细之和仍等于面板值(明细与总数不许对不上)。
 */
import { describe, expect, it } from 'vitest'
import type { StatMods } from '@/types'
import { DIMINISH_KEYS, DIMINISH_WEIGHTS, SOFT_CAPS } from '@/data/constants'
import { capChance, computeFinalStats, effectiveDaoFruit, isSoftCapped, mergeMods, mergeModsDetailed, modDepth, modOf, type StatsInput } from './statsCalc'
import { gnZero, toNum } from '@/utils/gnum'

/** 取一个确定在 DIMINISH_KEYS 里的键与其对应的软上限键(两者无关,各取各的) */
const DIMINISH_KEY = DIMINISH_KEYS[0]!
const PLAIN_KEY = 'attackPct' as const
const CAPPED_KEY = Object.keys(SOFT_CAPS)[0]! as keyof StatMods
const RULE = SOFT_CAPS[CAPPED_KEY]!

describe('合并词条 · 普通词条', () => {
  it('同键直接相加', () => {
    expect(mergeMods([{ attackPct: 0.1 }, { attackPct: 0.2 }])).toEqual({ attackPct: 0.30000000000000004 })
    expect(modOf(mergeMods([{ attackPct: 0.1 }, { attackPct: 0.2 }]), PLAIN_KEY)).toBeCloseTo(0.3)
  })

  it('空来源与空对象不炸', () => {
    expect(mergeMods([])).toEqual({})
    expect(mergeMods([{}])).toEqual({})
  })

  it('负值与正值照样相加,不吃递减', () => {
    const merged = mergeMods([{ attackPct: 0.3 }, { attackPct: -0.1 }])
    expect(modOf(merged, PLAIN_KEY)).toBeCloseTo(0.2)
  })
})

describe('合并词条 · 条件词条递减', () => {
  it('单个来源拿满权重', () => {
    const merged = mergeMods([{ [DIMINISH_KEY]: 0.5 }])
    expect(modOf(merged, DIMINISH_KEY)).toBeCloseTo(0.5 * DIMINISH_WEIGHTS[0]!)
  })

  it('多来源按贡献从大到小配权重', () => {
    const merged = mergeMods([
      { [DIMINISH_KEY]: 0.1 }, // 最小,最后配
      { [DIMINISH_KEY]: 0.4 }, // 最大,先配
      { [DIMINISH_KEY]: 0.2 }
    ])
    const expected = 0.4 * 1 + 0.2 * 0.75 + 0.1 * 0.5
    expect(modOf(merged, DIMINISH_KEY), '排序错了结果就不同').toBeCloseTo(expected)
  })

  it('超过权重档数时,多出来的按最后一档计', () => {
    const sources = Array.from({ length: DIMINISH_WEIGHTS.length + 2 }, () => ({ [DIMINISH_KEY]: 0.1 }))
    const merged = mergeMods(sources)
    const last = DIMINISH_WEIGHTS[DIMINISH_WEIGHTS.length - 1]!
    const expected = 0.1 * DIMINISH_WEIGHTS.reduce((a, b) => a + b, 0) + 0.1 * last * 2
    expect(modOf(merged, DIMINISH_KEY)).toBeCloseTo(expected)
  })

  it('负值不参与递减,直接加进结果', () => {
    // 递减只对 v > 0 生效:负值走 else 分支
    const merged = mergeMods([{ [DIMINISH_KEY]: 0.4 }, { [DIMINISH_KEY]: -0.1 }])
    expect(modOf(merged, DIMINISH_KEY)).toBeCloseTo(0.4 * DIMINISH_WEIGHTS[0]! + -0.1)
  })
})

describe('合并词条 · 软阈值', () => {
  it('未超阈值时原样保留', () => {
    const merged = mergeMods([{ [CAPPED_KEY]: RULE.cap - 0.01 }])
    expect(modOf(merged, CAPPED_KEY)).toBeCloseTo(RULE.cap - 0.01)
    expect(isSoftCapped(merged, CAPPED_KEY)).toBe(false)
  })

  it('超过阈值后按 diminish 削顶', () => {
    const raw = RULE.cap + 0.2
    const merged = mergeMods([{ [CAPPED_KEY]: raw }])
    expect(modOf(merged, CAPPED_KEY)).toBeCloseTo(RULE.cap + 0.2 * RULE.diminish)
    expect(isSoftCapped(merged, CAPPED_KEY), '恰好进入递减区').toBe(true)
  })

  it('等于阈值时算「已进入递减区」(判据用 >=)', () => {
    expect(isSoftCapped(mergeMods([{ [CAPPED_KEY]: RULE.cap }]), CAPPED_KEY)).toBe(true)
  })

  it('明细之和等于面板值:缩放后两边不许对不上', () => {
    const sources: StatMods[] = [{ [CAPPED_KEY]: RULE.cap + 0.3 }, { [CAPPED_KEY]: 0.1 }]
    const { mods, effective } = mergeModsDetailed(sources)
    const sum = effective.reduce((acc, b) => acc + (b[CAPPED_KEY] ?? 0), 0)
    expect(sum, '各来源明细相加应等于合并后的值').toBeCloseTo(modOf(mods, CAPPED_KEY))
  })
})

describe('工具函数', () => {
  it('modOf 缺键返回 0', () => {
    expect(modOf({}, PLAIN_KEY)).toBe(0)
  })

  it('capChance 夹到 [0,1]', () => {
    expect(capChance(-1)).toBe(0)
    expect(capChance(0.5)).toBe(0.5)
    expect(capChance(2)).toBe(1)
  })

  /**
   * NaN 不得穿过。
   *
   * 调用点全是 `rng.chance(capChance(...))`,判据是 `rand() < p`:
   * p 为 NaN 时恒为 false,该效果从此永远不触发 —— 不崩不报,只是玩家那一身词条静默失效。
   * 这是「Math.max/min 挡不住 NaN」那条坑在玩法上的真实后果,不只是显示问题。
   */
  it('capChance 挡住 NaN,不让效果静默失效', () => {
    expect(capChance(NaN), 'NaN 该归 0(不触发),而不是原样漏出去').toBe(0)
    expect(capChance(Infinity)).toBe(1)
    expect(capChance(-Infinity)).toBe(0)
    // 阴性对照:这正是修复前的算式 —— NaN 会原样穿过两道钳制
    expect(Math.min(1, Math.max(0, NaN)), 'Math.min/max 确实挡不住 NaN').toBeNaN()
    // 而 rand() < NaN 恒为 false:词条静默失效
    expect(0.99 < NaN, 'NaN 概率永不触发').toBe(false)
  })

  it('effectiveDaoFruit:0 与负数都归零,正数按幂次衰减', () => {
    expect(effectiveDaoFruit(0)).toBe(0)
    expect(effectiveDaoFruit(-5)).toBe(0)
    expect(effectiveDaoFruit(1)).toBeCloseTo(1)
    expect(effectiveDaoFruit(100)).toBeLessThan(100)
    expect(effectiveDaoFruit(100)).toBeGreaterThan(0)
  })

  it('modDepth 不计三维百分比与修炼速度', () => {
    const mods: StatMods = { attackPct: 0.5, defensePct: 0.5, maxHpPct: 0.5, cultivationSpeed: 0.5 }
    expect(modDepth(mods), '这四项都不算构筑深度').toBe(0)
    expect(modDepth({ damageBonus: 0.3 })).toBeCloseTo(0.3)
    expect(modDepth({ damageBonus: 0.3, attackPct: 9 }), '三维被排除,只算后者').toBeCloseTo(0.3)
  })

  it('modDepth 不计负值与 0', () => {
    expect(modDepth({ damageBonus: -0.5 })).toBe(0)
    expect(modDepth({ damageBonus: 0 })).toBe(0)
  })
})

/**
 * 负加成累积不能把三维压成 0 或负数。
 *
 * 合并时只有 `v > 0` 才进递减折扣,负值直接相加 —— 而「重伤」是 `attackPct: -0.2`。
 * 正常玩法里同一 defId 只留一条,但坏档可能留下多行(见 cultivation.ts 的 dedupe 注释),
 * 多条叠起来就能过 -100%。`Math.max(0.1, …)` 这层兜底正是防这个:
 * 没有它,攻击会算成负数,战斗里的伤害符号就反了。
 *
 * 这条之前没有判据:把三处 Math.max(0.1, …) 删掉,全套测试仍绿。
 */
describe('属性合并 · 负加成累积的下限', () => {
  const input = (pct: number): StatsInput => ({
    major: 0,
    sub: 0,
    linggenMult: 1,
    modSources: [{ attackPct: pct, defensePct: pct, maxHpPct: pct }],
    sourceNames: ['重伤 ×N'],
    equipFlats: { attack: gnZero(), defense: gnZero(), maxHp: gnZero() },
    daoFruit: 0,
    qiRich: false
  })

  it('attackPct 到 -500% 时,三维仍为正(钳在 0.1 倍)', () => {
    const stats = computeFinalStats(input(-5))
    for (const key of ['attack', 'defense', 'maxHp'] as const) {
      const v = toNum(stats[key])
      expect(v, `${key} 被负加成压成了 ${v}`).toBeGreaterThan(0)
      expect(Number.isFinite(v), `${key} 不是有限数`).toBe(true)
    }
  })

  it('负加成超过 -100% 之后,结果不再随幅度变化(已触底)', () => {
    const a = computeFinalStats(input(-1.5))
    const b = computeFinalStats(input(-5))
    expect(toNum(a.attack)).toBeCloseTo(toNum(b.attack), 6)
    expect(toNum(a.attack)).toBeGreaterThan(0)
  })

  it('处在 −50% 时按比例下降,不是一律钳到底', () => {
    const half = computeFinalStats(input(-0.5))
    const none = computeFinalStats(input(0))
    expect(toNum(half.attack)).toBeGreaterThan(0)
    expect(toNum(half.attack)).toBeLessThan(toNum(none.attack))
  })
})
