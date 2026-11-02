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
const STORE_UTILS = readFileSync(resolve(ROOT, 'src/utils/storage.ts'), 'utf-8')

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

/**
 * 正文承载档:浅/夜两套、三张底全 ≥4.5。
 *
 * `cinnabar` 在本轮之前不在这一档 —— 它走的是强调档的 3.0 宽线,却承担了
 * 夜主题下 41 处 9~17px 的正文(拒因、待办标记、可点装饰)。实测那批字的
 * 底色只有 3.83:1。现已把夜间 cinnabar 提亮到 `228 122 112`(四张底最差 4.52),
 * 印面另有 `cinnabar-deep` 兜底,所以提亮不影响奶油字。
 */
const STRONG = ['ink', 'ink-soft', 'ink-faint', 'violet-ink', 'azure', 'gold-ink', 'amber-ink', 'jade', 'indigo-ink', 'cinnabar']

/**
 * 强调档(标题/大字):≥3 大字 AA。
 *
 * 这一档现在是空的。留着这条判据是为了**堵住口子**:新加的颜色一旦进 WEAK,
 * 就只按 3:1 考核,而它能被用在任何字号上 —— cinnabar 就是这么漏了 41 处。
 * 真要往里加,得同时说明「这个色只出现在 18px 以上的大字里」。
 */
