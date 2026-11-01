/**
 * `tint` 把数据层的颜色引用转成带透明度的内联样式。
 *
 * 它没有依赖、没有状态,却是品阶色/角章/光环的必经之路 ——
 * 输出直接进 `:style`,错了不会抛错,只会静默变成另一种颜色。
 * 此前完全没有测试,这条补上三条分支与四条「原样返回」的边界。
 */
import { describe, expect, it } from 'vitest'
import { tint } from './colorToken'

describe('颜色引用 → 带透明度的内联样式', () => {
  it('token 形态走 rgb 通道变量,保留原 alpha 字面量', () => {
    expect(tint('var(--color-jade)', 0.33)).toBe('rgb(var(--color-jade-rgb) / 0.33)')
    // 带连字符的 token(amber-ink)不能被截断成 amber
    expect(tint('var(--color-amber-ink)', 0.12)).toBe('rgb(var(--color-amber-ink-rgb) / 0.12)')
    // 整数 alpha 不补小数位
    expect(tint('var(--color-ink)', 1)).toBe('rgb(var(--color-ink-rgb) / 1)')
    expect(tint('var(--color-ink)', 0)).toBe('rgb(var(--color-ink-rgb) / 0)')
  })

  it('六位 hex 拆成空格分隔的 R G B —— 不走逗号,与 token 形态同语法', () => {
    expect(tint('#A85C3F', 0.5)).toBe('rgb(168 92 63 / 0.5)')
    // 全零与全满:位运算两端的边界
    expect(tint('#000000', 1)).toBe('rgb(0 0 0 / 1)')
    expect(tint('#FFFFFF', 1)).toBe('rgb(255 255 255 / 1)')
    // 小写十六进制同义
    expect(tint('#a85c3f', 0.5)).toBe('rgb(168 92 63 / 0.5)')
  })

  /**
   * 认不出的形态原样返回,不猜。
   *
   * 猜错的代价是「本该是绿色的一块变成了黑色」,而原样返回至少还是浏览器认识的写法。
   * 三位 hex 尤其容易踩:正则只认六位,#FFF 必须原样出去。
   */
  it('认不出的形态原样返回', () => {
    expect(tint('rgb(1,2,3)', 0.5)).toBe('rgb(1,2,3)')
    expect(tint('red', 0.5)).toBe('red')
    expect(tint('#FFF', 0.5)).toBe('#FFF')
    expect(tint('', 0.5)).toBe('')
    // 八位 hex(带 alpha)不在支持范围,原样返回
    expect(tint('#A85C3FFF', 0.5)).toBe('#A85C3FFF')
  })
})
