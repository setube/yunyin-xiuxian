/**
 * 远征路线节点形制:每重两径择一,是这模式里唯一的连续决策。
 *
 * 四条判据:
 *   一 险纹与 `core/worldGen.shapeRisk` 同一套优先级 —— 两边各写一份,
 *      迟早出现「小字说流血、纹样画成高爆」。
 *   二 七种险纹各有形状且互不相同;份量三档各有色条。
 *   三 坏数据不抛错:缺敌手按「寻常」,非有限道源按轻档。
 *   四 界面真的接上了,且险纹是装饰(读屏靠节点的 aria-label 报险情)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { WorldFoeShape } from '@/types'
import { CELESTIAL_WORLDS, TRIAL_FOES } from '@/data/endgame'
import { perilGlyph, perilOf, routeMark, routeWeightOf, type PerilKind } from './routeMark'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const WORLDGEN = readFileSync(resolve(ROOT, 'src/core/worldGen.ts'), 'utf-8')
const EXPED = readFileSync(resolve(ROOT, 'src/components/celestial/ExpeditionPanel.vue'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

function foe(patch: Partial<WorldFoeShape>): WorldFoeShape {
  return { name: '试敌', icon: 'beast', atkR: 1, defR: 1, hpR: 1, speed: 1, skills: [], ...patch }
}

describe('路线形制 · 一、险纹与 shapeRisk 同源', () => {
  it('七类险纹一一映射', () => {
    const cases: [WorldFoeShape, PerilKind][] = [
      [foe({ skills: [{ name: 'a', mult: 1, rate: 1, effect: 'multi' }] }), 'multi'],
      [foe({ skills: [{ name: 'a', mult: 1, rate: 1, effect: 'pierce' }] }), 'pierce'],
      [foe({ skills: [{ name: 'a', mult: 1, rate: 1, effect: 'bleed' }] }), 'bleed'],
      [foe({ skills: [{ name: 'a', mult: 1, rate: 1, effect: 'drain' }] }), 'drain'],
      [foe({ skills: [{ name: 'a', mult: 1, rate: 1, effect: 'stun' }] }), 'stun'],
      [foe({ skills: [{ name: 'a', mult: 2.4, rate: 1 }] }), 'burst'],
      [foe({ skills: [] }), 'plain']
    ]
    for (const [shape, expected] of cases) expect(perilOf(shape), JSON.stringify(shape.skills)).toBe(expected)
  })

  it('闪避型按寻常处理(与 shapeRisk 的优先级一致:它先看闪避)', () => {
    const dodgy = foe({ mods: { dodgeRate: 0.1 }, skills: [{ name: 'a', mult: 3, rate: 1, effect: 'multi' }] })
    expect(perilOf(dodgy)).toBe('plain')
  })

  it('shapeRisk 里的每一个技艺类型,险纹都认得', () => {
    // shapeRisk 列了 multi/pierce/bleed/drain/stun 五种 effect;险纹一个不少
    for (const effect of ['multi', 'pierce', 'bleed', 'drain', 'stun']) {
      expect(WORLDGEN, `shapeRisk 应仍判 ${effect}`).toContain(`'${effect}'`)
      expect(perilOf(foe({ skills: [{ name: 'a', mult: 1, rate: 1, effect }] })), `${effect} 险纹`).toBe(effect)
    }
  })

  it('真实敌池里每一只都判得出险纹', () => {
    const all = [...CELESTIAL_WORLDS.flatMap(w => w.foes), ...TRIAL_FOES]
    expect(all.length).toBeGreaterThan(0)
    for (const shape of all) {
      expect(typeof perilOf(shape), `${shape.name} 判不出险纹`).toBe('string')
    }
  })
})

describe('路线形制 · 二、七种险纹与三档份量', () => {
  it('七种险纹各有样式,且互不相同', () => {
    const bodies = new Set<string>()
    for (const peril of ['multi', 'pierce', 'bleed', 'drain', 'stun', 'burst', 'plain'] as PerilKind[]) {
      const body = block(`.route-peril--${peril}::before`)
      expect(body, `缺 .route-peril--${peril}::before`).not.toBe('')
      bodies.add(body)
    }
    expect(bodies.size, '两种险纹画了同一套线').toBe(7)
  })

  it('份量三档各有色条,且档差在明度而非新增色相', () => {
    for (const [cls, needle] of [
      ['route-weight--light', 'ink-rgb'],
      ['route-weight--mid', 'amber-ink-rgb'],
      ['route-weight--heavy', 'gold-ink-rgb']
    ] as const) {
      expect(block(`.${cls}`), `缺 .${cls}`).toContain(needle)
    }
  })

  it('份量随道源单调,坏值退回轻档', () => {
    expect(routeWeightOf(7)).toBe('light')
    expect(routeWeightOf(10)).toBe('mid')
    expect(routeWeightOf(12)).toBe('mid')
    expect(routeWeightOf(13)).toBe('heavy')
    expect(routeWeightOf(Number.NaN)).toBe('light')
  })
})

describe('路线形制 · 三、坏数据不抛错', () => {
  it('缺敌手的节点按寻常处理', () => {
    const mark = routeMark({ foe: undefined as unknown as WorldFoeShape, bonus: 9, riskText: '' })
    expect(mark.peril).toBe('plain')
    expect(mark.label, '没有险情措辞时给既有状态词').toBe('寻常之敌')
  })

  it('险纹类名与种类同名,便于样式一一对应', () => {
    for (const peril of ['multi', 'pierce', 'bleed', 'drain', 'stun', 'burst', 'plain'] as PerilKind[]) {
      expect(perilGlyph(peril)).toBe(peril)
    }
  })
})

describe('路线形制 · 四、界面接上了', () => {
  it('两径卡都挂险纹与份量', () => {
    expect(EXPED, '应挂险纹').toContain('route-peril--${perilGlyph(routeMark(node).peril)}')
    expect(EXPED, '应挂份量条').toContain('route-weight--${routeMark(node).weight}')
  })

  it('读屏靠 aria-label 报「节点 · 险情 · 道源」,不念纹样', () => {
    expect(EXPED, '节点卡应有可访问名').toContain(':aria-label="`${node.name} · ${routeMark(node).label} · 道源 +${node.bonus}`"')
    expect(EXPED, '险纹应 aria-hidden').toMatch(/route-peril[\s\S]{0,200}aria-hidden="true"/)
  })

  it('险纹与份量条都不吃指针事件', () => {
    expect(block('.route-peril::before'), '险纹须 pointer-events: none').toContain('pointer-events: none')
    expect(block('.route-weight'), '份量条须 pointer-events: none').toContain('pointer-events: none')
  })
})
