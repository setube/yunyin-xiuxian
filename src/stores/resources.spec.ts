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
