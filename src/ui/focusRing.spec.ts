/**
 * 键盘焦点的朱砂描边 —— 一条没有守卫的隐式依赖。
 *
 * `style.css` 里的 `:focus-visible { outline: 2px solid var(--color-cinnabar) }` 之所以能盖住
 * Tailwind 的 `outline-none`,靠的**只是它写在 `@tailwind utilities` 之后**:
 * 两者特异性都是 0-1-0(`:focus-visible` 是伪类,`.outline-none` 是类),
 * 同分时后写的胜。一旦有人把这段挪到 `@tailwind` 之前、或拆到另一个 CSS 文件按字母序引入,
 * 六个 `outline-none` 的输入框与 `main` 就再也没有键盘焦点圈 —— 而鼠标用户完全看不出来。
 *
 * 这条依赖此前没有任何断言:全仓搜 `focus-visible` 只有 style.css 自己。
 * `focus-check.mjs` 查的是切页后焦点落在哪,不查描边可不可见。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const CSS = readFileSync(resolve(ROOT, 'src/style.css'), 'utf-8')

/** 源码里所有 .vue 中的 outline-none 用法(样式失效时,这些地方就没有焦点圈) */
function outlineNoneSites(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.vue') && readFileSync(full, 'utf-8').includes('outline-none')) {
        out.push(full.slice(ROOT.length + 1).replace(/\\/g, '/'))
      }
    }
  }
  walk(resolve(ROOT, 'src'))
  return out
}

describe('键盘焦点圈 · 全局描边必须压得住 outline-none', () => {
  it('描边规则写在 @tailwind utilities 之后(同特异性,后写的胜)', () => {
    const utilitiesAt = CSS.indexOf('@tailwind utilities')
    const focusAt = CSS.search(/^:focus-visible\s*\{/m)
    expect(utilitiesAt, 'style.css 里找不到 @tailwind utilities').toBeGreaterThanOrEqual(0)
    expect(focusAt, 'style.css 里找不到顶层的 :focus-visible 规则').toBeGreaterThanOrEqual(0)
    expect(
      focusAt,
      ':focus-visible 挪到了 @tailwind utilities 之前 —— 六个 outline-none 的输入框会失去键盘焦点圈'
    ).toBeGreaterThan(utilitiesAt)
  })

  it('描边用朱砂,且不吃半透明(半透明描边在暗色纸面上读不出)', () => {
    const block = /^:focus-visible\s*\{([\s\S]*?)\n\}/m.exec(CSS)?.[1] ?? ''
    expect(block, '缺 :focus-visible 规则').not.toBe('')
    expect(block, '描边色须走朱砂 token').toContain('var(--color-cinnabar)')
    expect(block, '描边须有 offset,否则贴边看不清').toContain('outline-offset')
    // 2px 是这份设计里唯一用过的描边宽度;改成 1px 会在密卡上被边框吃掉
    expect(block, '描边宽度应为 2px').toMatch(/outline:\s*2px/)
  })

  /** 印面/卷首题印是朱底,朱砂描边压上去看不见 —— 那两处必须另给浅色 */
  it('朱底按钮的焦点圈换成奶油白,不留在朱砂上', () => {
    const block = /\.btn-seal:focus-visible,[\s\S]*?\.world-seal:focus-visible\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? ''
    expect(block, '缺 .btn-seal / .world-seal 的焦点圈覆盖').not.toBe('')
    expect(block, '朱底上的焦点圈须换浅色').toContain('outline-color')
  })

  it('有 outline-none 的地方确实存在(防空转)', () => {
    const sites = outlineNoneSites()
    expect(sites.length, '一个 outline-none 都没扫到 —— 判据失效了').toBeGreaterThan(0)
  })
})
