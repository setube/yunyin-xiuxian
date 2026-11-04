/**
 * 修行画像的行为三录。
 *
 * 画像弹窗原先只有四行根因与一段叙事,而 core 算出的 traits 整块没有任何界面读过 ——
 * 「此修士问剑之相已现」读得到,「凭什么」读不到。
 *
 * 判据:
 *   一 只转发 core 的数:三行计数与 traits.counters 同一份账,不另算。
 *   二 风险倾向的说法由 core 的 riskBias 决定,本层不重判阈值。
 *   三 刻度以本组最大值为满格 —— 三项量级差得远,共尺会把最小的压没。
 *   四 三项全 0 且无特征词时整块不出,空态只报状态词。
 *   五 界面真的接上了。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CultivatorIdentity } from '@/core/identityService'
import { hasTraitRecord, traitBars, traitRecord } from './traitRecord'

const ROOT = resolve(__dirname, '../..')
const DIALOG = readFileSync(resolve(ROOT, 'src/components/character/IdentityDialog.vue'), 'utf-8')

/** 造一份最简画像:只给 traits,roots 不影响本层 */
function identityWith(traits: Partial<CultivatorIdentity['traits']>): CultivatorIdentity {
  return {
    roots: { fortunes: [], mentor: null, daoPath: null, branches: [], petTemp: null, build: null },
    traits: {
      adjectives: [],
      riskBias: null,
      counters: { kills: 0, explores: 0, breakthroughs: 0 },
      ...traits
    },
    epithet: '云隐散人',
    narrative: ''
  }
}

describe('行为三录 · 一、只转发 core 的数', () => {
  it('三行计数的值就是 traits.counters 的值', () => {
    const rec = traitRecord(identityWith({ counters: { kills: 120, explores: 30, breakthroughs: 7 } }))!
    expect(rec.counters.map(c => c.value)).toEqual([120, 30, 7])
  })

  it('次序固定:交手 · 历练 · 突破', () => {
    const rec = traitRecord(identityWith({}))!
    expect(rec.counters.map(c => c.label)).toEqual(['交手', '历练', '突破'])
  })

  it('坏值不抛错:负数与非数都收成 0', () => {
    const rec = traitRecord(
      identityWith({ counters: { kills: -5, explores: Number.NaN, breakthroughs: 3 } })
    )!
    expect(rec.counters.map(c => c.value)).toEqual([0, 0, 3])
    expect(rec.total).toBe(3)
  })

  it('画像为 null 时返回 null,不给一份假账', () => {
    expect(traitRecord(null)).toBeNull()
  })
})

describe('行为三录 · 二、风险倾向不重判阈值', () => {
  it('core 说 gamble 就是「以险求胜」', () => {
    expect(traitRecord(identityWith({ riskBias: 'gamble' }))!.risk!.label).toBe('以险求胜')
  })

  it('core 说 steady 就是「稳扎稳打」', () => {
    expect(traitRecord(identityWith({ riskBias: 'steady' }))!.risk!.label).toBe('稳扎稳打')
  })

  it('core 未定时不给说法 —— 不凭计数自己猜一个', () => {
    // 计数很多但 core 说未定(例如刚转世还没行为),本层不许自作主张
    const rec = traitRecord(identityWith({ riskBias: null, counters: { kills: 999, explores: 0, breakthroughs: 0 } }))
    expect(rec!.risk).toBeNull()
  })
})

describe('行为三录 · 三、刻度按本组最大值归一', () => {
  it('最大那项满格,其余按比例', () => {
    const rec = traitRecord(identityWith({ counters: { kills: 100, explores: 25, breakthroughs: 50 } }))!
    expect(traitBars(rec)).toEqual([1, 0.25, 0.5])
  })

  it('全 0 时全是 0,不除零', () => {
    const rec = traitRecord(identityWith({ counters: { kills: 0, explores: 0, breakthroughs: 0 } }))!
    expect(traitBars(rec)).toEqual([0, 0, 0])
  })

  it('共尺会把最小的压没 —— 这就是按本组归一的理由', () => {
    // 交手 5000、突破 3:按总额归一的话突破只占 0.06%,条长不足一个像素
    const rec = traitRecord(identityWith({ counters: { kills: 5000, explores: 100, breakthroughs: 3 } }))!
    const bars = traitBars(rec)
    expect(bars[0]).toBe(1)
    expect(bars[2]).toBeGreaterThan(0)
    // 仍是「彼此相对」而不是「都接近满」
    expect(bars[2]).toBeLessThan(bars[1]!)
  })
})

describe('行为三录 · 四、空态整块不出', () => {
  it('三项全 0 且无特征词 → 不出', () => {
    expect(hasTraitRecord(traitRecord(identityWith({})))).toBe(false)
  })

  it('有任意一项计数 → 出', () => {
    expect(hasTraitRecord(traitRecord(identityWith({ counters: { kills: 1, explores: 0, breakthroughs: 0 } })))).toBe(true)
  })

  it('无计数但有特征词 → 也出(画像已经有话说了)', () => {
    expect(hasTraitRecord(traitRecord(identityWith({ adjectives: ['剑心'] })))).toBe(true)
  })

  it('null 不出', () => {
    expect(hasTraitRecord(null)).toBe(false)
  })
})

describe('行为三录 · 五、界面接上了', () => {
  it('画像弹窗按 traitRows 铺,不再只列四行根因', () => {
    expect(DIALOG).toContain('traitRecord')
    expect(DIALOG).toMatch(/v-for="c in traitRows\.counters"/)
  })

  it('特征词与风险倾向都摆出来了 —— 叙事里那句话要有来路', () => {
    expect(DIALOG, '特征词').toContain('traitRows.adjectives')
    expect(DIALOG, '风险倾向').toContain('traitRows.risk')
  })

  it('整块由 hasTraitRecord 把门,空态不摆一片零', () => {
    expect(DIALOG).toContain('hasTraitRecord')
  })
})
