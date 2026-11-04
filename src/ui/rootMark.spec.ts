/**
 * 灵根资质刻度。
 *
 * 灵根在角色页与建号页都只画成一行圆圈,资质写在圈下(「88」):
 * 三根火水土并排时,哪一根是主根、它高多少,得逐个读数字再比。
 *
 * 四条判据:
 *   一 一格十点、十格为满,上限取数据里的资质天花板。
 *   二 主根是「资质最高那一根」,并列时都标 —— 两根同资质没有理由只亮一根。
 *   三 资质不直接加修速(data/linggenAffinity 的红线),故只画刻度,不排序、不改色。
 *   四 两处界面(角色页、建号页)同读一份形制。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SpiritRoot } from '@/types'
import { APTITUDE_CAP, APTITUDE_PIPS, rootMarks, rootPips, topRootElement } from './rootMark'

const ROOT = resolve(__dirname, '../..')
const CHAR = readFileSync(resolve(ROOT, 'src/views/CharacterView.vue'), 'utf-8')
const CREATE = readFileSync(resolve(ROOT, 'src/views/CreateView.vue'), 'utf-8')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const GEN = readFileSync(resolve(ROOT, 'src/core/linggenGen.ts'), 'utf-8')

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
}

const root = (element: SpiritRoot['element'], aptitude: number): SpiritRoot => ({ element, aptitude })

describe('灵根刻度 · 一、一格十点', () => {
  it('十格为满,上限与数据里的天花板一致', () => {
    expect(APTITUDE_CAP).toBe(100)
    expect(APTITUDE_PIPS).toBe(10)
    expect(rootPips(0)).toHaveLength(APTITUDE_PIPS)
    // 生成器确实把资质夹在 100
    expect(GEN).toContain('Math.min(100')
  })

  it('格数按资质四舍五入:92 → 9 格、68 → 7 格、45 → 5 格', () => {
    const marks = rootMarks([root('fire', 92), root('water', 68), root('earth', 45)])
    expect(marks.map(m => m.pips)).toEqual([9, 7, 5])
  })

  it('格数按资质单调增 —— 否则刻度读不出高低', () => {
    let last = -1
    for (let a = 0; a <= APTITUDE_CAP; a += 5) {
      const n = rootMarks([root('fire', a)])[0]!.pips
      expect(n).toBeGreaterThanOrEqual(last)
      last = n
    }
  })

  it('越界与坏值不产生负格或超长数组', () => {
    const marks = rootMarks([root('fire', -20), root('water', 999), root('earth', Number.NaN)])
    expect(marks.map(m => m.pips)).toEqual([0, 10, 0])
    for (const m of marks) {
      expect(rootPips(m.pips)).toHaveLength(APTITUDE_PIPS)
      expect(Number.isFinite(m.aptitude)).toBe(true)
    }
  })
})

describe('灵根刻度 · 二、主根', () => {
  it('资质最高那一根标为主根', () => {
    const marks = rootMarks([root('fire', 92), root('water', 68), root('earth', 45)])
    expect(marks.filter(m => m.top).map(m => m.element)).toEqual(['fire'])
    expect(topRootElement(marks)).toBe('fire')
  })

  it('并列最高时都标 —— 两根同资质没有理由只亮一根', () => {
    const marks = rootMarks([root('fire', 80), root('water', 80), root('earth', 40)])
    expect(marks.filter(m => m.top).map(m => m.element)).toEqual(['fire', 'water'])
  })

  it('空表与全零不当主根', () => {
    expect(rootMarks([])).toEqual([])
    expect(topRootElement([])).toBeNull()
    // 全零:没有「最高」可说
    expect(rootMarks([root('fire', 0), root('water', 0)]).every(m => !m.top)).toBe(true)
  })

  it('保持数据原序 —— 灵根次序有意义(core/fate 的种子按位加权)', () => {
    const marks = rootMarks([root('water', 60), root('fire', 90), root('earth', 70)])
    expect(marks.map(m => m.element)).toEqual(['water', 'fire', 'earth'])
  })
})

describe('灵根刻度 · 三、只是刻度,不改数值', () => {
  it('形制不排序、不重排数据', () => {
    // 排序会改掉灵根次序,进而改掉安星种子
    const input = [root('earth', 45), root('fire', 92)]
    expect(rootMarks(input).map(m => m.element)).toEqual(['earth', 'fire'])
  })

  it('形制不引入新的数值加成 —— 只转发资质本身', () => {
    const marks = rootMarks([root('fire', 92)])
    expect(marks[0]!.aptitude).toBe(92)
    // 除了 aptitude / pips / top 之外不派生任何数值字段
    expect(Object.keys(marks[0]!).sort()).toEqual(['aptitude', 'element', 'pips', 'top'])
  })
})

describe('灵根刻度 · 四、两处界面同读一份', () => {
  it('角色页与建号页都接 rootMarks / rootPips', () => {
    for (const [name, src] of [
      ['角色页', CHAR],
      ['建号页', CREATE]
    ] as const) {
      expect(src, `${name}没接 rootMarks`).toContain('rootMarks(')
      expect(src, `${name}没渲染刻度`).toContain('root-pips')
    }
  })

  it('刻度给读屏名 —— 十条细格对面是盲的', () => {
    expect(CHAR).toContain('`资质 ${root.aptitude}`')
    expect(CREATE).toContain('`资质 ${root.aptitude}`')
  })

  it('刻度的 CSS 存在,且形制层不吃指针事件', () => {
    expect(block('.root-pips')).toContain('pointer-events: none')
    // 主根那排提亮一档
    expect(block('.root-pips--top i.on')).toContain('opacity')
  })

  it('刻度只吃元素本色(--root-tone),自身不引入颜色名', () => {
    const from = CSS.indexOf('.root-pips {')
    const seg = CSS.slice(from, CSS.indexOf('/* =================', from))
    expect(seg).not.toMatch(/rgb\(var\(--color-/)
    expect(seg).toContain('--root-tone')
  })
})
