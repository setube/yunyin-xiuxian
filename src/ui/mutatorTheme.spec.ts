/**
 * 天道变数主题形制:变数池按五轴组织,而界面此前只印成「◇ 名称:说明」一行字。
 *
 * 四条判据:
 *   一 五轴各有一枚轴纹,且互不相同。
 *   二 轴判定与 `worldGen` 判「语义是否聚焦」同读一张表 `MUTATOR_THEMES` ——
 *      界面报的分布与世界生成约束必须永远一致。
 *   三 未登记的变数按生机兜底(`worldGen` 的 `?? 'survival'` 那一半),不抛错。
 *   四 界面真的接上了:今日天道、变数池、选变数三处都带轴纹。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MUTATORS, MUTATOR_THEMES, THEME_IDENTITY } from '@/data/mutators'
import { axisGlyph, axisOf, themeBreakdown, themeMark, themesInPool } from './mutatorTheme'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const TRIAL = readFileSync(resolve(ROOT, 'src/components/celestial/TrialPanel.vue'), 'utf-8')
const WORLDGEN = readFileSync(resolve(ROOT, 'src/core/worldGen.ts'), 'utf-8')

/** 取 CSS 里某个选择器的声明块;选择器须从行首起,免得匹配到主题覆盖段 */
function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

describe('变数主题 · 一、五轴各一枚轴纹', () => {
  it('变数池覆盖全部五轴', () => {
    const themes = themesInPool(MUTATORS.map(m => m.id))
    expect(themes.sort()).toEqual(['endurance', 'evasion', 'lethality', 'survival', 'tempo'])
  })

  it('五轴各有样式,且互不相同', () => {
    const glyphs = new Set(['sprout', 'hourglass', 'blade', 'shadow', 'rampart'])
    const bodies = new Set<string>()
    for (const g of glyphs) {
      const body = block(`.axis-glyph--${g}::before`)
      expect(body, `缺 .axis-glyph--${g}::before`).not.toBe('')
      bodies.add(body)
    }
    expect(bodies.size, '两条轴画了同一套线').toBe(glyphs.size)
  })

  it('轴名取 THEME_IDENTITY,不另造词', () => {
    for (const m of MUTATORS) {
      expect(themeMark(m.id).identity).toBe(THEME_IDENTITY[axisOf(m.id)])
    }
  })
})

describe('变数主题 · 二、轴判定与 worldGen 同源', () => {
  it('worldGen 仍读同一张表判语义聚焦', () => {
    expect(WORLDGEN, 'worldGen 应读 MUTATOR_THEMES').toContain('MUTATOR_THEMES')
    // worldGen 的兜底是「滤掉未登记的轴」(filter t !== undefined),界面侧退到 survival。
    // 两种写法都在说同一件事:未登记的变数不参与轴判定、也不画出空纹。
    expect(WORLDGEN, 'worldGen 应滤掉未登记的轴').toMatch(/filter\(\(t\): t is MutatorTheme => t !== undefined\)/)
    expect(axisOf('no_such_mutator'), '界面侧退到生机轴,不画空纹').toBe('survival')
  })

  it('分布按条数降序,同数按轴名稳定排序', () => {
    const rows = themeBreakdown(['heal_down', 'shield_thin', 'foe_dodge', 'foe_bulk', 'blood_surge'])
    expect(rows[0]!.theme).toBe('survival')
    expect(rows[0]!.count).toBe(2)
    const single = rows.filter(r => r.count === 1).map(r => r.theme)
    expect(single, '同数按轴名稳定排序').toEqual([...single].sort())
  })

  it('每一条变数都落在登记的轴上', () => {
    for (const m of MUTATORS) {
      expect(Object.keys(MUTATOR_THEMES), `${m.name} 未登记主题`).toContain(m.id)
    }
  })
})

describe('变数主题 · 三、坏数据不抛错', () => {
  it('未登记的变数按生机兜底', () => {
    const mark = themeMark('nonexistent')
    expect(mark.theme).toBe('survival')
    expect(mark.identity).toBe(THEME_IDENTITY.survival)
  })

  it('空列表的分布为空,不报错', () => {
    expect(themeBreakdown([])).toEqual([])
  })

  it('单条也报得出,但界面只在两条以上才显示分布', () => {
    expect(themeMark('heal_down').count).toBe(1)
    expect(TRIAL, '分布只在两条以上显示').toContain('ids.length < 2')
  })
})

describe('变数主题 · 四、界面接上了', () => {
  it('今日天道、变数池、选变数三处都带轴纹', () => {
    const uses = TRIAL.match(/axis-glyph--\$\{themeMark\(/g)?.length ?? 0
    expect(uses, '轴纹至少三处接入').toBeGreaterThanOrEqual(3)
  })

  it('轴纹是装饰:aria-hidden,读屏读变数名与规则', () => {
    expect(TRIAL, '轴纹应 aria-hidden').toMatch(/axis-glyph[\s\S]{0,220}aria-hidden="true"/)
  })

  it('轴纹不吃指针事件,类名与种类同名', () => {
    expect(block('.axis-glyph::before'), '轴纹须 pointer-events: none').toContain('pointer-events: none')
    for (const g of ['sprout', 'hourglass', 'blade', 'shadow', 'rampart'] as const) {
      expect(axisGlyph(g)).toBe(g)
    }
  })
})
