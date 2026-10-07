import { describe, expect, it } from 'vitest'
import { jaccardDistance } from './setMath'

describe('jaccardDistance', () => {
  it('两个空集视为完全相同,距离为 0', () => {
    expect(jaccardDistance(new Set(), new Set())).toBe(0)
  })

  it('同样的集合距离为 0,互斥的集合距离为 1', () => {
    expect(jaccardDistance(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(0)
    expect(jaccardDistance(new Set(['a']), new Set(['b']))).toBe(1)
  })

  it('部分重合给出对称的中间值', () => {
    const a = new Set(['a', 'b', 'c'])
    const b = new Set(['c', 'd'])
    // 交集 1,并集 4 → 1 - 1/4 = 0.75
    expect(jaccardDistance(a, b)).toBeCloseTo(0.75)
    expect(jaccardDistance(b, a)).toBeCloseTo(0.75)
  })
})
