/**
 * 寿元的数字与「载」之间要留空格。
 *
 * 全站其他单位都由模板拼接、天然分开:`{{ formatGN(x) }} 石`、`{{ n }} 场`、`{{ n }} 层`。
 * 唯独 `formatYears` 把单位拼进了返回值,印出来是「150载」—— 同一屏两套写法。
 *
 * 这一条钉住它,免得哪天又被「简化」回紧贴写法。
 */
import { describe, expect, it } from 'vitest'
import { formatYears } from './format'

describe('formatYears · 数字与单位之间留空格', () => {
  it('小数值', () => {
    expect(formatYears(150)).toBe('150 载')
    expect(formatYears(0)).toBe('0 载')
  })

  it('过万交给 formatNum 走中文单位,同样留空格', () => {
    // formatNum 的既定行为:1 万起折成「万」、1 亿起折成「亿」,不是千分位
    expect(formatYears(12345)).toBe('1.234万 载')
    expect(formatYears(10000)).toBe('1万 载')
  })

  it('9999 及以下不走单位换算', () => {
    expect(formatYears(9999)).toBe('9999 载')
  })

  it('与全站其他单位的写法一致 —— 都隔着空格', () => {
    const got = formatYears(150)
    expect(got, '数字与单位紧贴了').toMatch(/^\d[\d,]* 载$/)
  })
})
