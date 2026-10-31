/**
 * 生态健康度仪表盘:分项分要与它自己写出的红线口径一致。
 * 仪表盘的 detail 是给人看的红线说明,分数是给判据看的;两者对不上时,「正好在红线内」会被算成不合格。
 */
import { describe, expect, it } from 'vitest'
import { computeEcosystemHealth, type HealthInput } from './ecosystemHealth'

/** 各项都在红线内的健康输入 */
function healthyInput(over: Partial<HealthInput> = {}): HealthInput {
  return {
    viablePerWorld: [6, 6, 6, 6],
    secondOverBest: [1, 1, 1, 1],
    universalRate: 0,
    trapRate: 0,
    crossWorldCount: 0,
    maxPairSynergy: 1,
    ...over
  }
}

const partOf = (input: HealthInput, name: string): number => {
  const p = computeEcosystemHealth(input).parts.find(x => x.name === name)
  if (!p) throw new Error(`没有「${name}」这一项`)
  return p.score
}

describe('生态健康度 · 分项与红线口径一致', () => {
  it('跨界通吃:红线是 ≤2,那么 0/1/2 个都该是满分', () => {
    for (const n of [0, 1, 2]) {
      expect(partOf(healthyInput({ crossWorldCount: n }), '跨界受限'), `跨界通吃 ${n} 个在红线内`).toBe(100)
    }
  })

  it('跨界通吃:超出红线才扣,且越多越低', () => {
    const s3 = partOf(healthyInput({ crossWorldCount: 3 }), '跨界受限')
    const s4 = partOf(healthyInput({ crossWorldCount: 4 }), '跨界受限')
    expect(s3, '超 1 个应开始扣分').toBeLessThan(100)
    expect(s4, '超得越多分越低').toBeLessThan(s3)
    expect(partOf(healthyInput({ crossWorldCount: 10 }), '跨界受限'), '扣到 0 为止').toBe(0)
  })

  it('万金油:红线 1.5%,红线处归零', () => {
    expect(partOf(healthyInput({ universalRate: 0 }), '万金油抑制')).toBe(100)
    expect(partOf(healthyInput({ universalRate: 0.015 }), '万金油抑制')).toBe(0)
  })
})
