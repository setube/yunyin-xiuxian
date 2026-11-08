/**
 * 禁用按钮要给拒因。
 *
 * AGENTS.md「禁用即给原因」:禁用按钮上直接写拒因(状态词或差额),不写句子;
 * 纯图标钮的拒因放 aria-label 与 title。此前只有几处零散的文案测试
 * (affixTransferText / cultivationText)各查自己所辖范围,没有一条统一治理。
 *
 * 判据刻意宽松:只要按钮正文里出现括号拒因、或带 aria-label / title、
 * 或正文是三元表达式(多半是「可用时 X,不可用时 X(拒因)」),就算有拒因。
 *
 * 三种「拒因不写进按钮」的合法情形,下面单列成白名单并写明原因,
 * 免得日后有人照着宽松判据把它们当成缺口去改:
 *   1. 拒因由页面上的提示行承担(背包的丹药详情:拦因见 currentPillHint)
 *   2. 正文来自已含拒因的变量(图鉴的 askLabel 会写「悟道点尚差 N」)
 *   3. 常规表单校验(同意隐私勾选),置灰本身就是标准交互
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src/components', 'src/views']

function vueFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      // 白名单写的是正斜杠路径,Windows 上 join 出来是反斜杠
      else if (ent.name.endsWith('.vue')) out.push(full.replace(/\\/g, '/'))
    }
  }
  for (const r of ROOTS) walk(r)
  return out
}

/**
 * 已知的三类「拒因不写在按钮上」。按 文件名 + 文件名内可辨认的静态文本 定位,
 * 不按行号(行号一改就失效)。
 */
const REASON_ELSEWHERE: readonly (readonly [string, string])[] = [
  ['src/views/InventoryView.vue', '服 用'],
  ['src/views/RealmCodexView.vue', '{{ askLabel }}'],
  ['src/views/CreateView.vue', '{{ rerollLabel }}'],
  ['src/views/WelcomeView.vue', '同意并开始'],
  ['src/components/equipment/AffixTransferFooter.vue', 'flow.blockLabel'],
  /**
   * 熔炉的「熔尽本包」:置灰只发生在「存量不够一炉」,而存量就写在同一个卡片里
   * (`存 900` 那一行),差额为零本身即是原因 —— 钮上再写一遍「(存量不足一炉)」是重复。
   */
  ['src/components/celestial/FurnaceDialog.vue', '熔尽本包']
]

