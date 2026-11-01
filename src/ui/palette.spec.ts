/**
 * 调色板判据。单一事实源:src/style.css 语义色变量 + tailwind.config.js 转发;界面与数据层只引用变量。
 *
 * 一 两处对不上:tailwind 配了、CSS 变量没定义(或反过来),类名不生成。
 * 二 同值异名:两个 token 同一 RGB。
 * 三 浅/夜两套对不上:夜间只覆盖通道值,不许只在一边定义 token。
 * 四 小字读不清,按角色过线:正文承载档浅/夜都 ≥4.5:1;印面只考核托奶油白字,
 *    夜主题印面为深朱(亮朱当底 3.81:1);强调档(朱)≥3:1(大字 AA);
 *    墨只有三档,ink-ghost(浅 1.66:1)已撤,不得复活。
 * 五 手抄回流:theme.ts 的 chrome 色、index.html 首帧 meta、public/privacy.html 不能引用 CSS 变量,只能抄。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { QUALITIES } from '@/data/qualities'
import { DAO_QUALITY_COLOR, DAO_QUALITY_NAME } from '@/data/pills'
import { ELEMENTS } from '@/data/linggen'

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
 * 语义色 token 名单,以浅色为准:只认派生出完整颜色的(`--color-x: rgb(var(--color-x-rgb))`);
 * 只存通道值的中间量(`--color-paper-lifted-rgb`)不算 token。
 */
function tokenNames(): Set<string> {
  return new Set(
    [...bodyOf(/:root \{([\s\S]*?)\n\}/).matchAll(/--color-([a-z0-9-]+):\s*rgb\(var\(--color-[a-z0-9-]+-rgb\)\)/g)].map(m => m[1]!)
  )
}

/** 某作用域里的通道值;夜间不重复派生声明,不要求自带完整颜色 */
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

/** 三张铺字底:纸 / 纸深 / 卡片(--color-paper-lifted,比纸略亮) */
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

/** 半透明前景混到不透明底上;与浏览器绘制品阶淡底同口径 */
function mix(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return fg.map((v, i) => Math.round(v * alpha + bg[i]! * (1 - alpha))) as unknown as Rgb
}

/** 一档颜色在其主题上的对比度,三底取最小 */
function worst(name: string, theme: 'light' | 'dark'): number {
  const color = (theme === 'light' ? LIGHT : DARK).get(name)!
  return Math.min(...surfacesOf(theme).map(bg => contrast(color, bg)))
}

