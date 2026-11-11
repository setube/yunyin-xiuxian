/**
 * 差额必须报出「缺的是哪一样」。
 *
 * AGENTS.md「缺资源」明文:知道差额写「X尚差 N」,缺哪样报哪样;拿不到差额才写「X不足」。
 * 光写「尚差 5」时,玩家得回头猜是哪一种 —— 而同屏往往同时挂着灵石、道源、器灵尘三种。
 *
 * 实测三处(真实 DOM 读到的正文):
 *   · ExpeditionPanel 虚界两枚钮写「再窥(尚差5)」/「窥探虚界(尚差5)」
 *     —— 而同一颗钮的 title 写的是「道源尚差 5」,正文与 title 自己就对不上
 *   · VeinInvestCard「改立主脉」写「尚差 1.2万」,title 写「灵石尚差 1.2万」
 *   · MarketShelfSection 买下钮写「尚差 8」,title 写「灵石尚差 8」
 *
 * 判据:模板里凡是 `尚差 ${...}` / `尚差 {{...}}` 紧跟数字的,
 * 前面必须有资源名。整数计数(「尚差 N 场」「尚差 N 页」)带单位,不算违规。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/*
 * 两类落点都扫:模板(.vue)与文案层(.ts 的 *Text 模块)。
 * `upgradeShortToast` 那种在 .ts 里拼「灵石尚差 N」的写法同样面向玩家 ——
 * 只扫 .vue 会漏掉半个文案层。
 */
const VUE_ROOTS = ['src/components', 'src/views']
const TS_FILES = ['src/ui/buildingText.ts', 'src/ui/cultivationText.ts', 'src/ui/forgeText.ts', 'src/ui/gongfaText.ts', 'src/ui/pillText.ts', 'src/ui/reforgeText.ts', 'src/ui/resourceShortText.ts', 'src/ui/affixTransferText.ts']
/**
 * 通用差额句的唯一实现:第一条判据在这里不适用。
 *
 * `shortageText(name, amount)` 把资源名当**参数**收,句中自然没有字面量资源名 ——
 * 它正是「灵石尚差 N / 器灵尘尚差 N / 悟道点尚差 N」这一族的共同出口。
 * 于是把「缺的是哪一样」的检查挪到**调用点**:见下一节那条。
 */
const GENERIC_HELPER = 'src/ui/resourceShortText.ts'
/** 能出现在「尚差」前面的资源名。缺一样就报一样,不写「资源尚差」这种统称 */
const RESOURCES = ['灵石', '道源', '道果', '宿慧', '器灵尘', '灵草', '玄铁', '残页', '悟道点', '灵气']

function vueFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.name.endsWith('.vue')) out.push(full.replace(/\\/g, '/'))
    }
  }
  for (const r of VUE_ROOTS) walk(r)
  return out
}

/**
 * 差额指向「这一张卡已经点名的东西」—— 名字就在同一行的左半,不必在钮里再说一遍。
 *
 * 坊市售出:每一行是一种材料(`m.name` 渲染在左边),钮上的「尚差 4」指的就是它;
 * 写成「灵草尚差 4」反而与「存 / 每摞」两段读数挤在同一行。
 */
const SAME_ITEM_CARDS: readonly { file: string; marker: string }[] = [
  { file: 'market/MarketSellSection.vue', marker: 'm.count < MARKET_MAT_COUNT' }
]

/** 剥掉 HTML 与 JS 注释:注释里提到「尚差」不算玩家可见文案 */
function stripComments(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}

export interface Bare {
  file: string
  line: number
  snippet: string
}

/**
 * 找「尚差」直接接数字、而同一处文本里没有资源名的位置。
 *
 * 判据不看整行,只看「尚差」前后各一小段:资源名可以写在插值里(「灵石尚差 {{ x }}」),
 * 也可以写在同一句话的前面(「耗灵石 … 尚差 {{ x }}」)—— 后者也合规,因为玩家读到的是同一行。
 */