describe('禁用按钮 · 要给拒因', () => {
  it('扫到了 Vue 文件与若干禁用按钮(防空转)', () => {
    expect(vueFiles().length).toBeGreaterThan(50)
    let disabled = 0
    for (const f of vueFiles()) {
      disabled += (readFileSync(f, 'utf-8').match(/:disabled|<button[^>]*\bdisabled\b/g) ?? []).length
    }
    expect(disabled, '一个禁用按钮都没扫到').toBeGreaterThan(20)
  })

  /**
   * 取开标签的完整文本。
   *
   * 不能用 `/<button\b[^>]*>/` —— 属性值里常有 `>`(`:disabled="x > 0"`),
   * 那样会在引号中间截断,截断点之后的 `title` / `aria-label` 就看不见了,
   * 于是「有拒因」被判成「没拒因」(或反过来)。全仓 289 个按钮里 11 个会截断。
   */
  function openTags(text: string, tagName: string): { tag: string; index: number }[] {
    const out: { tag: string; index: number }[] = []
    for (const m of text.matchAll(new RegExp(`<${tagName}\\b`, 'g'))) {
      let i = m.index! + m[0].length
      let quote: string | null = null
      while (i < text.length) {
        const ch = text[i]!
        if (quote) {
          if (ch === quote) quote = null
        } else if (ch === '"' || ch === "'") {
          quote = ch
        } else if (ch === '>') {
          out.push({ tag: text.slice(m.index!, i + 1), index: m.index! })
          break
        }
        i += 1
      }
    }
    return out
  }

  it('除白名单外,每个禁用按钮都带得出拒因', () => {
    const bad: string[] = []
    for (const file of vueFiles()) {
      const text = readFileSync(file, 'utf-8')
      for (const { tag, index } of openTags(text, 'button')) {
        if (!/:disabled|\bdisabled\b/.test(tag)) continue
        const end = index + tag.length
        const close = text.indexOf('</button>', end)
        const raw = close > 0 ? text.slice(end, close) : ''
        const plain = raw.replace(/<[^>]+>/g, '').trim()
        const hasReason =
          plain.includes('(') ||
          plain.includes('（') ||
          /aria-label|:?title=/.test(tag) ||
          (raw.includes('?') && raw.includes(':'))
        if (hasReason) continue
        const waived = REASON_ELSEWHERE.some(([f, needle]) => file.endsWith(f) && raw.includes(needle))
        if (waived) continue
        const line = text.slice(0, index).split('\n').length
        bad.push(`${file}:${line}(${plain.slice(0, 24)})`)
      }
    }
    expect(bad, `这些禁用按钮没说为什么不能点:\n${bad.join('\n')}`).toEqual([])
  })

  /**
   * 禁用态不许靠「整块压透明度」表达。
   *
   * style.css 里 `.btn-ghost:disabled` 的注释写着「压色不压字:字常常正是门槛本身,
   * 整块压到 40% 透明只剩 2.23:1」—— 而调用点上多处在按钮/卡片上又叠了一层 opacity-*。
   * 实测日主题(卡底 244,240,230):ink 压 40% 只剩 2.30、ink-soft 1.99、
   * 拒因用的 cinnabar 1.84 —— 一律远低于 4.5。禁用的形状由 :disabled 的底色/描边表达,
   * 拒因的文字必须留在可读的对比度上。
   *
   * 判据只查「同一元素上既有 :disabled 或 disabled: 变体、又有 opacity-*」这一种叠加。
   * 纯装饰物的 opacity(如名号册里那枚未得的印)不在管辖内 —— 那里没有正文。
   *
   * 故障注入:任一处把 opacity-* 加回禁用元素,本条红。
   */
  it('禁用态不叠整块透明度(只压色,不压字)', () => {
    const bad: string[] = []
    for (const file of vueFiles()) {
      const text = readFileSync(file, 'utf-8')
      /*
       * 只认「无前缀的 opacity-*」:active:opacity-60 是按下瞬间的反馈,不是禁用态的表达,
       * 而 disabled:opacity-60 与裸 opacity-45 才是把正文压掉的那一类。
       * 用词边界挡掉 `active:opacity-60` / `hover:opacity-80`,别把交互反馈算成可比性问题。
       */
      for (const { tag, index } of openTags(text, 'button')) {
        if (!/:disabled|\bdisabled\b|disabled:/.test(tag)) continue
        const line = text.slice(0, index).split('\n').length
        const bare = /(?<![\w:-])opacity-(?:[1-9]|[1-9][0-9])\b/.exec(tag)
        if (bare) bad.push(`${file}:${line} 的 ${bare[0]}`)
        const dimVariant = /disabled:opacity-\d+/.exec(tag)
        if (dimVariant) bad.push(`${file}:${line} 的 ${dimVariant[0]}`)
      }
      // :class 里按状态挂裸 opacity 的,与 :disabled 同为一颗钮也算
      for (const m of text.matchAll(/<button[\s\S]{0,900}?:disabled[\s\S]{0,400}?'opacity-(?:[1-9]|[1-9][0-9])'/g)) {
        const line = text.slice(0, m.index!).split('\n').length
        const hit = `${file}:${line} 的 opacity 挂在禁用钮上`
        if (!bad.some(b => b.startsWith(`${file}:${line} `))) bad.push(hit)
      }
    }
    expect(bad, `这些禁用态把正文一起压透明了(拒因会读不出):\n${bad.join('\n')}`).toEqual([])
  })

  it('本轮补的三处拒因还在', () => {
    const known: readonly (readonly [string, string])[] = [
      ['src/components/market/MarketSellSection.vue', "'寄卖(席位已满)'"],
      ['src/views/ApprenticeView.vue', "'各尽其长(无闲置)'"],
      ['src/components/character/ReincarnationDialog.vue', "'踏入轮回(先择先天之姿)'"]
    ]
    for (const [file, needle] of known) {
      expect(readFileSync(file, 'utf-8'), `${file} 少了 ${needle}`).toContain(needle)
    }
  })
})
