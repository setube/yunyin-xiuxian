/**
 * 调色板判据 —— 颜色只有一份事实源(src/style.css 的语义色变量 + tailwind.config.js 的转发),
 * 界面与数据层一律引用变量。判据盯五类只在"改颜色"时才现形的事故:
 *
 * 一 **两处对不上**:tailwind 配了、CSS 变量没定义(或反过来),产物里那类名不生成,
 *    而模板照写不误 —— 改配置不生效就是这么来的。
 * 二 **同值异名**:两个 token 是同一个 RGB(qinghua/azure 曾是同一枚,azure 沿用、
 *    qinghua 已撤),必有一个是没人记得的死 token;改配色时改一个漏一个,两处就不是一个颜色了。
 * 三 **浅/夜两套对不上**:夜间主题只覆盖通道值,却不许只在一边定义 token。
 * 四 **小字读不清**:每一档颜色按它**自己的角色**过线 ——
 *    正文承载档(墨四阶里的三阶 + 紫)在浅/夜里都要 ≥4.5:1;
 *    印面(cinnabar-deep)是按钮底,只考核它托奶油白字:浅 7.09:1、夜 5.31:1;
 *    夜主题的印面覆盖为深朱(亮朱当底只有 3.81:1,字糊)。
 *    强调档(朱)是标题、大字的主场,守 ≥3:1(大字 AA)。
 *    纸上的墨只有三档:第四档 ink-ghost(浅色仅 1.66:1,托不住能读的字)已撤,
 *    原先承载次要小字的 134 处全迁 ink-faint,判据断言"不得复活"。
 * 五 **手抄回流**:浏览器 chrome 色(theme.ts)、index.html 首帧 meta、独立成篇的
 *    public/privacy.html 不能引用 CSS 变量,只能抄;用判据代替人眼盯账。
 *
 * ── 对比度账目(worst 于 纸/纸深/卡片 三底,本轮调色后)──
 *   正文档:ink 11.75/10.03 · ink-soft 7.40/7.06 · ink-faint 4.71/5.03 · violet-ink 4.71/4.67
 *          azure 4.67/4.70 · gold-ink 4.74/5.46 · amber-ink 4.58/5.16
 *          jade 4.51/5.44 · indigo-ink 5.67/5.80
 *   强调档:cinnabar 4.81/3.02(夜朱作大字 3.02,按钮底已交给深朱)
 *   印面:cinnabar-deep × 奶油白字 7.09(浅)/5.31(夜)
 *   墨档:ink-ghost 已撤(浅 1.66:1 读不清,134 处 text-ink-ghost 全迁 ink-faint)
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')
const TAILWIND = readFileSync(resolve(ROOT, 'tailwind.config.js'), 'utf-8')
const THEME_TS = readFileSync(resolve(ROOT, 'src/core/theme.ts'), 'utf-8')
const PRIVACY = readFileSync(resolve(ROOT, 'public/privacy.html'), 'utf-8')
const INDEX_HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf-8')

type Rgb = readonly [number, number, number]

function bodyOf(scope: RegExp): string {
  const body = scope.exec(CSS)?.[1]
  if (body === undefined) throw new Error('style.css 里找不到这段作用域')
  return body
}

/**
 * 语义色 token 名单 —— 以**浅色那份**为准:它既定义通道值、又派生出完整颜色
 * (`--color-x: rgb(var(--color-x-rgb))`),只存通道值给阴影/color-mix 用的
 * `--color-paper-lifted-rgb` 这类中间量不算 token。
 */
function tokenNames(): Set<string> {
  return new Set(
    [...bodyOf(/:root \{([\s\S]*?)\n\}/).matchAll(/--color-([a-z0-9-]+):\s*rgb\(var\(--color-[a-z0-9-]+-rgb\)\)/g)].map(m => m[1]!)
  )
}

/** 某个作用域里的通道值;夜间那份不重复派生声明,故不要求它自带完整颜色 */
function paletteOf(scope: RegExp, names: Set<string>): Map<string, Rgb> {
  const out = new Map<string, Rgb>()
  for (const m of bodyOf(scope).matchAll(/--color-([a-z0-9-]+)-rgb:\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    if (names.has(m[1]!)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4])] as const)
  }
  return out
}

