/** 灵根元数据:五行与特殊灵根的区分须在数据层就有,界面才挂得上形制 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BASIC_ELEMENTS, ELEMENTS, SPECIAL_ELEMENTS } from './linggen'

describe('灵根 · 特殊与五行', () => {
  it('五行五种、特殊五种,合起来覆盖全部元素', () => {
    expect(BASIC_ELEMENTS).toHaveLength(5)
    expect(SPECIAL_ELEMENTS).toHaveLength(5)
    const all = [...BASIC_ELEMENTS, ...SPECIAL_ELEMENTS]
    for (const id of all) expect(ELEMENTS[id], `${id} 没有元数据`).toBeDefined()
  })

  it('special 标记与 SPECIAL_ELEMENTS 一致 —— 两处说法不能打架', () => {
    for (const id of BASIC_ELEMENTS) expect(ELEMENTS[id].special, `五行 ${id} 不该标 special`).toBe(false)
    for (const id of SPECIAL_ELEMENTS) expect(ELEMENTS[id].special, `特殊 ${id} 该标 special`).toBe(true)
  })

  it('界面确实读了 special 标记 —— 否则特殊与五行长得一样', () => {
    /*
     * 原先 special 只有生成逻辑在用,界面从不读:特殊灵根(风雷冰光暗)
     * 与普通五行显示成同一种彩色圆章,「这根是稀有的」只能靠读颜色猜。
     * 现三处灵根圆章都挂 root-special 外环。
     */
    for (const f of ['../views/CharacterView.vue', '../views/CreateView.vue', '../components/character/ReincarnationDialog.vue']) {
      const src = readFileSync(resolve(__dirname, f), 'utf-8')
      expect(src, `${f} 没读 special 标记`).toContain("root-special': ELEMENTS[root.element].special")
    }
  })

  it('外环样式在 style.css 里存在,且不抢字(半透明)', () => {
    const css = readFileSync(resolve(__dirname, '../style.css'), 'utf-8')
    expect(css, '缺 .root-special::after').toContain('.root-special::after')
    const block = css.slice(css.indexOf('.root-special::after'))
    expect(block.slice(0, 400), '外环该半透明,不压字').toContain('opacity: 0.55')
  })
})
