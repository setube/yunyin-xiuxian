import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { craftOkToast, craftShortToast, pillGoneToast, pillTakenToast, recipeMasteryText } from './pillText'

describe('丹药提示 · 文言仍报清药力与枚数', () => {
  it('囊中无丹、入口化开,不说不足', () => {
    expect(pillGoneToast()).toBe('囊中无此丹')
    expect(pillGoneToast()).not.toContain('不足')
    expect(pillTakenToast('凝神丹', '药力化开')).toBe('服下「凝神丹」,药力化开')
    expect(pillTakenToast('凝神丹', '')).toBe('服下「凝神丹」')
  })

  it('开炉缺料与成丹枚数都说清', () => {
    expect(craftShortToast()).toContain('灵草')
    expect(craftShortToast()).toContain('灵石')
    // 无差额兜底与全仓同词:「X不足」
    expect(craftShortToast()).toBe('灵草或灵石不足')
    expect(craftShortToast({})).toBe('灵草或灵石不足')
    expect(craftShortToast({ herb: 3 })).toBe('灵草尚差 3 株')
    expect(craftShortToast({ stone: '12' })).toBe('灵石尚差 12')
    expect(craftShortToast({ herb: 3, stone: '12' })).toBe('灵草尚差 3 株 · 灵石尚差 12')
    expect(craftOkToast('护心丹', false)).toBe('丹成,得「护心丹」一枚')
    expect(craftOkToast('护心丹', true)).toBe('双丹,得「护心丹」两枚')
    expect(craftOkToast('护心丹', false)).not.toContain('×1')
  })
})

/**
 * 丹方熟练度的三态读数只写一处。
 *
 * 同一个读数原先三处各拼一遍:图鉴、行囊丹方行、可炼性判据的阻断原因。
 * 「已通晓」与「通晓」这种一字之差,各写各的时候就会分叉。
 *
 * 判据:三档读数各自钉住 + 两处调用点都读共享实现、不许再写字面量。
 */
describe('丹方熟练度 · 三态读数一处出', () => {
  const read = (p: string): string => readFileSync(resolve(__dirname, p), 'utf-8')
  const strip = (src: string): string =>
    src
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map(l => l.replace(/(^|[^:])\/\/.*$/, '$1'))
      .join('\n')

  it('三档读数', () => {
    expect(recipeMasteryText(0)).toBe('未得方')
    expect(recipeMasteryText(1)).toBe('已通晓')
    expect(recipeMasteryText(0.42)).toBe('熟练 42%')
    // 坏值一律按「还没读过」算,不印 NaN%
    expect(recipeMasteryText(NaN)).toBe('未得方')
    expect(recipeMasteryText(-1)).toBe('未得方')
    // 越界仍按满算
    expect(recipeMasteryText(2)).toBe('已通晓')
  })

  it('行囊丹方行与可炼性判据都读它', () => {
    const view = strip(read('../views/InventoryView.vue'))
    expect(view, '行囊该读 recipeMasteryText').toContain('recipeMasteryText(lore.recipeMastery(id))')
    expect(view, '行囊又手写了「未得方」').not.toContain("'未得方'")
    expect(view, '行囊又手写了「已通晓」').not.toContain("'已通晓'")

    const craft = strip(read('../core/craftability.ts'))
    expect(craft, '判据该读常量').toContain('RECIPE_MASTERY_TEXT.none')
    expect(craft, '判据又手写了「未得方」').not.toContain("'未得方'")
  })

  it('百分比那档不再各自 Math.round', () => {
    const view = strip(read('../views/InventoryView.vue'))
    expect(view, '百分比该由共享实现算').not.toContain('Math.round(m * 100)')
  })
})
