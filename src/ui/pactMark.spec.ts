/**
 * 天道契约形制:六张契要能一眼看出「这一趟下多大的注」。
 *
 * 此前六张契只差一个字与一个 ×N,轻重得逐个读倍数。这一层补两样:契纹(形状)+ 契重(描边)。
 *
 * 四条判据:
 *   一 契重阈值只有一处定义(data/pacts 的 PACT_HEAVY_MULT),画像与界面必须同一根线。
 *   二 六张契各有一枚契纹,且互不重复 —— 重复了等于两张长得一样。
 *   三 新增契忘了登记时返回 undefined,不静默画错。
 *   四 两处择契界面都真的接上了,且契纹是装饰(自带 aria-hidden,读屏不念)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PACTS, PACT_HEAVY_MULT, pactDef } from '@/data/pacts'
import { pactMark, pactMarks, pactWeightOf } from './pactMark'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const IDENTITY = readFileSync(resolve(ROOT, 'src/core/identity.ts'), 'utf-8')
const EXPED = readFileSync(resolve(ROOT, 'src/components/celestial/ExpeditionPanel.vue'), 'utf-8')
const TRIAL = readFileSync(resolve(ROOT, 'src/components/celestial/TrialPanel.vue'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('契约形制 · 一、契重阈值只有一处定义', () => {
  it('画像里的「重注」与界面的「重契」读同一个常量', () => {
    expect(IDENTITY, 'core/identity 应引 PACT_HEAVY_MULT,不自己写 2.5').toContain('PACT_HEAVY_MULT')
    expect(IDENTITY, '不许再出现裸 2.5 的重注阈值').not.toMatch(/sourceMult \?\? 1\)\s*>=\s*2\.5/)
    expect(PACT_HEAVY_MULT).toBe(2.5)
  })

  it('三档划分随倍数单调:轻 < 中 < 重', () => {
    expect(pactWeightOf(1.0)).toBe('light')
    expect(pactWeightOf(1.7)).toBe('light')
    expect(pactWeightOf(2.0)).toBe('mid')
    expect(pactWeightOf(2.2)).toBe('mid')
    expect(pactWeightOf(PACT_HEAVY_MULT)).toBe('heavy')
    expect(pactWeightOf(4.0)).toBe('heavy')
    expect(pactWeightOf(Number.NaN), '坏值退回轻契,不挂重档').toBe('light')
  })

  it('六张契按倍数各归其档,与数据表对得上', () => {
    const table = PACTS.map(p => ({ id: p.id, mult: p.sourceMult, weight: pactWeightOf(p.sourceMult) }))
    expect(table.filter(t => t.weight === 'heavy').map(t => t.id).sort()).toEqual(['ni', 'wushang'])
    expect(table.filter(t => t.weight === 'light').map(t => t.id).sort()).toEqual(['can', 'gu'])
    expect(table.filter(t => t.weight === 'mid').map(t => t.id).sort()).toEqual(['ji', 'xue'])
  })
})

describe('契约形制 · 二、六契各一枚且互不重复', () => {
  it('每张契都取得到形制 —— 新增契必须登记', () => {
    for (const def of PACTS) {
      expect(pactMark(def.id), `${def.name} 没登记契纹`).toBeDefined()
    }
    expect(pactMarks().length).toBe(PACTS.length)
  })

  it('六枚契纹两两不同', () => {
    const crests = pactMarks().map(p => p.mark.crest)
    expect(new Set(crests).size, `契纹重复:${crests.join(' / ')}`).toBe(crests.length)
  })

  it('说法复用既有状态词:轻重 + 契名', () => {
    expect(pactMark('xue')!.label).toBe('中契 · 血契')
    expect(pactMark('wushang')!.label).toBe('重契 · 无伤契')
  })

  it('认不出的 id 返回 undefined,不挂假形制', () => {
    for (const bogus of ['', 'nonexistent', 'XUE', '__proto__']) {
      expect(pactMark(bogus), `${bogus} 不该有契约形制`).toBeUndefined()
    }
    expect(pactDef('nonexistent')).toBeUndefined()
  })
})

describe('契约形制 · 三、样式与两处界面', () => {
  it('六枚契纹各有 CSS 规则,且纹样各异', () => {
    const imgs = new Map<string, string>()
    for (const { mark } of pactMarks()) {
      // 纹样写在 `::before` 上(本体的盒子由使用点的 h/w 决定),故判据也找伪元素块
      const body = block(`.pact-crest--${mark.crest}::before`)
      expect(body, `缺 .pact-crest--${mark.crest}::before`).not.toBe('')
      // 有的是背景图,有的是描边(圆/方框),两者都算「这一枚的纹样」
      const img = /(background-image|border):\s*([\s\S]*)/.exec(body)?.[2]?.trim() ?? ''
      expect(img, `${mark.crest} 应有纹样`).not.toBe('')
      imgs.set(mark.crest, img)
    }
    expect(new Set(imgs.values()).size, '两枚契纹画了同一套线,形状就分不开了').toBe(imgs.size)
  })

  it('三档契重各有描边,且档差写在粗细或明度上而非新增颜色', () => {
    for (const [cls, needle] of [
      ['pact-weight-light', 'outline: 1px'],
      ['pact-weight-mid', 'outline: 1.5px'],
      ['pact-weight-heavy', 'outline: 2px']
    ] as const) {
      expect(block(`.${cls}`), `缺 .${cls}`).toContain(needle)
    }
  })

  it('两处择契界面都接上了契纹与契重', () => {
    expect(EXPED, '远征择契应挂契纹').toContain('pact-crest--')
    expect(EXPED, '远征择契应挂契重').toContain('pact-weight-')
    expect(TRIAL, '挑战书应挂契纹').toContain('pact-crest--')
    expect(TRIAL, '挑战书应挂契重').toContain('pact-weight-')
  })

  it('契纹是装饰:读屏靠 aria-label 报「轻重 + 契名」,不念纹样', () => {
    expect(EXPED, '远征择契的按钮应带轻重说法').toContain('row.mark?.label')
    // 挑战书的契重与契纹在 setup 里各算一次(原先同一个按钮里调 5 次)
    expect(TRIAL, '挑战书的按钮应带轻重说法').toContain('row.mark?.label')
    expect(TRIAL, '应在 setup 里算一次').toContain('const pactRows = PACTS.map(p => ({ def: p, mark: pactMark(p.id) }))')
    expect(EXPED, '远征择契也应在 setup 里算一次').toContain('const pactRows = PACTS.map(p => ({ def: p, mark: pactMark(p.id) }))')
    expect(EXPED, '契纹应 aria-hidden').toMatch(/pact-crest[\s\S]{0,200}aria-hidden="true"/)
  })
})