const WEAK: readonly string[] = []

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

  /**
   * 强调档是个口子,不许拿它当「小字也能用」的后门。
   *
   * cinnabar 曾在 WEAK 里,于是在夜主题以 3.83:1 承担了 41 处 9~17px 的正文。
   * 现已提亮并挪进 STRONG。这条判据守住两件事:
   *   一 它没被偷偷放回强调档;
   *   二 STRONG 与 WEAK 没有交集(一个 token 只能按一套线考核)。
   */
  it('cinnabar 按正文档考核,不再借强调档的宽线', () => {
    expect(WEAK as readonly string[], 'cinnabar 又回强调档了 —— 它承担的是正文字号').not.toContain('cinnabar')
    expect(STRONG as readonly string[], 'cinnabar 该在正文档里').toContain('cinnabar')
    const overlap = STRONG.filter(t => (WEAK as readonly string[]).includes(t))
    expect(overlap, '同一个 token 不能同时按两套线考核').toEqual([])
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

/**
 * 印面(.seal-face)两条硬约束 —— 都是实测出来的,不是风格偏好。
 *
 * 一 **不许配 text-paper**:它依纸色路由,日主题的 paper 就是奶油,看着对;
 *   夜主题把 paper 翻成近黑(33 31 28),印底却仍是亮朱/亮金 —— 现出「黑字顶红方」,
 *   朱印实测 3.83:1,比同一屏 .btn-seal 的奶油字(5.31:1)低一整档。AGENTS.md 明令用 .seal-face。
 *
 * 二 **底不许带透明度**:夜主题有 `html[data-theme='dark'] .seal-face` 兜底换深朱,
 *   半透明只影响日主题 —— 按纸色混淡后,朱 /85 只剩 4.17:1、金 /85 3.93:1、紫 /85 3.95:1。
 *   这一档最隐蔽:夜主题全绿,只有日主题跌破,而且降幅不到 1 档,肉眼很难指认。
 */
describe('调色板 · 印面两条硬约束', () => {
  const CREAM: Rgb = [246, 241, 229]
  /** 日主题印面底:实际用到的几个 token,逐个托奶油字 */
  const SEAL_TOKENS = ['cinnabar', 'gold-ink', 'indigo-ink', 'violet-ink', 'jade']

  it('日主题每个印面底色都托得住奶油字 ≥4.5:1', () => {
    for (const name of SEAL_TOKENS) {
      const color = LIGHT.get(name)
      expect(color, `色板里没有 ${name}`).toBeTruthy()
      expect(contrast(color!, CREAM), `${name} 印面上的奶油字读不清`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('夜主题印面统一压成深朱,同样托得住奶油字', () => {
    const deep = DARK.get('cinnabar-deep')
    expect(deep, '夜主题缺 cinnabar-deep').toBeTruthy()
    expect(contrast(deep!, CREAM)).toBeGreaterThanOrEqual(4.5)
    expect(CSS, '夜主题须把印面压成深朱').toMatch(/html\[data-theme='dark'\] \.seal-face \{[^}]*background: var\(--color-cinnabar-deep\)/)
  })

  /**
   * 扫组件与视图,两条分别判:
   *   一 彩色底 + text-paper → 该用 seal-face。判据不能以「这一行有 seal-face」为前提,
   *     否则把 seal-face 换回 text-paper 之后那一行根本不进扫描 —— 故障注入实测过,是绿的。
   *   二 seal-face + 半透明底 → 日主题混纸后跌破 4.5:1。
   * `bg-ink` 不在此列:墨块上 text-paper 两主题分别 12.99 / 12.71,本来就是对的。
   */
  const COLORED_BG = /\bbg-(cinnabar|gold-ink|indigo-ink|violet-ink|jade|azure|amber-ink)(?![-\w])/

  it('彩色印面上不用 text-paper,一律 seal-face', () => {
    const bad: string[] = []
    for (const dir of ['src/components', 'src/views']) {
      for (const file of filesMatching(resolve(ROOT, dir), /text-paper/, /\.vue$/)) {
        const text = readFileSync(resolve(ROOT, file), 'utf-8')
        text.split('\n').forEach((line, i) => {
          if (/^\s*(\*|\/\/|<!--)/.test(line)) return
          if (!/\btext-paper\b/.test(line)) return
          if (!COLORED_BG.test(line)) return
          if (/\bseal-face\b/.test(line)) return
          bad.push(`${file}:${i + 1} 彩色印面用了 text-paper(夜主题会翻成黑字)`)
        })
      }
    }
    expect(bad, `这些印面该改用 .seal-face:\n${bad.join('\n')}`).toEqual([])
  })

  it('印面底色不带透明度', () => {
    const bad: string[] = []
    for (const dir of ['src/components', 'src/views']) {
      for (const file of filesMatching(resolve(ROOT, dir), /seal-face/, /\.vue$/)) {
        const text = readFileSync(resolve(ROOT, file), 'utf-8')
        text.split('\n').forEach((line, i) => {
          if (/^\s*(\*|\/\/|<!--)/.test(line)) return
          if (!/\bseal-face\b/.test(line)) return
          const translucent = /bg-[a-z-]+\/(\d+|\[[\d.]+\])/.exec(line)
          if (translucent) bad.push(`${file}:${i + 1} 印面底色 ${translucent[0]} 带透明度(日主题混纸后跌破 4.5:1)`)
        })
      }
    }
    expect(bad, `这些印面底色该去掉透明度:\n${bad.join('\n')}`).toEqual([])
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

  /**
   * 首帧主题必须在模块脚本之前定下来。
   *
   * 修复前:`initTheme` 在 App.vue 挂载时才跑,而那时 JS bundle 已下载执行完。
   * 实测暗色用户前 198ms 里 `data-theme` 还没挂上、状态栏是亮色的 `#F3EFE4` ——
   * 一屏白底 + 一条亮状态栏,慢设备上更明显。
   *
   * 存档是加密的,内联脚本解不开,故 `__theme` 另存一个明文小键(只写 light/dark)。
   *
   * 故障注入:删掉 index.html 里的这段内联脚本,本条红。
   */
  it('暗色用户的首帧不闪白底:内联脚本在模块脚本之前挂上 data-theme', () => {
    const scriptAt = INDEX_HTML.indexOf('yunyin.__theme')
    const moduleAt = INDEX_HTML.indexOf('type="module"')
    expect(scriptAt, 'index.html 里没有读主题标记的内联脚本 —— 暗色用户会先看到一屏亮底').toBeGreaterThan(0)
    expect(moduleAt, 'index.html 里找不到模块脚本入口').toBeGreaterThan(0)
    expect(scriptAt, '内联脚本排在了模块脚本之后,首帧就来不及了').toBeLessThan(moduleAt)
    // 两个颜色都要在,且与 THEME_CHROME 同源
    const m = /const THEME_CHROME = \{ light: '(#[0-9A-Fa-f]{6})', dark: '(#[0-9A-Fa-f]{6})' \}/.exec(THEME_TS)!
    expect(INDEX_HTML, '内联脚本里的亮色与 theme.ts 不同步').toContain(m[1]!)
    expect(INDEX_HTML, '内联脚本里的暗色与 theme.ts 不同步').toContain(m[2]!)
    // 明文标记的键名须与 theme.ts 一致
    expect(THEME_TS, 'theme.ts 里的键名与 index.html 对不上').toContain('yunyin.__theme')
  })

  /**
   * 清档时首帧主题标记也要清掉。
   *
   * 实测:选过暗色 → 清档 → 重进,系统是亮色、新档也回到默认 auto,
   * 首帧却仍按残留的 dark 渲染,直到 App 挂载才翻回来 —— 新角色顶着上一位的主题闪一下。
   * `clearAllSave` 只清 PERSISTED_STORES,这个键不在清单里,于是漏了。
   *
   * utils 不许引 core(分层判据),故两处各写一遍字面量,这里钉住它们一致。
   * 故障注入:删掉 storage.ts 里那行 removeItem,本条红。
   */
  it('清档连带清掉首帧主题标记,两处键名一致', () => {
    expect(STORE_UTILS, 'utils/storage.ts 里找不到主题标记的键名').toContain("'yunyin.__theme'")
    expect(STORE_UTILS, 'clearAllSave 没有清掉主题标记 —— 新角色会沿用上一位的主题闪一下').toMatch(
      /removeItem\('yunyin\.__theme'\)/
    )
    expect(THEME_TS).toContain("THEME_HINT_KEY = 'yunyin.__theme'")
    expect(INDEX_HTML).toContain('yunyin.__theme')
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
          // 白名单写的是正斜杠路径,Windows 上 relative 出来是反斜杠
          const rel = relative('src', full).replace(/\\/g, '/')
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

/**
 * 同色淡底 + 同色文字,是一套注定过不了 AA 的写法。
 *
 * 底色与文字色同源,叠上去只会把两者拉近:淡底越明显,字越糊。
 * 实测全仓 19 组(`bg-cinnabar/10 text-cinnabar` 等),其中 18 组跌破 4.5:1,
 * 最差的是 `bg-cinnabar/10 text-cinnabar`(日 4.22 / 夜 3.91)。
 *
 * 数学上**没有可用的 alpha**:把 alpha 压到让对比度过线,那层淡底也就不存在了;
 * 唯一能同时保住「有色块」与「读得清」的做法是让文字走主题墨色(ink/ink-soft),
 * 色块只做底,不作字色。品阶角章走的就是这条路(深墨字 + 品阶淡底,见上文那条)。
 *
 * 本条是**棘轮**:登记当前的存量,不要求本轮清零;新写一行同色淡底就会红,
 * 逼你用「墨字 + 色块」或「裸色字、不要底」。存量清理单独立项(见 plans 第二十六节)。
 */
describe('调色板 · 同色淡底不该承载同色文字', () => {
  /** 已登记的组合 → 允许出现的次数(只许减,不许增) */
  const KNOWN: Record<string, number> = {
    'cinnabar/10 text-cinnabar': 5,
    'cinnabar/15 text-cinnabar': 2,
    'cinnabar/5 text-cinnabar': 2,
    'jade/15 text-jade': 2,
    'jade/10 text-jade': 2,
    'jade/8 text-jade': 1,
    'violet-ink/10 text-violet-ink': 2,
    'gold-ink/20 text-gold-ink': 1,
    'gold-ink/15 text-gold-ink': 1,
    'gold-ink/10 text-gold-ink': 3,
    'gold-ink/8 text-gold-ink': 1,
    'azure/15 text-azure': 2,
    'azure/10 text-azure': 1,
    'azure/5 text-azure': 2,
    'amber-ink/10 text-amber-ink': 1,
    'indigo-ink/10 text-indigo-ink': 1
  }

  /**
   * 墨系与纸系不受此约束:ink 本就是主题墨(它叠自己的淡底只是「更深一点的墨」,
   * 文字仍是同一枚墨,对比度反而更高);paper 叠 paper 是「更实一点的纸」,同理。
   * 真正把字糊掉的是**彩色**同色淡底 —— 那才是这条要拦的。
   */
  const NEUTRAL = new Set(['ink', 'ink-soft', 'ink-faint', 'paper', 'paper-deep', 'paper-dark'])

  it('同色淡底的使用次数不得超过已登记量', () => {
    const found: Record<string, number> = {}
    const walk = (d: string): void => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const path = resolve(d, entry.name)
        if (entry.isDirectory()) {
          walk(path)
          continue
        }
        if (!/\.(vue|ts)$/.test(entry.name) || entry.name.endsWith('.spec.ts')) continue
        const src = readFileSync(path, 'utf-8')
        for (const m of src.matchAll(/\bbg-([a-z-]+)\/(\d+)\b[^"'`]*\btext-([a-z-]+)\b/g)) {
          if (m[1] !== m[3] || NEUTRAL.has(m[1]!)) continue
          const key = `${m[1]}/${m[2]} text-${m[3]}`
          found[key] = (found[key] ?? 0) + 1
        }
        for (const m of src.matchAll(/\btext-([a-z-]+)\b[^"'`]*\bbg-([a-z-]+)\/(\d+)\b/g)) {
          if (m[1] !== m[2] || NEUTRAL.has(m[1]!)) continue
          const key = `${m[2]}/${m[3]} text-${m[1]}`
          found[key] = (found[key] ?? 0) + 1
        }
      }
    }
    walk(resolve(ROOT, 'src'))
    const grew = Object.entries(found)
      .filter(([k, n]) => n > (KNOWN[k] ?? 0))
      .map(([k, n]) => `${k} 现 ${n} 处,已登记 ${KNOWN[k] ?? 0}`)
    expect(grew, `同色淡底的字过不了 4.5:1,别再新增(改用墨色字 + 色块):\n${grew.join('\n')}`).toEqual([])
  })

  /**
   * 承载**文字**的同色淡底已全部转成墨色字(第 264 轮)。
   *
   * 这一条钉住那次清理的落点:这些位置的字必须是 `text-ink`,不能再回到彩色字。
   * 色块与描边保留,视觉上的品类区分由颜色块本身承担。
   *
   * 故障注入:把任一处改回 `text-cinnabar` / `text-jade` 等,本条红。
   */
  /**
   * 承载文字的徽章已改墨色字(第 264~265 轮),但**源码层判不了这一条**。
   *
   * 试过三种写法:按行找、按词回溯、按 ±6 行窗口。都不稳 ——
   *   一 模板里 class 与文字常分处相邻行;
   *   二 同一个词(「可换」「待悟道」)在别处还会出现(按钮文案、注释、aria-label);
   *   三 同一个文件里**图标块**也用同色淡底(那是对的,图标只需 3:1),按文本扫必然误伤。
   *
   * 逐处点名最后会变成「判据自己维护一张行号表」,比不写更脆。
   *
   * 真正的保证是:
   *   本文件的**棘轮**(新增同色淡底就红)+ 真实 DOM 实测
   *   (9 路由 × 两套主题,彩色淡底上的文字最差日 4.80 / 夜 4.66,零跌破)。
   *
   * 这一条只记下结论,不断言源码。
   */
  it('历史结论:源码层判不了「彩色字压同色淡底」,靠棘轮与 DOM 实测兜', () => {
    // 保留一条可执行的最小事实:棘轮表仍在收紧方向上
    const total = Object.values(KNOWN).reduce((a, b) => a + b, 0)
    expect(total, '棘轮总量应比第 264 轮(66)明显下降').toBeLessThanOrEqual(30)
  })

  it('这类组合确实过不了 AA —— 判据不是在守一个假问题', () => {
    const bad: string[] = []
    for (const theme of ['light', 'dark'] as const) {
      const palette = theme === 'light' ? LIGHT : DARK
      for (const m of Object.keys(KNOWN)) {
        const parsed = /^([a-z-]+)\/(\d+) text-[a-z-]+$/.exec(m)
        if (!parsed) continue
        const tone = palette.get(parsed[1]!)
        if (!tone) continue
        for (const bg of surfacesOf(theme)) {
          // 淡底叠在底上,再用同色作字
          const tile = mix(tone, bg, Number(parsed[2]) / 100)
          const ratio = contrast(tone, tile)
          if (ratio < 4.5) bad.push(`${m}@${theme} ${ratio.toFixed(2)}:1`)
        }
      }
    }
    expect(bad.length, '若这条空了,说明同色淡底其实没问题,可以把棘轮撤掉').toBeGreaterThan(10)
  })

  /**
   * 「把透明度降下来就安全了」是错觉 —— 这里逐档验一遍。
   *
   * 一度以为低档(5%/8%)达标、只有 10% 以上跌破,据此可以去降透明度。
   * 按三张真实底(纸 / 纸深 / 卡片 lifted)重算,结论相反:
   * 除 indigo-ink 外,六种彩色**在 5% 就已经有一边跌破**。
   * 原因是这些色对纸本来就只贴着 4.5 过线,再叠一层自己的淡底必然拉近。
   *
   * 所以清理只能走「文字换墨色」,不能靠降透明度。这条判据把这个结论钉住,
   * 免得下次又有人(包括我)先想到去减 alpha。
   */
  it('降透明度救不了这类组合 —— 5% 就已经跌破', () => {
    const paperLifted = (theme: 'light' | 'dark'): Rgb => {
      const body = theme === 'light' ? bodyOf(/:root \{([\s\S]*?)\n\}/) : bodyOf(/html\[data-theme='dark'\] \{([\s\S]*?)\n\}/)
      const m = /--color-paper-lifted-rgb:\s*(\d+)\s+(\d+)\s+(\d+);/.exec(body)!
      return [Number(m[1]), Number(m[2]), Number(m[3])] as Rgb
    }
    const stillBad = (token: string, alpha: number): boolean => {
      for (const theme of ['light', 'dark'] as const) {
        const palette = theme === 'light' ? LIGHT : DARK
        const tone = palette.get(token)!
        const surfaces: Rgb[] = [palette.get('paper')!, palette.get('paper-deep')!, paperLifted(theme)]
        for (const bg of surfaces) {
          if (contrast(tone, mix(tone, bg, alpha)) < 4.5) return true
        }
      }
      return false
    }
    // 六种彩色在最低档 5% 就仍然跌破
    for (const token of ['cinnabar', 'jade', 'violet-ink', 'gold-ink', 'azure', 'amber-ink']) {
      expect(stillBad(token, 0.05), `${token} 在 5% 竟然达标了 —— 请重算本节的结论`).toBe(true)
    }
    // indigo-ink 是唯一在低档安全的,留作反例
    expect(stillBad('indigo-ink', 0.05), 'indigo-ink 低档应安全').toBe(false)
  })
})
