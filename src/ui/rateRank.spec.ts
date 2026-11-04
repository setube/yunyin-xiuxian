/**
 * 胜率 → 五档说法。
 *
 * 这个换算原被抄了三份:core/compare、core/lab 各有一份逐字相同的 RANK_TEXT 与判档函数,
 * core/expedition 又内联了一遍三元链。阈值一样,措辞漂移 —— 改一处另两处不跟。
 *
 * 判据:
 *   一 阈值只有一份,边界取「≥」:0.85 恰是最高档下界,差一点就掉档。
 *   二 五档说法与档位一一对应,文字与星数同源。
 *   三 坏值按最悬处理 —— 算不出来时少承诺。
 *   四 三个调用点都走这一份,不各写一遍。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { rateLabels, rateRank, rateStars, rateStarsText, rateText } from './rateRank'

const ROOT = resolve(__dirname, '../..')
const COMPARE = readFileSync(resolve(ROOT, 'src/core/compare.ts'), 'utf-8')
const LAB = readFileSync(resolve(ROOT, 'src/core/lab.ts'), 'utf-8')
const EXPEDITION = readFileSync(resolve(ROOT, 'src/core/expedition.ts'), 'utf-8')

describe('胜率档位 · 一、阈值只有一份,边界取「≥」', () => {
  it('每道线的上下两侧恰差一档', () => {
    expect(rateText(0.85)).toBe('稳操胜券')
    expect(rateText(0.849), '差一点就掉档').toBe('略占上风')
    expect(rateText(0.6)).toBe('略占上风')
    expect(rateText(0.599)).toBe('胜负各半')
    expect(rateText(0.4)).toBe('胜负各半')
    expect(rateText(0.399)).toBe('凶险')
    expect(rateText(0.15)).toBe('凶险')
    expect(rateText(0.149)).toBe('九死一生')
  })

  it('两端:必胜与必败', () => {
    expect(rateText(1)).toBe('稳操胜券')
    expect(rateText(0)).toBe('九死一生')
  })

  it('档位单调不减', () => {
    let prev = -1
    for (let r = 0; r <= 1.0001; r += 0.01) {
      const rank = rateRank(r)
      expect(rank, `rate=${r.toFixed(2)} 的档位回退了`).toBeGreaterThanOrEqual(prev)
      prev = rank
    }
  })
})

describe('胜率档位 · 二、说法与星数同源', () => {
  it('五档各有说法,不重不漏', () => {
    const labels = rateLabels()
    expect(labels).toHaveLength(5)
    expect(new Set(labels).size).toBe(5)
  })

  it('档位与说法一一对应', () => {
    for (let rank = 0; rank < 5; rank++) {
      expect(rateLabels()[rank]).toBeTruthy()
      expect(rateStars(rank === 0 ? 0 : [0.15, 0.4, 0.6, 0.85][rank - 1]!)).toBe(rank + 1)
    }
  })

  it('星串恒为五格 —— 长短不一会让 tabular 列错位', () => {
    for (let r = 0; r <= 1.0001; r += 0.02) {
      expect(rateStarsText(r)).toHaveLength(5)
      expect(rateStarsText(r)).toMatch(/^★*☆*$/)
    }
  })

  it('星数与档位同源:最少 1 星、最多 5 星', () => {
    expect(rateStars(0)).toBe(1)
    expect(rateStars(1)).toBe(5)
  })
})

describe('胜率档位 · 三、坏值按最悬处理', () => {
  it('NaN / Infinity 落到最悬那一档 —— 算不出来时少承诺', () => {
    expect(rateText(Number.NaN)).toBe('九死一生')
    expect(rateText(Number.POSITIVE_INFINITY)).toBe('九死一生')
    expect(rateStars(Number.NaN)).toBe(1)
  })

  it('负数与超一都不崩', () => {
    expect(rateText(-5)).toBe('九死一生')
    expect(rateText(9)).toBe('稳操胜券')
  })
})

describe('胜率档位 · 四、三个调用点同用一份', () => {
  it('三处都不再自己写阈值链', () => {
    for (const [src, name] of [
      [COMPARE, 'core/compare'],
      [LAB, 'core/lab'],
      [EXPEDITION, 'core/expedition']
    ] as const) {
      expect(src, `${name}又写了一份 0.85/0.6/0.4/0.15 链`).not.toMatch(/>=\s*0\.85\s*\?\s*[0-9]/)
    }
  })

  it('三处都从 ui/rateRank 取', () => {
    for (const [src, name] of [
      [COMPARE, 'core/compare'],
      [LAB, 'core/lab'],
      [EXPEDITION, 'core/expedition']
    ] as const) {
      expect(src, `${name}该走 ui/rateRank`).toContain("from '@/ui/rateRank'")
    }
  })

  it('五档说法只此一份:别处不许再出现整组', () => {
    const group = "'九死一生', '凶险', '胜负各半', '略占上风', '稳操胜券'"
    for (const [src, name] of [
      [COMPARE, 'core/compare'],
      [LAB, 'core/lab'],
      [EXPEDITION, 'core/expedition']
    ] as const) {
      expect(src, `${name}又抄了一整组说法`).not.toContain(group)
    }
  })
})
