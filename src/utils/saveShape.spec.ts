/**
 * 存档价格 / 非负整数守卫 —— 坊市与悬赏共用的那两条。
 *
 * 这两条判据此前在坊市、悬赏各写一份:改一处便漂一处,坏档里半个 GNum
 * 或负数索引会让算价/上货一路算出 NaN。收拢到 saveShape 后在这里钉住契约。
 */
import { describe, expect, it } from 'vitest'
import { asNonNegInt, asPrice } from './saveShape'

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
