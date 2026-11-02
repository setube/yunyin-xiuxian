/**
 * 互斥选择钮必须把「选中」告诉读屏。
 *
 * 这类按钮只靠 :class 换边框/文字色表示选中,视觉上成立,但读屏用户听不出
 * 当前选中了哪一项 —— 触屏读屏( TalkBack / VoiceOver )完全依赖 aria-pressed 之类。
 *
 * 项目里已有正确写法(InkTabs 用 role="tab" + aria-selected,TrialPanel 另几处用 aria-pressed),
 * 但此前没有任何测试钉住它,scripts/aria-check.mjs 也只查 aria-label / role 的存在性,
 * 不查选择态。于是新增一组 chip 很容易又漏掉。
 *
 * 判据刻意收窄,只认「:class 里把自己绑定的变量与循环项比较 且 @click 改写同一变量」,
 * 避免把「按状态改样式」的展示钮(例如按 injury/kind 着色)误判成选择钮。
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
      else if (ent.name.endsWith('.vue')) out.push(full)
    }
  }
  for (const r of ROOTS) walk(r)
  return out
}

/**
 * 列出某个标签的全部开标签文本。
 *
 * 不能用 `/<button\b[^>]*>/` —— 属性值里常有 `>`(`v-if="rounds > 5"`、`:disabled="x > 0"`)。
 * 那样会在引号中间截断,后面的 `:class` / `@click` / `aria-*` 全部落空,
 * 判据于是静默放过。实测全仓 91 处开标签的引号里含 `>`。
 * 这里按引号配对往后走,遇到不在引号里的 `>` 才收尾。
 */
function openTags(text: string, tagName: string): { tag: string; index: number }[] {
  const out: { tag: string; index: number }[] = []
  const head = new RegExp(`<${tagName}\\b`, 'g')
  for (const m of text.matchAll(head)) {
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

/**
 * 找出「互斥选择钮」:样式按 `X === 项` 切换、点击又改到 X,却没带 aria 选中态。
 *
 * 判据刻意保守 —— 只认「直接给变量赋值」这一种写法。
 * 用 setter 函数的(如 TrialPanel 的 setDraftWorld)与函数名对不上变量名,
 * 交给下面第二条的显式清单兜住。宁可少报,不要误报:
 * 宽松判据会把「按状态着色」的展示钮(MentorDialog 的悬停提示、AdventureView 的拒因变色)
 * 也算进来,而那些加 aria-pressed 反而是错的。
 */
function missingAria(): string[] {
  const out: string[] = []
  for (const file of vueFiles()) {
    const text = readFileSync(file, 'utf-8')
    for (const { tag, index } of openTags(text, 'button')) {
      const cls = /:class="([^"]*)"/s.exec(tag)
      const click = /@click="([^"]*)"/s.exec(tag)
      if (!cls || !click) continue
      const cmp = /(\w+)\s*===\s*([\w.!]+)\s*\?/s.exec(cls[1]!)
      if (!cmp) continue
      const varName = cmp[1]!
      if (!new RegExp(`\\b${varName}\\s*=[^=]`).test(click[1]!)) continue
      if (/aria-(pressed|selected|checked)/.test(tag)) continue
      if (/\brole=/.test(tag)) continue
      const line = text.slice(0, index).split('\n').length
      out.push(`${file}:${line}(${varName})`)
    }
  }
  return out
}

/** 已知的选择钮(含用 setter 写法、上面扫不到的那一处),逐条钉住绑定的表达式 */
const KNOWN: readonly (readonly [string, string])[] = [
  ['src/components/inventory/DismantleDialog.vue', ':aria-pressed="settings.smartKeep.minQuality === q.rank"'],
  ['src/components/inventory/DismantleDialog.vue', ':aria-pressed="settings.smartKeep.keepMinTier === t"'],
  ['src/components/celestial/ExpeditionPanel.vue', ':aria-pressed="prepPact === null"'],
  ['src/components/celestial/ExpeditionPanel.vue', ':aria-pressed="prepPact === pact.id"'],
  ['src/components/celestial/ExpeditionPanel.vue', ':aria-pressed="prepGate === null"'],
  ['src/components/celestial/ExpeditionPanel.vue', ':aria-pressed="prepGate === g.id"'],
  ['src/components/celestial/TrialPanel.vue', ':aria-pressed="draft.worldId === w.id"'],
  ['src/components/character/ReincarnationDialog.vue', ':aria-pressed="chosen === id"'],
  ['src/components/character/ReincarnationDialog.vue', ':aria-pressed="theme === t.id"']
]

describe('互斥选择钮 · 选中态要对读屏可见', () => {
  it('扫到了 Vue 文件(防空转)', () => {
    expect(vueFiles().length).toBeGreaterThan(50)
  })

  it('直接赋值的互斥选择钮都带 aria-pressed / aria-selected 或 role', () => {
    const bad = missingAria()
    expect(bad, `这些选择钮只靠颜色表示选中,读屏听不出:\n${bad.join('\n')}`).toEqual([])
  })

  it('已知的九处选择钮都带上了绑定值(而不是写死 true)', () => {
    for (const [file, needle] of KNOWN) {
      expect(readFileSync(file, 'utf-8'), `${file} 少了 ${needle}`).toContain(needle)
    }
  })


/**
 * 展开/收起钮必须带 aria-expanded。
 *
 * 与上面「互斥选择钮」是同一类缺口:视觉上有箭头 ▾ 或「展开/收起」字样,
 * 读屏却听不出这块是可展开的、更听不出现在展开没展开。
 *
 * 判据:点击表达式是自反切换(`x = !x`)或「再点一次取消」(`x = x === y ? null : y`),
 * 且该钮没有 aria-expanded / aria-pressed。
 * 这两类写法不会出现在「按状态着色」的展示钮上,所以不会误报。
 */
describe('展开钮 · 状态要对读屏可见', () => {
  function togglesMissingExpanded(): string[] {
    const out: string[] = []
    for (const file of vueFiles()) {
      const text = readFileSync(file, 'utf-8')
      for (const { tag, index } of openTags(text, 'button')) {
        const click = /@click="([^"]*)"/s.exec(tag)
        if (!click) continue
        const src = click[1]!
        const toggle = /(\w+)\s*=\s*!\1/.exec(src) ?? /(\w+)\s*=\s*\1\s*===/.exec(src)
        if (!toggle) continue
        if (/aria-(expanded|pressed)/.test(tag)) continue
        const line = text.slice(0, index).split('\n').length
        out.push(`${file}:${line}(${toggle[1]})`)
      }
    }
    return out
  }

  it('切换式按钮都带 aria-expanded 或 aria-pressed', () => {
    const bad = togglesMissingExpanded()
    expect(bad, `这些展开钮没告诉读屏展开没展开:\n${bad.join('\n')}`).toEqual([])
  })

  it('三处已知展开钮带的是各自的绑定值', () => {
    const known = [
      ['src/views/RealmCodexView.vue', ':aria-expanded="showAllHex"'],
      ['src/views/AdventureView.vue', ':aria-expanded="mansionRedirectOpen"'],
      ['src/components/market/BountyBoardSection.vue', ':aria-expanded="openEquipOrder === b.idx"']
    ] as const
    for (const [file, needle] of known) {
      expect(readFileSync(file, 'utf-8'), `${file} 少了 ${needle}`).toContain(needle)
    }
  })
})
})
