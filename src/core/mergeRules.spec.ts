/**
 * 道途规则与世界/试炼规则的合并。
 *
 * mergeRules 把两套 CombatRules 压成一套,**每个字段的合并语义都不一样**:
 *   倍率类(playerAtkMult / enemyHpMult / healMult)  → 相乘
 *   上限类(maxRounds / shieldCapRatio / playerStartHpPct) → 取小
 *   ExtraMods 类                                     → 逐键相加
 *   perRounds                                        → 只取左值(a),右侧被忽略
 * 任一条写错都不会报错,只会让某一侧的规则悄悄失效。本条逐类钉住。
 *
 * 特别注意 perRounds:它只取左值,是因为契约规则禁止携带它(data/lifeTrials 的
 * adverseViolations 会拒绝)。这条依赖关系也一并钉在这里 —— 若哪天契约真的带上
 * perRounds,合并会静默丢掉右侧,而那正是本文件要防的事。
 */
import { describe, expect, it } from 'vitest'
import { mergeRules } from './gauntlet'
import { adverseViolations } from '@/data/lifeTrials'
import type { CombatRules } from '@/types'

describe('规则合并 · 空值短路', () => {
  it('任一侧缺失时直接返回另一侧(连对象都不新建)', () => {
    const a: CombatRules = { healMult: 0.5 }
    const b: CombatRules = { healMult: 0.8 }
    expect(mergeRules(undefined, b)).toBe(b)
    expect(mergeRules(a, undefined)).toBe(a)
    expect(mergeRules(undefined, undefined)).toBeUndefined()
  })
})

describe('规则合并 · 乘性倍率相乘', () => {
  it('三个乘性字段都是 a×b', () => {
    const r = mergeRules(
      { playerAtkMult: 1.5, enemyAtkMult: 0.9, enemyHpMult: 2 },
      { playerAtkMult: 0.8, enemyAtkMult: 1.1, enemyHpMult: 1.25 }
    )!
    expect(r.playerAtkMult).toBeCloseTo(1.2, 10)
    expect(r.enemyAtkMult).toBeCloseTo(0.99, 10)
    expect(r.enemyHpMult).toBeCloseTo(2.5, 10)
  })

  it('缺失的一侧按 1 处理(中性元)', () => {
    const only = mergeRules({ playerAtkMult: 2 }, {})!
    expect(only.playerAtkMult).toBe(2)
  })

  it('治疗倍率同样相乘:两个减半叠加成四分之一', () => {
    expect(mergeRules({ healMult: 0.5 }, { healMult: 0.5 })!.healMult).toBeCloseTo(0.25, 10)
  })
})

describe('规则合并 · 上限类取小', () => {
  it('maxRounds 取较小者(谁先结束听谁的)', () => {
    expect(mergeRules({ maxRounds: 30 }, { maxRounds: 50 })!.maxRounds).toBe(30)
    expect(mergeRules({ maxRounds: 50 }, { maxRounds: 30 })!.maxRounds).toBe(30)
  })

  it('maxRounds 只在两侧都缺时为 undefined', () => {
    expect(mergeRules({}, {})!.maxRounds).toBeUndefined()
    expect(mergeRules({ maxRounds: 40 }, {})!.maxRounds).toBe(40)
  })

  it('shieldCapRatio 取较小者', () => {
    expect(mergeRules({ shieldCapRatio: 0.5 }, { shieldCapRatio: 0.8 })!.shieldCapRatio).toBe(0.5)
  })

  it('playerStartHpPct 取较小者', () => {
    expect(mergeRules({ playerStartHpPct: 0.6 }, { playerStartHpPct: 0.9 })!.playerStartHpPct).toBeCloseTo(0.6, 10)
  })

  it('playerStartHpPct 在两侧都缺时给 1 而非 undefined —— 调用方都按 `?? 1` 读,行为等价', () => {
    // 这条记录当前写法与其它上限字段不一致(其它给 undefined),但它不影响行为
    expect(mergeRules({}, {})!.playerStartHpPct).toBe(1)
  })
})

describe('规则合并 · ExtraMods 逐键相加', () => {
  it('同键相加,不同键保留', () => {
    const r = mergeRules({ playerExtraMods: { critRate: 0.1, speed: 5 } }, { playerExtraMods: { critRate: 0.05, luck: 2 } })!
    expect(r.playerExtraMods!.critRate).toBeCloseTo(0.15, 10)
    expect(r.playerExtraMods!.speed).toBe(5)
    expect(r.playerExtraMods!.luck).toBe(2)
  })

  it('敌方侧同理', () => {
    const r = mergeRules({ enemyExtraMods: { dodgeRate: 0.1 } }, { enemyExtraMods: { dodgeRate: 0.2, critRate: 0.1 } })!
    expect(r.enemyExtraMods!.dodgeRate).toBeCloseTo(0.3, 10)
    expect(r.enemyExtraMods!.critRate).toBeCloseTo(0.1, 10)
  })

  it('单侧缺失时原样取有值的一侧', () => {
    const side: CombatRules = { playerExtraMods: { critRate: 0.1 } }
    expect(mergeRules(side, {})!.playerExtraMods).toEqual({ critRate: 0.1 })
    expect(mergeRules({}, side)!.playerExtraMods).toEqual({ critRate: 0.1 })
  })

  it('合计为 0 的键仍保留(相加后不清零键)', () => {
    const r = mergeRules({ playerExtraMods: { critRate: 0.1 } }, { playerExtraMods: { critRate: -0.1 } })!
    expect(r.playerExtraMods!.critRate).toBeCloseTo(0, 10)
  })
})

describe('规则合并 · perRounds 只取左值', () => {
  it('两侧都有时保留 a,不动 b', () => {
    const perA = { interval: 3, playerHealPct: 0.06, playerShieldPct: 0, enemyAtkGrowth: 0.05 }
    const perB = { interval: 5, playerHealPct: 0.04, playerShieldPct: 0.04, enemyAtkGrowth: 0.06 }
    expect(mergeRules({ perRounds: perA }, { perRounds: perB })!.perRounds).toBe(perA)
  })

  it('只有 b 有时取 b(右值不会丢)', () => {
    const perB = { interval: 5, playerHealPct: 0.04, playerShieldPct: 0.04, enemyAtkGrowth: 0.06 }
    expect(mergeRules({}, { perRounds: perB })!.perRounds).toBe(perB)
  })

  it('契约规则不得携带 perRounds —— 这是上一条「只取左值」成立的前提', () => {
    const per = { interval: 5, playerHealPct: 0.04, playerShieldPct: 0.04, enemyAtkGrowth: 0.06 }
    expect(adverseViolations({ perRounds: per }), 'perRounds 是增益结构,必须被契约校验拒绝').not.toHaveLength(0)
    // 反向锚点:不带 perRounds 的纯逆境规则不该因此被拒
    expect(adverseViolations({ enemyAtkMult: 1.2 })).toHaveLength(0)
  })
})
