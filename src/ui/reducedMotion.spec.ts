/**
 * 「减少动效」那两个块用 0.01ms 而不是 none —— 这个选择有一个不显眼的依赖。
 *
 * 通配符规则会对**所有元素**生效,与 @keyframes 定义在哪无关,所以 25 处写在组件里的
 * keyframes(WarpPortal 10、CultivationOrb 8、SpiritRootReveal 7)照样受管。
 *
 * 但 `animationend` 事件只在动画真的跑过一次时才触发:写成 `animation: none` 的话,
 * BuildingCard 的 `@animationend.self="flashing = false"` 就永远等不到,
 * 升级高亮会一直挂在卡上。0.01ms 保留了「跑一次」这个前提,是有意的。
 *
 * AGENTS.md 写的是「@keyframes 定义在 style.css」,实际有 25 处写在组件里 ——
 * 以代码为准:只要那两个块在,定义位置不影响可访问性,故本条不禁止组件内定义,
 * 只钉住「两处都在、都用 0.01ms、都没有被改成 none」。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const CSS = readFileSync('src/style.css', 'utf-8')

describe('减少动效 · 两个块都要在,且保留 animationend 的前提', () => {
  it('系统偏好与设置项两个块都在,且都覆盖 ::before/::after', () => {
    expect(CSS, '缺 prefers-reduced-motion 块').toContain('@media (prefers-reduced-motion: reduce)')
    expect(CSS, '缺 .reduce-motion 块').toContain('.reduce-motion *')
    // 两块的选择器前缀不同(* 与 .reduce-motion *),故分别查各自的三个选择器
    for (const [block, name] of [
      [/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/, 'prefers-reduced-motion 块'],
      [/\.reduce-motion \*,[\s\S]*?\n\}/, '.reduce-motion 块']
    ] as const) {
      const m = block.exec(CSS)
      expect(m, `找不到${name}`).not.toBeNull()
      expect(m![0], `${name}缺 ::before`).toContain('::before')
      expect(m![0], `${name}缺 ::after`).toContain('::after')
    }
  })

  it('两处都把 animation-duration 与 animation-delay 归零', () => {
    const n = CSS.split('animation-duration: 0.01ms').length - 1
    const d = CSS.split('animation-delay: 0.01ms').length - 1
    expect(n, 'animation-duration 该在两处都出现').toBeGreaterThanOrEqual(2)
    expect(d, 'animation-delay 该在两处都出现').toBeGreaterThanOrEqual(2)
  })

  it('不许把 duration 改成 none —— 那会让 animationend 永不触发', () => {
    // BuildingCard 靠 @animationend.self 把 flashing 复位;none 会让它永远为 true
    expect(CSS, 'animation-duration 不能是 none').not.toMatch(/animation-duration:\s*none/)
    expect(CSS, '整条 animation 简写也不能是 none').not.toMatch(/animation:\s*none/)
    const card = readFileSync('src/components/dongfu/BuildingCard.vue', 'utf-8')
    expect(card, 'BuildingCard 仍靠 animationend 复位高亮').toContain('@animationend.self="flashing = false"')
  })

  it('组件内自定义 keyframes 不构成可访问性问题(通配符与定义位置无关)', () => {
    // 钉住这个判断:只要上面两个块在,写在组件里的动画同样受管
    expect(CSS).toContain('animation-iteration-count: 1 !important')
  })
})
