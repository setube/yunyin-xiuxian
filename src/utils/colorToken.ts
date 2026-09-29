/**
 * 把「颜色引用」按透明度转成可用的 CSS 颜色值。
 *
 * 数据层(qualities/linggen 等)的颜色字段现在引用语义色变量
 * (`var(--color-jade)` 这类),而 UI 常要它的淡版(品阶边框 / 色块底)。
 * tailwind 的斜杠透明度(bg-jade/5)不走这里 —— 它在编译期就把工具类
 * 换成 rgb(var(--color-jade-rgb) / 5%),而模板里内联 :style 拿到的只是
 * 色板映射后剩下的字符串,没法带透明度,所以这里手动补一层:
 *
 *   var(--color-jade)          →  rgb(var(--color-jade-rgb) / 0.33)
 *   #A85C3F(少数无 token 的色)  →  rgb(168 92 63 / 0.33)
 *
 * 入参若不是这两种形态(不该发生),原样返回,宁可显形也不静默黑掉。
 */
export function tint(tokenOrHex: string, alpha: number): string {
  const tokenVar = /var\(--color-([a-z0-9-]+)\)/.exec(tokenOrHex)
  if (tokenVar) return `rgb(var(--color-${tokenVar[1]!}-rgb) / ${alpha})`
  const hex = /^#([0-9a-fA-F]{6})$/.exec(tokenOrHex)
  if (hex) {
    const n = parseInt(hex[1]!, 16)
    return `rgb(${n >> 16} ${(n >> 8) & 255} ${n & 255} / ${alpha})`
  }
  return tokenOrHex
}
