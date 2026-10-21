/**
 * 资源 store —— 天道熔炉跨品扣款(spendHerbMeltable)的原子性
 *
 * 熔炉的草按「仙品起、按总和算、自低品起扣、余数保留」实扣。这里的红线是原子性:
 * 与其余 spend(spendSmall/spendStone/spendHerb)同契约 —— 不足则不吐、失败不得白扣,
 * 否则一次「熔不动」竟把可熔草啃成 0(历史缺陷,见 spendHerbMeltable 注释)。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useResourcesStore } from './resources'
import { gn } from '@/utils/gnum'

describe('天道熔炉 · spendHerbMeltable 原子扣款', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('可熔总数不足:返回 false 且一枚不动(失败不白扣)', () => {
    const res = useResourcesStore()
    res.$patch({ herbByGrade: { 1: 0, 2: 0, 3: 5, 4: 0, 5: 0 } })
    expect(res.spendHerbMeltable(10)).toBe(false)
    expect(res.herbMeltable, '失败后可熔草一枚都不能少').toBe(5)
    expect(res.spendHerbMeltable(6)).toBe(false)
    expect(res.herbByGrade[3], '失败后仙品草原样保留').toBe(5)
  })

  it('可熔总数恰够:跨品实扣、自低品起扣、余数保留,返回 true', () => {
    const res = useResourcesStore()
    res.$patch({ herbByGrade: { 1: 9, 2: 9, 3: 5, 4: 3, 5: 0 } }) // 凡/灵不入炉,一律不动
    expect(res.spendHerbMeltable(7)).toBe(true)
    expect(res.herbByGrade).toEqual({ 1: 9, 2: 9, 3: 0, 4: 1, 5: 0 }) // 3→5 尽扣、再从 4 扣 2,余 1
    expect(res.herbMeltable).toBe(1)
    expect(res.spendHerbMeltable(1)).toBe(true)
    expect(res.herbMeltable).toBe(0)
  })

  it('整品恰好扣完:扣成 0 仍算成功', () => {
    const res = useResourcesStore()
    res.$patch({ herbByGrade: { 1: 0, 2: 0, 3: 5, 4: 0, 5: 0 } })
    expect(res.spendHerbMeltable(5)).toBe(true)
    expect(res.herbMeltable).toBe(0)
    expect(res.spendHerbMeltable(1)).toBe(false) // 已空,连 1 也不动
  })
})

describe('资源公共写入边界 · 非有限值与反向扣款', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('灵草入账只认有限正数:NaN / Infinity / 负数 / 0 全都不动账', () => {
    const res = useResourcesStore()
    for (const bad of [NaN, Infinity, -Infinity, -5, 0]) res.addHerb(1, bad)
    expect(res.herbByGrade[1], '坏增量不能把库存写成 NaN 或负数').toBe(0)
    res.addHerb(1, 2.9)
    expect(res.herbByGrade[1], '正常入账仍向下取整').toBe(2)
  })

  it('灵草扣款拒绝负数与非有限值,0 保持成功且不动账', () => {
    const res = useResourcesStore()
    res.addHerb(1, 5)
    expect(res.spendHerb(1, -5), '负扣款不得反向加草').toBe(false)
    expect(res.spendHerb(1, NaN), 'NaN 不得把余额扣成 NaN').toBe(false)
    expect(res.spendHerb(1, Infinity), '无限扣款必须拒绝').toBe(false)
    expect(res.spendHerb(9 as never, 1), '认不出的品阶不得写出 NaN 账').toBe(false)
    expect(res.herbByGrade[1]).toBe(5)
    expect(res.spendHerb(1, 0), '零扣款仍按成功且不动账').toBe(true)
    expect(res.herbByGrade[1]).toBe(5)
  })

  it('单标量材料同样挡住 NaN 入账与负扣款', () => {
    const res = useResourcesStore()
    res.addSmall('ore', NaN)
    res.addSmall('ore', Infinity)
    res.addSmall('ore', -5)
    expect(res.ore).toBe(0)
    res.addSmall('ore', 10)
    expect(res.spendSmall('ore', -5), '负扣款不得反向加矿').toBe(false)
    expect(res.spendSmall('ore', NaN)).toBe(false)
    expect(res.ore).toBe(10)
    expect(res.spendSmall('ore', 0)).toBe(true)
    expect(res.ore).toBe(10)
  })

  it('灵石入账与扣款挡住负大数与坏大数', () => {
    const res = useResourcesStore()
    res.addStone(gn(10))
    res.addStone({ m: -1, e: 0 })
    expect(res.spiritStone, '负大数不得反向扣石').toEqual(gn(10))
    expect(res.spendStone({ m: -1, e: 0 }), '负扣款不得反向加石').toBe(false)
    expect(res.spendStone({ m: NaN, e: 0 })).toBe(false)
    expect(res.spiritStone).toEqual(gn(10))
  })

  it('熔炉跨品扣款遇到 NaN 不进入逐品扣料循环', () => {
    const res = useResourcesStore()
    res.$patch({ herbByGrade: { 1: 0, 2: 0, 3: 5, 4: 0, 5: 0 } })
    expect(res.spendHerbMeltable(NaN)).toBe(false)
    expect(res.herbByGrade[3], 'NaN 不得把可熔草写成 NaN').toBe(5)
  })
})
