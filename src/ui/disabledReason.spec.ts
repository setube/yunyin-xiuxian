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
  ['src/components/equipment/AffixTransferFooter.vue', 'flow.blockLabel']
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