function hexOf(rgb: Rgb): string {
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** CIE76 色差;只用于判两档品阶/五行色是否糊在一起 */
function deltaE(a: Rgb, b: Rgb): number {
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const lab = ([r, g, b]: Rgb): [number, number, number] => {
    const [R, G, B] = [channel(r), channel(g), channel(b)]
    const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047
    const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B
    const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
  }
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/** 数据层颜色引用 → 浅色主题的实际 RGB(只许 var(--color-x) 或 6 位 hex) */
function resolveRgb(colorRef: string): Rgb {
  const tokenVar = /var\(--color-([a-z0-9-]+)\)/.exec(colorRef)
  if (tokenVar) return LIGHT.get(tokenVar[1]!)!
  const hex = /^#([0-9a-fA-F]{6})$/.exec(colorRef)
  if (hex) {
    const n = parseInt(hex[1]!, 16)
    return [n >> 16, (n >> 8) & 255, n & 255] as const
  }
  throw new Error(`数据层颜色无法解析为 RGB:${colorRef}`)
}

/** 扫源码文本,回报命中的文件 */
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

/** 色系首段(ink / paper / jade …),用于判工具类后缀像不像色名 */
const FAMILIES = new Set([...TOKENS].map(t => t.split('-')[0]!))
/** 颜色工具类前缀 + 后缀名;后缀后面只能跟分隔符或 /透明度 */
const COLOR_UTILITY =
  /(?<![\w-])(?:text|bg|border(?:-[trblxyse])?|ring(?:-offset)?|outline|decoration|divide|from|via|to|fill|stroke|accent|caret|placeholder)-([a-z]+(?:-[a-z]+)*)(?=[\s"'`/:)\]},]|$)/g

/** 一段源码里引用了、色板里却没有的色名(注释里提到的不算) */
function unknownColorRefs(src: string): string[] {
  const code = src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const out: string[] = []
  for (const m of code.matchAll(COLOR_UTILITY)) {
    const name = m[1]!
    const looksLikeColor = FAMILIES.has(name.split('-')[0]!) || name.endsWith('-ink')
    if (looksLikeColor && !TOKENS.has(name)) out.push(m[0])
  }
  return out
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

  // 只认像色名的写法(首段是已有色系,或以 -ink 结尾);text-left / bg-linear-to-b 等非颜色工具类不在此列
  it('源码里引用的色名都在色板里(写错名字,产物里那条类不生成、颜色静默失效)', () => {
    expect(unknownColorRefs('class="text-ink-faint bg-paper-deep/60 border-cinnabar/40"'), '合法写法不许误报').toEqual([])
    // 故障注入
    expect(unknownColorRefs(`return 'text-jade-ink'`)).toEqual(['text-jade-ink'])
    expect(unknownColorRefs('<p class="text-crimson-ink">')).toEqual(['text-crimson-ink'])
    const offenders: string[] = []
    const walk = (d: string): void => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const path = resolve(d, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.(vue|ts)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
          for (const hit of unknownColorRefs(readFileSync(path, 'utf-8'))) offenders.push(`${path.slice(ROOT.length + 1)} → ${hit}`)
        }
      }
    }
    walk(resolve(ROOT, 'src'))
    expect(offenders, '引用了色板里没有的色名').toEqual([])
  })

  /*
   * Tailwind 3.4 的 /N 走 theme.opacity:默认步长 5 + tailwind.config.js 补的几档。
   * 不在其中的(/12、/14、/3)不报错、不生成,border-t 退成当前文字色。
   * 方括号写法(bg-ink/[0.03])是任意值,不在此列。
   */
  it('斜杠透明度只用配置里有的档位(写了没有的,那条类不生成)', () => {
    const extended = /opacity:\s*\{([^}]*)\}/.exec(TAILWIND)?.[1] ?? ''
    const steps = new Set([...Array.from({ length: 21 }, (_, i) => i * 5), ...[...extended.matchAll(/(\d+):/g)].map(m => Number(m[1]))])
    expect(steps.has(4) && steps.has(8), 'tailwind.config.js 里补的透明度档位没读到').toBe(true)
    const OPACITY = /(?<![\w-])((?:text|bg|border(?:-[trblxy])?|ring|from|via|to|fill|stroke|accent|divide|outline|decoration|shadow)-[a-z]+(?:-[a-z]+)*)\/(\d{1,3})(?![\d\]])/g
    const badSteps = (src: string): string[] =>
      [...src.matchAll(OPACITY)].filter(m => !steps.has(Number(m[2]))).map(m => `${m[1]}/${m[2]}`)
    // 故障注入
    expect(badSteps('class="bg-jade/12 border-violet-ink/12 bg-ink/3 bg-ink/4 border-ink/15"')).toEqual(['bg-jade/12', 'border-violet-ink/12', 'bg-ink/3'])
    const offenders: string[] = []
    const walk = (d: string): void => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const path = resolve(d, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.(vue|ts)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
          for (const hit of badSteps(readFileSync(path, 'utf-8'))) offenders.push(`${path.slice(ROOT.length + 1)} → ${hit}`)
        }
      }
    }
    walk(resolve(ROOT, 'src'))
    expect(offenders, '这些透明度档位不生成;改用步长 5,或在 tailwind.config.js 的 opacity 里补').toEqual([])
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
    expect(filesMatching(resolve(ROOT, 'src'), /ink-ghost/, /\.(vue|ts)$/)).toEqual([])
  })

  /*
   * 半透明字对比度只降不升:cinnabar/80 浅 3.46:1 / 夜 1.9:1,ink-faint/70 2.71:1,azure/90 3.87:1。
   * 要更淡须换一档已过线的 token。装饰性 SVG 填色/描边走 fill-/stroke-,不在此列。
   */
  it('强文本色不叠透明度(半透明字对底色算不出已核过的 AA)', () => {
    // 故障注入
    const TEXTS = [...STRONG, 'cinnabar']
    const re = new RegExp(`(?<![\\w-])text-(${TEXTS.join('|')})/\\d+`, 'g')
    expect('bg-ink/[0.03] text-cinnabar border-ink/15', '非 text- 用法不许误报').not.toMatch(re)
    expect('text-cinnabar/80 text-jade/60', '半透明强文本必须被报').toMatch(re)
    const offenders: string[] = []
    const walk = (d: string): void => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const path = resolve(d, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.(vue|ts)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
          for (const m of readFileSync(path, 'utf-8').matchAll(re)) {
            offenders.push(`${path.slice(ROOT.length + 1)} → ${m[0]}`)
          }
        }
      }
    }
    walk(resolve(ROOT, 'src'))
    expect(offenders, '强文本色带了透明度,对比度必然跌破 AA;改用整色 token ').toEqual([])
  })
})

