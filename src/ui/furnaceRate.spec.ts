/**
 * 熔炉熔率形制:四类物资的兑换率差三倍多(25/15/60/80),而四行此前长得一样。
 *
 * 四条判据:
 *   一 率条长度与兑换率反向单调 —— 越划算越长,不必读数字也能比。
 *   二 三档用**相对倍数**划线,不用绝对个数:将来整体调价时相对关系不该跟着变。
 *   三 两端由 FURNACE_RATES 现算,不写死 15 与 80。
 *   四 界面真的接上了,率条带可念的说法。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FURNACE_RATES, FURNACE_STONE_DAO_SOURCE, FURNACE_STONE_TIER_AMOUNT } from '@/data/endgame'
import { furnaceMarks, rateFillOf, rateMark, rateTierOf, stonePerDaoSource } from './furnaceRate'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const DIALOG = readFileSync(resolve(ROOT, 'src/components/celestial/FurnaceDialog.vue'), 'utf-8')
const MODULE = readFileSync(resolve(ROOT, 'src/ui/furnaceRate.ts'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('熔率形制 · 一、条长与兑换率反向', () => {
  it('四类都算得出来,长度落在 0~1', () => {
    expect(furnaceMarks().length).toBe(FURNACE_RATES.length)
    for (const m of furnaceMarks()) {
      expect(m.fill).toBeGreaterThan(0)
      expect(m.fill).toBeLessThanOrEqual(1)
    }
  })

  it('越划算(per 越小)条越长', () => {
    const sorted = [...FURNACE_RATES].sort((a, b) => a.per - b.per)
    for (let i = 1; i < sorted.length; i += 1) {
      expect(rateFillOf(sorted[i]!.per), `${sorted[i]!.name} 比 ${sorted[i - 1]!.name} 更不划算,条应更短`)
        .toBeLessThanOrEqual(rateFillOf(sorted[i - 1]!.per))
    }
    // 最划算的那类是满格
    expect(rateFillOf(sorted[0]!.per)).toBe(1)
  })

  it('两端由数据现算,不写死 15 与 80', () => {
    expect(MODULE, '最划算应由数据现算').toContain('Math.min(...FURNACE_RATES.map(r => r.per))')
    expect(MODULE, '最不划算应由数据现算').toContain('Math.max(...FURNACE_RATES.map(r => r.per))')
  })
})

describe('熔率形制 · 二、三档按相对倍数划线', () => {
  it('以最划算的一类为 1 倍:≤1.5 丰、≤2.5 中、其余薄', () => {
    const best = Math.min(...FURNACE_RATES.map(r => r.per))
    expect(rateTierOf(best)).toBe('rich')
    expect(rateTierOf(best * 1.5)).toBe('rich')
    expect(rateTierOf(best * 2)).toBe('mid')
    expect(rateTierOf(best * 3)).toBe('thin')
  })

  it('四类里丰与薄都有实例', () => {
    const tiers = furnaceMarks().map(m => m.tier)
    expect(tiers).toContain('rich')
    expect(tiers).toContain('thin')
  })

  it('坏值按最薄一档处理,不抛错', () => {
    for (const bad of [Number.NaN, 0, -5]) {
      expect(rateTierOf(bad)).toBe('thin')
      expect(rateFillOf(bad)).toBe(0)
    }
  })
})

describe('熔率形制 · 三、说法照写原值', () => {
  it('label 写「每 N 个换 1 道源」与档名', () => {
    const m = rateMark(25, '玄铁')
    expect(m.label).toContain('每 25 个换 1 道源')
    expect(m.label).toContain('玄铁')
  })

  it('灵石献祭能折算到同一把尺上', () => {
    expect(stonePerDaoSource()).toBe(FURNACE_STONE_TIER_AMOUNT / FURNACE_STONE_DAO_SOURCE)
    expect(stonePerDaoSource()).toBeGreaterThan(0)
  })
})

describe('熔率形制 · 四、界面接上了', () => {
  it('四行各挂一条率条', () => {
    expect(DIALOG, '应挂率条').toContain('furnace-rate')
    expect(DIALOG, '条长应现算').toContain('rateMark(row.rate.per, row.rate.name).fill * 100')
    expect(DIALOG, '率条应有可念的说法').toContain(':aria-label="rateMark(row.rate.per, row.rate.name).label"')
  })

  it('三档各有一条样式,且不吃指针事件', () => {
    for (const tier of ['rich', 'mid', 'thin'] as const) {
      expect(block(`.furnace-rate--${tier}`), `缺 .furnace-rate--${tier}`).not.toBe('')
    }
    expect(block('.furnace-rate'), '率条须 pointer-events: none').toContain('pointer-events: none')
  })

  it('三档的色只取既有 token', () => {
    // 切到**下一个段落标记**为止:原先写死切到「满级标记」,中间插进新段落就会把别段的色算进来
    const from = CSS.indexOf('.furnace-rate--rich')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    for (const m of seg.matchAll(/rgb\(var\(--color-([a-z-]+)-rgb\)/g)) {
      expect(['gold-ink', 'amber-ink', 'ink-faint'], `新造了色 ${m[1]}`).toContain(m[1])
    }
  })
})
