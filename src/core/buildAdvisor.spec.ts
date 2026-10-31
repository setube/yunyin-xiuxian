import { describe, expect, it } from 'vitest'
import { enemyDef } from '@/data/enemies'
import { regionDef, REGIONS } from '@/data/regions'
import {
  detectionAdaptation,
  ecologyChips,
  enemyTraits,
  recommendForRegion,
  regionEcology,
  starsText,
  styleAdaptation
} from './buildAdvisor'
import { BUILD_STYLES } from './buildDetect'

describe('Build 决策层(区域生态与适配)', () => {
  it('敌人特性由正式数据自动判定', () => {
    expect(enemyTraits(enemyDef('e_brokensword')!)).toContain('pierce')
    expect(enemyTraits(enemyDef('e_zeagle')!)).toContain('multi')
    expect(enemyTraits(enemyDef('e_fox')!)).toContain('dodge')
    expect(enemyTraits(enemyDef('e_wolf')!)).toEqual([])
  })

  it('新手区生态干净,后期区生态复杂', () => {
    const qingyun = regionEcology(regionDef('qingyun')!)
    expect(Object.values(qingyun).every(v => v === 0)).toBe(true)
    const jianzhong = regionEcology(regionDef('jianzhong')!)
    expect(jianzhong.pierce).toBeGreaterThanOrEqual(2)
    const leize = regionEcology(regionDef('leize')!)
    expect(leize.multi).toBeGreaterThanOrEqual(2)
  })

  it('适配评级遵循克制矩阵:真伤压制罡盾,多段喂养反震', () => {
    const pierceHeavy = { burst: 0 as const, multi: 0 as const, pierce: 3 as const, dodge: 0 as const }
    expect(styleAdaptation('gangdun', pierceHeavy).stars).toBeLessThan(3)
    expect(styleAdaptation('beishui', pierceHeavy).stars).toBeGreaterThan(3)
    const leize = regionEcology(regionDef('leize')!)
    expect(styleAdaptation('fanzhen', leize).stars).toBeGreaterThan(3)
    // 首领战:背水占优,连击吃亏
    const neutral = regionEcology(regionDef('qingyun')!)
    expect(styleAdaptation('beishui', neutral, true).stars).toBeGreaterThan(styleAdaptation('lianji', neutral, true).stars)
  })

  it('推荐带评级与理由,而非单一答案', () => {
    const recs = recommendForRegion(regionDef('jianzhong')!)
    expect(recs.length).toBe(6)
    expect(recs[0]!.adaptation.stars).toBeGreaterThanOrEqual(recs[5]!.adaptation.stars)
    expect(recs.some(r => r.adaptation.reasons.length > 0)).toBe(true)
  })

  it('每个区域都能推导生态且不越界', () => {
    for (const region of REGIONS) {
      const eco = regionEcology(region)
      for (const v of Object.values(eco)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(3)
      }
      const chips = ecologyChips(eco)
      expect(chips.length).toBeLessThanOrEqual(4)
    }
  })

describe('混合流派的适配 · 副体系的贡献要看得见', () => {
  // leize 的生态最复杂:主体系单侧就能给满 3 条理由,正是「副体系被挤掉」会显形的场景。
  // 换成理由不足 3 条的生态,旧实现也能让副体系挤进来,那条用例就抓不到回退。
  const eco = regionEcology(regionDef('leize')!)
  const main = BUILD_STYLES.find(s => s.id === 'beishui')!
  const sub = BUILD_STYLES.find(s => s.id !== 'beishui')!

  function mixed(): ReturnType<typeof detectionAdaptation> {
    return detectionAdaptation({ style: main, affinity: 1, secondary: { style: sub, affinity: 0.5 } } as never, eco)
  }

  /**
   * 曾经的缺陷:两侧理由直接拼接后 slice(0,3),而主体系本身就能占满 3 条,
   * 于是副体系的理由永远进不来 —— 星级由两侧共同决定,理由却只解释主体系。
   * 本条钉住「混合时的理由不等于纯主体系时的理由」。
   */
  it('混合流派的理由与纯主体系不同(否则星级变化无从解释)', () => {
    const onlyMain = detectionAdaptation({ style: main, affinity: 1 } as never, eco)
    const both = mixed()
    // 主体系有理由时,混合结果必须能看出副体系进来了
    if (onlyMain.reasons.length > 0) {
      expect(JSON.stringify(both.reasons), '混合流派与纯主体系的理由一模一样,副体系的贡献被截掉了').not.toBe(
        JSON.stringify(onlyMain.reasons)
      )
    }
  })

  it('理由最多三条(UI 只渲染三行,不能悄悄变多)', () => {
    expect(mixed().reasons.length).toBeLessThanOrEqual(3)
    expect(detectionAdaptation({ style: main, affinity: 1 } as never, eco).reasons.length).toBeLessThanOrEqual(3)
  })

  it('没有副体系时,结果与 styleAdaptation 完全一致(不许凭空加料)', () => {
    const only = detectionAdaptation({ style: main, affinity: 1 } as never, eco)
    expect(only).toEqual(styleAdaptation(main.id, eco))
  })

  it('星级按 0.7/0.3 加权,且恒在 1~5', () => {
    for (const a of BUILD_STYLES) {
      for (const b of BUILD_STYLES) {
        if (a.id === b.id) continue
        const r = detectionAdaptation({ style: a, affinity: 1, secondary: { style: b, affinity: 0.5 } } as never, eco)
        expect(r.stars).toBeGreaterThanOrEqual(1)
        expect(r.stars).toBeLessThanOrEqual(5)
        const expected = Math.max(1, Math.min(5, Math.round(styleAdaptation(a.id, eco).stars * 0.7 + styleAdaptation(b.id, eco).stars * 0.3)))
        expect(r.stars, `${a.id}+${b.id} 的加权星级不对`).toBe(expected)
      }
    }
  })

  it('副体系一点理由都没有时,不白占一格,主体系的理由照旧给满', () => {
    // 空生态下每个流派都没有理由,此时行为应与纯主体系一致
    const empty = {} as never
    const both = detectionAdaptation({ style: main, affinity: 1, secondary: { style: sub, affinity: 0.5 } } as never, empty)
    const only = detectionAdaptation({ style: main, affinity: 1 } as never, empty)
    expect(both.reasons).toEqual(only.reasons)
  })
})

describe('星级文案', () => {
  it('starsText 对 1~5 都给得出非空文字,且互不相同', () => {
    const texts = [1, 2, 3, 4, 5].map(s => starsText(s))
    for (const [i, t] of texts.entries()) expect(t.length, `第 ${i + 1} 星没文案`).toBeGreaterThan(0)
    expect(new Set(texts).size, '两档星级文案相同').toBe(5)
  })

  /**
   * starsText 不做钳制(实现就是 '★'.repeat(n) + '☆'.repeat(5-n))。
   * 生产路径上入参都来自 Adaptation.stars,已在 styleAdaptation 里钳到 1~5,
   * 所以这里**不改实现**,只记录真实行为 —— 免得后来者以为它有防御而放心传入未钳的值。
   */
  it('越界星级被钳到 1~5,不抛错也不出五颗空星', () => {
    expect(starsText(1)).toBe('★☆☆☆☆')
    expect(starsText(5)).toBe('★★★★★')
    // 原实现 stars>5 时 '☆'.repeat(负数) 会抛 RangeError,stars<1 会给出五颗空星
    expect(starsText(0)).toBe('★☆☆☆☆')
    expect(starsText(-3)).toBe('★☆☆☆☆')
    expect(starsText(6)).toBe('★★★★★')
    expect(starsText(99)).toBe('★★★★★')
  })

  it('正常路径的五行星输出不变(钳制不影响 1~5)', () => {
    for (let n = 1; n <= 5; n += 1) {
      const text = starsText(n)
      expect(text).toHaveLength(5)
      expect(text.split('★').length - 1, `stars=${n} 的实心星数不对`).toBe(n)
    }
  })
})
})