describe('调色板 · 印面', () => {
  /** .btn-seal 固定奶油字;须与 style.css 字面量一致 */
  const SEAL_INK: Rgb = [246, 241, 229]

  it('奶油白字与 style.css 里 .btn-seal 写死的字面量一致', () => {
    expect(CSS).toMatch(/\.btn-seal \{[^}]*color: #f6f1e5/)
  })

  it('两套主题的印面都托得住奶油白字 ≥4.5:1', () => {
    // 浅色印面 cinnabar;夜主题覆盖成 cinnabar-deep
    expect(contrast(LIGHT.get('cinnabar')!, SEAL_INK)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(DARK.get('cinnabar-deep')!, SEAL_INK)).toBeGreaterThanOrEqual(4.5)
  })

  it('夜主题印面确实用深的那枚(亮朱当底会把奶油字压到 3.81:1)', () => {
    // 夜:deep 5.31 > 亮朱 3.81
    expect(contrast(DARK.get('cinnabar-deep')!, SEAL_INK)).toBeGreaterThan(contrast(DARK.get('cinnabar')!, SEAL_INK))
    expect(CSS).toMatch(/html\[data-theme='dark'\] \.btn-seal \{[^}]*background: var\(--color-cinnabar-deep\)/)
  })

  it('卷首题印(.world-seal)也在 style.css 里钉同样的奶油字,夜主题同样换深朱', () => {
    expect(CSS).toMatch(/\.world-seal \{[^}]*color: #f6f1e5/)
    expect(CSS).toMatch(/html\[data-theme='dark'\] \.world-seal \{[^}]*background: var\(--color-cinnabar-deep\)/)
  })

  it('夜主题禁用态 .btn-seal:disabled 换暗底,92% 白字仍 ≥4.5:1(亮暖灰当底会洗白)', () => {
    // 夜 ink-faint(168 161 140)当底只有 ~2:1;浅色仍用 ink-faint 打底(3.9:1),不得改
    const LIGHT_BG = /\.btn-seal:disabled \{[^}]*background: var\(--color-ink-faint\)/.test(CSS)
    expect(LIGHT_BG, '浅色主题禁用态必须仍用 ink-faint 打底').toBe(true)
    expect(CSS).toMatch(/html\[data-theme='dark'\] \.btn-seal:disabled \{[^}]*background: rgb\(var\(--color-paper-dark-rgb\)\)/)

    const paperDark = DARK.get('paper-dark')
    expect(paperDark, '暗色主题须有 paper-dark 供禁用态打底').toBeTruthy()
    const bg = paperDark!
    const text: Rgb = [255, 255, 255].map((wc, i) => Math.round(0.92 * wc + 0.08 * bg[i]!)) as unknown as Rgb
    expect(contrast(text, bg), '夜主题禁用态 92% 白字在暗底上必须 ≥4.5').toBeGreaterThanOrEqual(4.5)
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

describe('调色板 · 数据层颜色', () => {
  it('稀有品阶角章的主题墨字在品阶淡底上 ≥4.5:1', () => {
    const seals = [
      ...QUALITIES.filter(q => q.rank >= 6).map(q => ({ name: q.name, color: q.color })),
      { name: DAO_QUALITY_NAME, color: DAO_QUALITY_COLOR }
    ]
    const bad: string[] = []
    for (const theme of ['light', 'dark'] as const) {
      const palette = theme === 'light' ? LIGHT : DARK
      const paper = palette.get('paper')!
      const ink = palette.get('ink')!
      for (const seal of seals) {
        const tokenVar = /var\(--color-([a-z0-9-]+)\)/.exec(seal.color)
        const hex = /^#([0-9a-fA-F]{6})$/.exec(seal.color)
        const tone = tokenVar
          ? palette.get(tokenVar[1]!)!
          : ([parseInt(hex![1]!.slice(0, 2), 16), parseInt(hex![1]!.slice(2, 4), 16), parseInt(hex![1]!.slice(4, 6), 16)] as const)
        // 品阶底最深为装备格 13%,角章再叠 12% 同色
        const mark = mix(tone, mix(tone, paper, 0.13), 0.12)
        const ratio = contrast(ink, mark)
        if (ratio < 4.5) bad.push(`${seal.name}@${theme} ${ratio.toFixed(2)}:1`)
      }
    }
    expect(bad, '角章是 9-11px 小字,字形与印底必须过正文 AA').toEqual([])
  })

  it('src/data 与内联色表只许出现白名单 hex —— 不再允许手抄 token 旧值', () => {
    // 白名单 = 无对应 token 的象征色:凡品灰/玄/仙/天(光)/土/风/冰/暗;其余须引 var(--color-*)
    const ALLOWED = new Set(['#A85C3F', '#C9A227', '#3E8E8B', '#8A6F4D', '#5E8C8A', '#6D93B8', '#4A463D', '#857F70'])
    const offenders: string[] = []
    const eat = (path: string, text: string): void => {
      for (const m of text.matchAll(/color:\s*'(#[0-9a-fA-F]{6})'/g)) {
        if (!ALLOWED.has(m[1]!.toUpperCase())) offenders.push(`${path} → ${m[1]}`)
      }
    }
    const walk = (d: string): void => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const path = resolve(d, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.ts$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) eat(path.slice(ROOT.length + 1), readFileSync(path, 'utf-8'))
      }
    }
    walk(resolve(ROOT, 'src/data'))
    eat('src/components/common/SpiritRootReveal.vue', readFileSync(resolve(ROOT, 'src/components/common/SpiritRootReveal.vue'), 'utf-8'))
    expect(offenders, '数据层出现白名单外的裸 hex(疑似又手抄 token 旧值),请改成 var(--color-*) 引用').toEqual([])
  })
})

describe('调色板 · 投影墨不外泄', () => {
  it('--shadow-ink 只进 box-shadow(或它自己的定义),不当可见底色/线/槽/波 —— 夜主题深纸近黑墨会隐形', () => {
    // 纸上可见的线/槽/波用 --color-ink(夜主题翻转成亮墨)
    const residue = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--shadow-ink-rgb:\s*[\d\s]+;/g, '')
      .replace(/--shadow-ink:\s*rgb\([\d\s]+\);/g, '')
      .replace(/box-shadow:\s*[^;]*;/g, '')
    expect(residue).not.toMatch(/shadow-ink/)
    // 防成死 token:投影墨仍须在 box-shadow 里被消费
    expect(CSS).toMatch(/box-shadow:\s*[\s\S]*?shadow-ink/)
  })
})

describe('调色板 · 色阶分得开', () => {
  it('品阶九色 / 五行十一色任意两档 ΔE≥10 —— 压深之后不糊成一团', () => {
    const q9 = QUALITIES.map(q => ({ name: q.name, rgb: resolveRgb(q.color) }))
    const l11 = Object.values(ELEMENTS).map(e => ({ name: e.name, rgb: resolveRgb(e.color) }))
    const pair = (...px: { name: string; rgb: Rgb }[]): string => {
      const tooClose: string[] = []
      for (let i = 0; i < px.length; i += 1) {
        for (let j = i + 1; j < px.length; j += 1) {
          const d = deltaE(px[i]!.rgb, px[j]!.rgb)
          if (d < 10) tooClose.push(`${px[i]!.name}-${px[j]!.name} ΔE ${d.toFixed(1)}`)
        }
      }
      return tooClose.join(' · ')
    }
    expect(q9).toHaveLength(9)
    expect(l11).toHaveLength(11)
    expect(pair(...q9), '品阶两档糊在一起了').toBe('')
    expect(pair(...l11), '五行两档糊在一起了').toBe('')
  })


/**
 * 语义色禁用裸 hex —— 只留两处已登记的例外。
 *
 * AGENTS.md 的规矩是颜色只以 `--color-x-rgb` 定义在 style.css,组件里走语义类。
 * 但有两个组件确实需要固定色,已在各自文件里写明理由:
 *   WarpPortal      全屏黑屏转场:遮罩必须固定近黑、标题必须固定金,跟主题走会黑底黑字
 *   SpiritRootReveal 灵根品阶:杂/伪的土色与天灵根的金不在色板里,要与相邻档拉开距离
 *
 * 本条不是要消灭裸 hex,而是让「下一次有人随手写个 #fff」时能被看见 ——
 * 此前没有任何治理,新增一处裸 hex 完全无人察觉。
 *
 * 判定时跳过注释行(注释里常引用色值做说明)与 `var(--color-x, #fallback)` 兜底写法。
 */
describe('语义色 · 裸 hex 只许出现在已登记的例外', () => {
  const ALLOWED = new Set(['components/common/WarpPortal.vue', 'components/common/SpiritRootReveal.vue'])

  function offenders(): string[] {
    const out: string[] = []
    const walk = (dir: string): void => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, ent.name)
        if (ent.isDirectory()) walk(full)
        else if (ent.name.endsWith('.vue')) {
          const rel = relative('src', full)
          const text = readFileSync(full, 'utf-8')
          for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
            if (!/[a-fA-F]/.test(m[0].slice(1))) continue // 纯数字是议题号
            const lineStart = text.lastIndexOf('\n', m.index!) + 1
            const lineEnd = text.indexOf('\n', m.index!)
            const line = text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
            if (/^\s*\*/.test(line) || /^\s*\/\//.test(line) || /<!--/.test(line)) continue // 注释
            if (/var\(--color/.test(line)) continue // 兜底写法
            if (ALLOWED.has(rel)) continue
            out.push(`${rel}:${text.slice(0, m.index).split('\n').length} ${m[0]}`)
          }
        }
      }
    }
    walk('src/components')
    walk('src/views')
    return out
  }

  it('扫描覆盖到组件与视图', () => {
    expect(readdirSync('src/views').length).toBeGreaterThan(10)
  })

  it('例外文件之外没有裸 hex', () => {
    const bad = offenders()
    expect(bad, `这些地方直接写了色值,应改成语义色:\n${bad.join('\n')}`).toEqual([])
  })

  it('两处例外仍各自写着为什么可以用裸 hex', () => {
    expect(readFileSync('src/components/common/WarpPortal.vue', 'utf-8'), 'WarpPortal 缺例外说明').toContain(
      '本块刻意用裸 hex'
    )
    expect(readFileSync('src/components/common/SpiritRootReveal.vue', 'utf-8'), 'SpiritRootReveal 缺例外说明').toContain(
      '另两档用裸 hex'
    )
  })
})
})