const TOKENS = tokenNames()
const LIGHT = paletteOf(/:root \{([\s\S]*?)\n\}/, TOKENS)
const DARK = paletteOf(/html\[data-theme='dark'\] \{([\s\S]*?)\n\}/, TOKENS)

/** 三张铺字底:纸 / 纸深 / 卡片(卡片是 --color-paper-lifted,比纸略亮,最伤浅色字) */
function surfacesOf(theme: 'light' | 'dark'): Rgb[] {
  const p = theme === 'light' ? LIGHT : DARK
  const body = theme === 'light' ? bodyOf(/:root \{([\s\S]*?)\n\}/) : bodyOf(/html\[data-theme='dark'\] \{([\s\S]*?)\n\}/)
  const m = /--color-paper-lifted-rgb:\s*(\d+)\s+(\d+)\s+(\d+);/.exec(body)
  if (m === null) throw new Error('style.css 里找不到卡片色 --color-paper-lifted-rgb')
  return [p.get('paper')!, p.get('paper-deep')!, [Number(m[1]), Number(m[2]), Number(m[3])] as const]
}

/** 正文承载档:浅/夜两套、三张底全 ≥4.5 */
const STRONG = ['ink', 'ink-soft', 'ink-faint', 'violet-ink', 'azure', 'gold-ink', 'amber-ink', 'jade', 'indigo-ink']
/** 强调档(标题/大字):≥3 大字 AA;提过 4.5 后挪进 STRONG */
const WEAK = ['cinnabar']

