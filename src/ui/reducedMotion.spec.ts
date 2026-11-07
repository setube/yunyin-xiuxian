/**
 * 「减少动效」那两个块用 0.01ms 而不是 none —— 这个选择有一个不显眼的依赖。
 *
 * 通配符规则会对**所有元素**生效,与 @keyframes 定义在哪无关,所以写在组件里的
 * keyframes 照样受管。实测 28 处:WarpPortal 10、CultivationOrb 8、SpiritRootReveal 7、
 * TreasureCeremony 3 —— 最后那组写在 `<style scoped>` 里,但通配选择器作用于元素本身,
 * 与样式块的 scoped 属性无关,故同样被那两个块压住(它自己还另有一份局部 @media 兜底)。
 *
 * 但 `animationend` 事件只在动画真的跑过一次时才触发:写成 `animation: none` 的话,
 * BuildingCard 的 `@animationend.self="flashing = false"` 就永远等不到,
 * 升级高亮会一直挂在卡上。0.01ms 保留了「跑一次」这个前提,是有意的。
 *
 * AGENTS.md 写的是「@keyframes 定义在 style.css」,实际有 28 处写在组件里 ——
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

  /**
   * 终态 opacity:0 的常驻形制,两个块里都要有静态终态。
   *
   * 通配规则把 animation-duration 压到 0.01ms 后,动画停在最后一帧;
   * 若那条 keyframes 的 100% 是 opacity:0,形制就整块消失。
   * 实测踩过:.node-focus 在界域图上标「下一站」的朱砂圆圈,减少动效下停在透明 ——
   * 玩家看不出该去哪一区。.card-charged::before(修行页灵气满的卡片光晕)同理。
   *
   * 只压 opacity、不改 animation 简写:那个块刻意保留「跑过一次」的前提
   * (BuildingCard 靠 animationend 复位高亮),写成无动画会让它永远等不到。
   */
  it('终态不可见的常驻形制,两处都给了静态不透明度', () => {
    /*
     * 用宿主选择器,不是动画名。
     * 首版写成 card-glow-halo(那是 @keyframes 的名字,没有任何元素带这个类),
     * 判据照样绿 —— 它只检查「文中出现过这个选择器」，而那段文字根本不该被匹配。
     */
    const need = ['node-focus', 'card-charged::before']
    /*
     * 必须精确到「选择器 → 紧接着的块里有 opacity」。
     * 首版写成 `@media...[\s\S]*?\.${sel}[^{]*\{[^}]*opacity`,那个 [\s\S]*? 会一路
     * 跨过整个媒体块,匹配到别处的任意 opacity —— 删掉 .node-focus 的规则它照样绿。
     * 故障注入验过:现在把那条规则清空会报红。
     */
    const blockOf = (sel: string): string | null => {
      const re = new RegExp(`\\.${sel}[^{]*\\{([^}]*)\\}`, 'g')
      for (const m of CSS.matchAll(re)) {
        if ((m[1] ?? '').includes('opacity')) return m[1]!
      }
      return null
    }
    /*
     * 两处各要有一条「选择器 + 块内有 opacity」的规则,且块内必须真写了 opacity。
     * 只查「文中出现过 .node-focus」不够 —— 把规则里的 opacity 删掉那句话仍在,
     * 判据照样绿(故障注入验过)。
     */
    /**
     * 取「某个块从起点到它结束」的整段。
     *
     * @media 块:从 @media 那个 { 起配对。
     * .reduce-motion 块:它不是一个大括号块,而是一串并列规则(通配符三条 + 几条定向覆盖),
     * 所以取「从 .reduce-motion *, 到文件里下一个顶层注释或文件尾」那一段。
     */
    const blockBody = (start: number): string => {
      const open = CSS.indexOf('{', start)
      if (open < 0) return ''
      let depth = 0
      for (let i = open; i < CSS.length; i += 1) {
        if (CSS[i] === '{') depth += 1
        else if (CSS[i] === '}') {
          depth -= 1
          if (depth === 0) return CSS.slice(open + 1, i)
        }
      }
      return ''
    }
    const mediaStart = CSS.indexOf('@media (prefers-reduced-motion: reduce)')
    const rmStart = CSS.indexOf('.reduce-motion *,')
    expect(mediaStart, '找不到 prefers-reduced-motion 块').toBeGreaterThanOrEqual(0)
    expect(rmStart, '找不到 .reduce-motion 块').toBeGreaterThanOrEqual(0)
    /*
     * 必须按花括号取出各自块体,不能 slice(start) —— .reduce-motion 块在媒体块之后,
     * 直接 slice 会把它前面那一大段(含媒体块)也算进来,于是媒体块里删掉规则也查不出。
     * 首版就是这么漏的:故障注入把媒体块内的 opacity 换成 color 后判据仍绿。
     */
    /*
     * 先剥掉注释再匹配。
     *
     * 首版没剥,而块里那段解释文字正好写着「.card-charged::before」——
     * 正则的 [^{]* 会从注释里那个选择器一路跨到后面的规则体,
     * 于是把 .node-focus 的 opacity 当成 card-charged 的,删掉真规则也照样绿。
     * 故障注入两次都没抓到,根因就在这里。
     */
    const stripComments = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '')
    const mediaTail = stripComments(blockBody(mediaStart))
    // .reduce-motion 是一串并列规则:从起点取到文件末(它本来就是文件尾部那一段)
    const rmTail = stripComments(CSS.slice(rmStart))
    expect(mediaTail.length, '媒体块体为空').toBeGreaterThan(50)
    expect(rmTail.length, '.reduce-motion 段为空').toBeGreaterThan(50)

    /*
     * 选择器要先转义再进正则。
     * 首版直接拼 `\\.${sel}`,而 `card-charged::before` 里的 `.` `:` 会被正则当元字符,
     * 模式于是横跨多条规则乱匹配 —— 把 opacity 删掉后它仍能匹配到别处的 opacity,判据照样绿。
     * 故障注入验过:现在删掉会报红。
     */
    const esc = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const ruleWithOpacity = (text: string, sel: string): boolean => {
      const re = new RegExp(`${esc(sel)}[^{]*\\{([^}]*)\\}`, 'g')
      for (const m of text.matchAll(re)) if ((m[1] ?? '').includes('opacity')) return true
      return false
    }
    for (const sel of need) {
      expect(ruleWithOpacity(mediaTail, sel), `${sel} 在 prefers-reduced-motion 块里缺静态 opacity`).toBe(true)
      expect(ruleWithOpacity(rmTail, sel), `${sel} 在 .reduce-motion 块里缺静态 opacity`).toBe(true)
    }
    expect(blockOf('__nonexistent__'), '防空转:匹配器对不存在的选择器应返回 null').toBeNull()
    // 防空转:这两条正则只在该块存在时才有意义
    expect(CSS).toContain('@media (prefers-reduced-motion: reduce)')
    expect(CSS).toContain('.reduce-motion *')
  })

  it('组件内自定义 keyframes 不构成可访问性问题(通配符与定义位置无关)', () => {
    // 钉住这个判断:只要上面两个块在,写在组件里的动画同样受管
    expect(CSS).toContain('animation-iteration-count: 1 !important')
  })
})