export function findBareShortfalls(text: string, file: string): Bare[] {
  const out: Bare[] = []
  for (const m of text.matchAll(/尚差/g)) {
    const at = m.index ?? 0
    // 前一段:同一行之内(模板里一条提示通常不跨行)
    const lineStart = text.lastIndexOf('\n', at) + 1
    const before = text.slice(lineStart, at)
    if (RESOURCES.some(r => before.includes(r))) continue
    // 紧随其后的内容(跳过「尚差」二字本身):插值或数字
    const after = text.slice(at + 2, at + 62)
    if (!/^\s*(\{\{|\$\{)/.test(after)) continue
    // 带单位的整数计数(「尚差 {{ n }} 场」)不算缺资源
    if (/^\s*(\{\{[^}]*\}\}|\$\{[^}]*\})[^`}]*(场|页|部|缕|块|枚|次|件|层|点)/.test(after)) continue
    // 差额针对的是「同一张卡已经点名的东西」时不算
    if (SAME_ITEM_CARDS.some(c => file.endsWith(c.file) && before.includes(c.marker))) continue
    /*
     * 拼装型:先算出「尚差 N / 不足」这半句,下一行再拼主语
     * (`const missing = amount ? `尚差 ${amount}` : '不足'; return `灵石${missing}``)。
     * 主语在**下一行**,不在 before 窗口里 —— 这类与「灵石尚差 N」等价,不算缺主语。
     */
    /*
     * 拼装型:把「尚差 N / 不足」当成一个片段算出来,下一句再拼主语。
     * 两种三元写法都算:
     *   `amount ? `尚差 ${amount}` : '不足'`      (判别式在前)
     *   `amount === undefined ? '不足' : `尚差 ${amount}``  (判别式取反)
     * 主语在**下一句**,不在 before 窗口里 —— 与「灵石尚差 N」等价。
     */
    const ahead = text.slice(at, at + 300)
    const pieceInFront = /^\s?\$\{[^}]+\}`?\s*:\s*'不足'/.test(after)
    const pieceBehind = /'不足'\s*:\s*`$/.test(before)
    if ((pieceInFront || pieceBehind) && RESOURCES.some(r => ahead.includes(r))) continue
    out.push({ file, line: text.slice(0, at).split('\n').length, snippet: '…' + before.slice(-40).trim() + '尚差' + after.slice(0, 30).replace(/\s+/g, ' ') })
  }
  return out
}

describe('差额报出缺的是哪一样', () => {
  it('模板里的「尚差」前面都有资源名', () => {
    const bad: Bare[] = []
    let scanned = 0
    for (const f of [...vueFiles(), ...TS_FILES]) {
      if (f === GENERIC_HELPER) continue
      const text = stripComments(readFileSync(resolve(__dirname, '../..', f), 'utf-8'))
      scanned += 1
      bad.push(...findBareShortfalls(text, f))
    }
    expect(scanned, '扫到的文件太少,判据空转').toBeGreaterThan(50)
    const report = bad.map(b => `${b.file}:${b.line} 「${b.snippet}」`).join('\n')
    expect(bad.length, `这些地方只写「尚差 N」,没说缺的是哪一样:\n${report}`).toBe(0)
  })

  it('判据抓得住:伪造一条不带资源名的即报', () => {
    // 旧写法原样复刻:资源名只在 title 里,正文这条模板串里没有
    const fake = '>{{ `再窥(尚差${daoSourceShortText(COST, have)})` }}</button>'
    const hits = findBareShortfalls(fake, 'fake.vue')
    expect(hits, '这条正是修掉的那种写法,判据该报').toHaveLength(1)
    expect(hits[0]?.snippet).toContain('尚差')
  })

  it('不误伤:带资源名的、带单位的都不算', () => {
    expect(findBareShortfalls('>{{ `再窥(道源尚差${x})` }}', 'ok.vue')).toHaveLength(0)
    expect(findBareShortfalls('>{{ `灵石尚差 ${x}` }}', 'ok2.vue')).toHaveLength(0)
    expect(findBareShortfalls('<span>· 尚差 {{ pageShort }} 页</span>', 'ok3.vue')).toHaveLength(0)
    expect(findBareShortfalls('<span>距 {{ n }} 连胜尚差 {{ m }} 场</span>', 'ok4.vue')).toHaveLength(0)
  })

  /**
   * 通用差额句的调用点必须传字面量资源名。
   *
   * `shortageText(name, amount)` 是「X尚差 N / X不足」这一族的唯一出口,
   * 于是「缺的是哪一样」这件事落到了调用方的第一个实参上 ——
   * 传字面量「灵石」是玩家读到的,传一个变量名就会拼出「undefined尚差 5」这类东西,
   * 而第一条判据(按字面量资源名查)扫不到它。
   */
  it('通用差额句的调用点都传字面量资源名', () => {
    const files = [...vueFiles(), ...TS_FILES]
    const bad: string[] = []
    let calls = 0
    for (const f of files) {
      const text = stripComments(readFileSync(resolve(__dirname, '../..', f), 'utf-8'))
      for (const m of text.matchAll(/\bshortageText\(/g)) {
        // 声明那一处不是调用
        if (/function\s+$/.test(text.slice(Math.max(0, m.index! - 12), m.index!))) continue
        calls += 1
        const arg = /shortageText\(\s*([^,)]+)/.exec(text.slice(m.index!))?.[1]?.trim() ?? ''
        /*
         * 两种合法形态:
         *   一 整个实参就是一个字面量资源名 —— `shortageText('灵石', gap)`
         *   二 三元里两支都是字面量资源名 —— `shortageText(short === 'stone' ? '灵石' : '器灵尘', …)`
         *      (resourceShortText 自己就这么写:它把「缺哪一样」翻译成名字,两支都已点名)
         * 变量名、模板串、函数调用一律算「没说缺的是哪一样」。
         */
        const LITERAL = /['"`]([^'"`$]+)['"`]/g
        // 只看会印到屏幕上的那几支:资源名是中文;三元里的判别值(如 'stone')是键,不印出来
        const shown = [...arg.matchAll(LITERAL)].map(x => x[1]!).filter(n => /[\u4e00-\u9fa5]/.test(n))
        const allNamed = shown.length > 0 && shown.every(n => RESOURCES.includes(n))
        if (!allNamed) bad.push(`${f}: 第一实参是 ${arg || '(空)'}`)
      }
    }
    expect(calls, '一处调用都没扫到 —— 判据空转').toBeGreaterThan(0)
    expect(bad, `短差句的调用点没说缺的是哪一样:\n${bad.join('\n')}`).toEqual([])
  })

  it('判据抓得住:第一实参写成变量即报', () => {
    // 直接按上面的规则判:变量名不是 RESOURCES 里的字面量
    const arg = 'name'
    const literal = /^['"`]([^'"`$]+)['"`]$/.exec(arg)?.[1]
    expect(literal === undefined || !RESOURCES.includes(literal), '这条该判违规').toBe(true)
    expect(RESOURCES.includes('灵石')).toBe(true)
  })
})