function channel(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** 一档颜色在它那套主题上最难看的那一面(三底取最小) */
function worst(name: string, theme: 'light' | 'dark'): number {
  const color = (theme === 'light' ? LIGHT : DARK).get(name)!
  return Math.min(...surfacesOf(theme).map(bg => contrast(color, bg)))
}

function hexOf(rgb: Rgb): string {
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** 扫源码文本,回报命中的文件(用于"某某名字不该再出现"这类判据) */
function filesMatching(dir: string, pattern: RegExp, ext: RegExp): string[] {
  const hits: string[] = []
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = resolve(d, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (ext.test(entry.name) && !entry.name.endsWith('.spec.ts') && pattern.test(readFileSync(path, 'utf-8'))) {
        hits.push(path.slice(ROOT.length + 1))
      }
    }
  }
  walk(dir)
  return hits
}

describe('调色板 · 一份事实源', () => {
  it('浅色/夜间两套主题的 token 一一对应(夜间只覆盖通道值,不许只在一边定义)', () => {
    expect([...DARK.keys()].sort()).toEqual([...LIGHT.keys()].sort())
  })

  it('每个 token 都在 tailwind 里有对应的语义色,且 tailwind 不留没定义的 token', () => {
    const declared = new Set([...TAILWIND.matchAll(/withAlpha\('--color-([a-z0-9-]+)-rgb'\)/g)].map(m => m[1]!))
    expect([...LIGHT.keys()].sort()).toEqual([...declared].sort())
  })

  it('没有"同值异名"的两个 token(历史上 qinghua 与 azure 就是同一个 RGB,qinghua 已撤)', () => {
    for (const [theme, p] of [
      ['light', LIGHT],
      ['dark', DARK]
    ] as const) {
      const seen = new Map<string, string>()
      for (const [name, rgb] of p) {
        const key = rgb.join(' ')
        const prev = seen.get(key)
        expect(prev, `${theme} 主题下 ${name} 与 ${prev} 是同一个颜色`).toBeUndefined()
        seen.set(key, name)
      }
    }
  })
})

describe('调色板 · 承载文字的色都过线', () => {
  it('正文档:两套主题、三张底都 ≥4.5:1', () => {
    const bad: string[] = []
    for (const name of STRONG) {
      for (const theme of ['light', 'dark'] as const) {
        const w = worst(name, theme)
        if (w < 4.5) bad.push(`${name}@${theme} ${w.toFixed(2)}:1`)
      }
    }
    expect(bad, '正文档承载 10-14px 小字,达不到 AA 就别留在 STRONG 档').toEqual([])
  })

  it('强调档:守 ≥3:1 大字 AA(标题/图标/大字的主场)', () => {
    const bad: string[] = []
    for (const name of WEAK) {
      for (const theme of ['light', 'dark'] as const) {
        const w = worst(name, theme)
        if (w < 3) bad.push(`${name}@${theme} ${w.toFixed(2)}:1`)
      }
    }
    expect(bad, '强调档也承载文字,跌破 3:1 就真的看不见了').toEqual([])
  })

  it('纸上的墨只有三档:ink-ghost 已撤档,四处都不得请它回来', () => {
    expect(LIGHT.has('ink-ghost'), 'ghost 档已撤,不许作为 token 复活').toBe(false)
    expect(TAILWIND).not.toContain('ink-ghost')
    expect(PRIVACY).not.toContain('ink-ghost')
    // src 里的 .vue/.ts 也不许再手写这个类名(没有 token 就不生成样式,写了等于隐形文字)
    expect(filesMatching(resolve(ROOT, 'src'), /ink-ghost/, /\.(vue|ts)$/)).toEqual([])
  })
})

describe('调色板 · 印面', () => {
  /** .btn-seal 上那行固定奶油字,与 style.css 里的字面量必须一致 */
  const SEAL_INK: Rgb = [246, 241, 229]

  it('奶油白字与 style.css 里 .btn-seal 写死的字面量一致', () => {
    // 改了色号却忘了这一处,判据要能喊住
    expect(CSS).toMatch(/\.btn-seal \{[^}]*color: #f6f1e5/)
  })

  it('两套主题的印面都托得住奶油白字 ≥4.5:1', () => {
    // 浅色印面=cinnabar;夜主题覆盖成 cinnabar-deep(深朱)
    expect(contrast(LIGHT.get('cinnabar')!, SEAL_INK)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(DARK.get('cinnabar-deep')!, SEAL_INK)).toBeGreaterThanOrEqual(4.5)
  })

  it('夜主题印面确实用深的那枚(亮朱当底会把奶油字压到 3.81:1)', () => {
    // 深底托白字更高:deep 5.31 > 亮朱 3.81 —— 这正说明 deep 是更暗的那枚
    expect(contrast(DARK.get('cinnabar-deep')!, SEAL_INK)).toBeGreaterThan(contrast(DARK.get('cinnabar')!, SEAL_INK))
    expect(CSS).toMatch(/html\[data-theme='dark'\] \.btn-seal \{[^}]*background: var\(--color-cinnabar-deep\)/)
  })
})

describe('调色板 · 两处手抄关系', () => {
  it('浏览器 chrome 色跟的是纸色(theme.ts 与 index.html 首帧 meta 互为一致)', () => {
    const m = /const THEME_CHROME = \{ light: '(#[0-9A-Fa-f]{6})', dark: '(#[0-9A-Fa-f]{6})' \}/.exec(THEME_TS)
    expect(m, 'core/theme.ts 里的 THEME_CHROME 变了形状,判据要跟着改').toBeTruthy()
    expect(m![1]!.toUpperCase()).toBe(hexOf(LIGHT.get('paper')!))
    expect(m![2]!.toUpperCase()).toBe(hexOf(DARK.get('paper')!))
    const meta = /name="theme-color" content="(#[0-9A-Fa-f]{6})"/.exec(INDEX_HTML)
    expect(meta, 'index.html 首帧的 theme-color 变了形状,判据要跟着改').toBeTruthy()
    expect(meta![1]!.toUpperCase()).toBe(hexOf(LIGHT.get('paper')!))
  })

  it('public/privacy.html 手抄的那几个颜色与色板一致,且死 token(古代 qinghua)不回魂', () => {
    const body = /:root \{([\s\S]*?)\n {6}\}/.exec(PRIVACY)?.[1]
    expect(body, 'privacy.html 的色板块变了形状,判据要跟着改').toBeTruthy()
    const copied = [...body!.matchAll(/--([a-z0-9-]+):\s*rgb\((\d+) (\d+) (\d+)\)/g)]
    expect(copied.length).toBeGreaterThan(5)
    for (const [, name, r, g, b] of copied) {
      const mine = LIGHT.get(name!)
      expect(mine, `privacy.html 抄了 --${name},色板上没有这个 token`).toBeTruthy()
      expect([Number(r), Number(g), Number(b)]).toEqual([...mine!])
    }
    expect(body).not.toMatch(/qinghua/)
  })
})
