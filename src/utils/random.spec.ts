import { describe, expect, it } from 'vitest'
import { RandomService } from './random'
import { randomDaoName } from '@/data/names'

/** mulberry32 落满 [0,1) 之外的上界是最容易踩到的一档:注入常量 1 即整段取空 */
const ALWAYS_TOP = new RandomService(() => 1)

describe('随机服务 · 取的永远是一项真东西', () => {
  it('随机源返回 1 时仍取到末项,不是 undefined', () => {
    expect(ALWAYS_TOP.pick(['甲', '乙', '丙'])).toBe('丙')
  })

  it('随机源返回 1 时道号拼得出一串真字,不是 undefined', () => {
    const name = randomDaoName(ALWAYS_TOP)
    expect(name).not.toContain('undefined')
    expect(name.trim().length).toBeGreaterThan(1)
  })

  it('随机源落在区间内时取首项,寻常掷点不受这次夹取影响', () => {
    expect(new RandomService(() => 0).pick(['甲', '乙'])).toBe('甲')
  })

  it('权重随机在末项落空时回落到末项,不返回 undefined', () => {
    const rng = new RandomService(() => 1)
    expect(rng.weighted([{ w: 1 }, { w: 1 }], x => x.w)).toEqual({ w: 1 })
  })
})
