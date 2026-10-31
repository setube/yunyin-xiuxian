/**
 * 准备度星级:渡劫台账把四个维度的读数折成 0~3 星,结算按星级查表。
 *
 * 它是阈值阶梯函数,此前没有任何测试。这类函数最容易错在两处:
 *   1. 边界用 >= 还是 > —— 恰好等于阈值时落哪一档
 *   2. 阈值本身乱序 —— 三档顺序错了,星级会跳级
 * 本条按 PREP_THRESHOLDS 的真实数值逐档验,不写死一份镜像表。
 */
import { describe, expect, it } from 'vitest'
import { PREP_THRESHOLDS, prepTier, type PrepDimension } from './tribulationDecision'

const DIMS = Object.keys(PREP_THRESHOLDS) as PrepDimension[]

describe('准备度星级', () => {
  it('四个维度都在(缺一维会让对应读数无法分档)', () => {
    expect(DIMS.sort()).toEqual(['burst', 'guard', 'resist', 'sustain'])
  })

  it('每维三个阈值,且严格递增', () => {
    for (const d of DIMS) {
      const t = PREP_THRESHOLDS[d]
      expect(t.length, `${d} 的阈值不是三档`).toBe(3)
      expect(t[0]! < t[1]! && t[1]! < t[2]!, `${d} 的阈值未严格递增`).toBe(true)
    }
  })

  it('边界含等号:恰好等于阈值时进该档', () => {
    for (const d of DIMS) {
      const t = PREP_THRESHOLDS[d]
      expect(prepTier(d, t[0]!), `${d}:等于第一档阈值应得 1 星`).toBe(1)
      expect(prepTier(d, t[1]!), `${d}:等于第二档阈值应得 2 星`).toBe(2)
      expect(prepTier(d, t[2]!), `${d}:等于第三档阈值应得 3 星`).toBe(3)
    }
  })

  it('差一点就掉档(阈值下沿)', () => {
    for (const d of DIMS) {
      const t = PREP_THRESHOLDS[d]
      expect(prepTier(d, t[0]! - 1e-9), `${d}:略低于第一档应得 0 星`).toBe(0)
      expect(prepTier(d, t[1]! - 1e-9), `${d}:略低于第二档应得 1 星`).toBe(1)
      expect(prepTier(d, t[2]! - 1e-9), `${d}:略低于第三档应得 2 星`).toBe(2)
    }
  })

  it('零与负值都是 0 星(不因负数反而升档)', () => {
    for (const d of DIMS) {
      expect(prepTier(d, 0)).toBe(0)
      expect(prepTier(d, -1)).toBe(0)
    }
  })

  it('单调不减:同维内数值越大,星级不会降', () => {
    for (const d of DIMS) {
      const t = PREP_THRESHOLDS[d]
      let prev = -1
      for (const v of [0, t[0]! * 0.5, t[0]!, (t[0]! + t[1]!) / 2, t[1]!, (t[1]! + t[2]!) / 2, t[2]!, t[2]! * 2]) {
        const cur = prepTier(d, v)
        expect(cur, `${d}:v=${v} 时星级回退了`).toBeGreaterThanOrEqual(prev)
        prev = cur
      }
    }
  })

  it('星级恒在 0~3 之间(表外的超大值也封顶)', () => {
    for (const d of DIMS) {
      for (const v of [0, 1, 1e9, Number.MAX_SAFE_INTEGER]) {
        const tier = prepTier(d, v)
        expect(tier).toBeGreaterThanOrEqual(0)
        expect(tier).toBeLessThanOrEqual(3)
      }
    }
  })

  it('各维阈值不同(若两维恰好相同,说明多半是抄错了)', () => {
    const keys = DIMS.map(d => PREP_THRESHOLDS[d].join(','))
    expect(new Set(keys).size, '有两个维度的阈值表完全相同').toBe(keys.length)
  })
})
