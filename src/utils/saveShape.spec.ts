/**
 * 存档价格 / 非负整数守卫 —— 坊市与悬赏共用的那两条。
 *
 * 这两条判据此前在坊市、悬赏各写一份:改一处便漂一处,坏档里半个 GNum
 * 或负数索引会让算价/上货一路算出 NaN。收拢到 saveShape 后在这里钉住契约。
 */
import { describe, expect, it } from 'vitest'
import { SKILL_MULT_CAP } from '@/data/constants'
import { asCombatSkill, asCombatSkills, asNonNegInt, asPrice } from './saveShape'

describe('saveShape · asPrice', () => {
  it('形状正确的 GNum 原样读回', () => {
    expect(asPrice({ m: 1.5, e: 3 })).toEqual({ m: 1.5, e: 3 })
  })

  it('缺字段 / 非对象 / NaN 一律归零(不让坏价进算价链路)', () => {
    for (const bad of [undefined, null, 42, '12', {}, { m: 1 }, { m: NaN, e: 2 }, { m: 1, e: Infinity }]) {
      expect(asPrice(bad), `坏样本 ${JSON.stringify(bad)} 应归零`).toEqual({ m: 0, e: 0 })
    }
  })
})

describe('saveShape · asNonNegInt', () => {
  it('有限数字向下取整;负数夹回 0', () => {
    expect(asNonNegInt(3.9, 0)).toBe(3)
    expect(asNonNegInt(-4, 7)).toBe(0)
    expect(asNonNegInt(0, 7)).toBe(0)
  })

  it('非数字(NaN / 字符串 / null)用兜底', () => {
    for (const bad of [NaN, '3', null, undefined, Infinity]) {
      expect(asNonNegInt(bad, 7), `坏样本 ${String(bad)} 应回落 7`).toBe(7)
    }
  })
})

describe('saveShape · asCombatSkill', () => {
  it('合法技能原样保留(含已知附加效果)', () => {
    expect(asCombatSkill({ name: '斩', mult: 2, rate: 0.25, effect: 'pierce' })).toEqual({
      name: '斩',
      mult: 2,
      rate: 0.25,
      effect: 'pierce'
    })
  })

  it('rate 夹到 [0,1]:超过一成必触发、负数永不触发的坏档都回到概率语义', () => {
    expect(asCombatSkill({ name: '必中', mult: 1.2, rate: 999 })!.rate).toBe(1)
    expect(asCombatSkill({ name: '封印', mult: 1.2, rate: -3 })!.rate).toBe(0)
  })

  it('mult 非负且有具名上限:负倍率夹回 0,极大有限数不再一击碾平整场', () => {
    expect(asCombatSkill({ name: '倒吸', mult: -5, rate: 0.5 })!.mult).toBe(0)
    expect(asCombatSkill({ name: '灭世', mult: 1e300, rate: 0.5 })!.mult).toBe(SKILL_MULT_CAP)
  })

  it('缺名字 / 非有限倍率或概率 / 非对象一律剔除', () => {
    for (const bad of [
      null,
      '斩',
      {},
      { name: '', mult: 1, rate: 0.2 },
      { name: '   ', mult: 1, rate: 0.2 },
      { name: '坏', mult: Number.NaN, rate: 0.2 },
      { name: '坏', mult: 1, rate: Infinity }
    ]) {
      expect(asCombatSkill(bad), `坏样本 ${JSON.stringify(bad)} 应剔除`).toBeNull()
    }
  })

  it('认不出的 effect 只去掉附加效果,不影响这一击', () => {
    expect(asCombatSkill({ name: '斩', mult: 2, rate: 0.25, effect: 'ghost_effect' })).toEqual({
      name: '斩',
      mult: 2,
      rate: 0.25
    })
  })

  it('技能表逐条修形,非数组回落空表', () => {
    expect(asCombatSkills(undefined)).toEqual([])
    expect(
      asCombatSkills([
        { name: '斩', mult: 2, rate: 2 },
        { name: '坏', mult: Number.NaN, rate: 0.1 },
        { name: '刺', mult: -1, rate: -1, effect: 'pierce' }
      ])
    ).toEqual([
      { name: '斩', mult: 2, rate: 1 },
      { name: '刺', mult: 0, rate: 0, effect: 'pierce' }
    ])
  })
})
