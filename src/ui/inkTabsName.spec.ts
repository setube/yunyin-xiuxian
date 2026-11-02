/**
 * 页签的可见文案与读屏名是两件事。
 *
 * 坊市的签写「购」「售」—— 两格并排时视觉上够清楚,但读屏念出来是个孤零零的字,
 * 听不出是买东西还是卖东西。`InkTabs` 因此接了一个可选的 `name`,
 * 不给时退回 label(原有各处不受影响)。
 *
 * 判据落在源码上而不是渲染层:单测里挂载 InkTabs 要拖进整套 Vue 运行时,
 * 而这条要守的只是「有没有把 name 递下去」。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = resolve(__dirname, '..')
const read = (rel: string): string => readFileSync(resolve(SRC, rel), 'utf-8')

describe('页签 · 读屏名', () => {
  const tabs = read('components/common/InkTabs.vue')

  it('aria-label 取 t.name,没给时退回 t.label', () => {
    expect(tabs, 'tab 应把 name 递给 aria-label').toMatch(/:aria-label="t\.name \?\? t\.label"/)
    expect(tabs, '缺 aria-selected:读屏听不出选中的是哪一个').toContain(':aria-selected="model === t.id"')
  })

  it('页签容器仍有 tablist 语义', () => {
    expect(tabs).toMatch(/role="tablist"/)
  })

  /**
   * 三条一两个字的主词都得有 name。
   * 故障注入:删掉任一 name,本条红。
   */
  it('坊市的单字签都补了读屏名', () => {
    const view = read('views/MarketView.vue')
    expect(view, '「购」缺读屏名').toContain("label: '购', name:")
    expect(view, '「售」缺读屏名').toContain("label: '售', name:")
    expect(view, '悬赏签也应显式给 name,不靠 label 兜底').toContain("label: '悬赏', name:")
    // 三个 name 都得是完整说法,不是同一个字
    const names = [...view.matchAll(/name: '([^']*)'/g)].map(m => m[1]!)
    expect(names.length, '三个签都该有 name').toBeGreaterThanOrEqual(3)
    for (const n of names) expect(n.length, `读屏名「${n}」太短,起不到解释作用`).toBeGreaterThanOrEqual(2)
    // 名字须以可见的那个字开头:语音控制念「点 购」也要能命中
    const market = read('views/MarketView.vue')
    for (const [label, name] of [['购', '购买'], ['售', '出售']]) {
      expect(market, `读屏名「${name}」没有包含可见文本「${label}」`).toContain(`label: '${label}', name: '${name}'`)
    }
  })

  /**
   * 战报速度的可见文案只有 ×2,读屏念「times two」没有主语。
   * 名字里带上可见的 `×2` 本身:语音控制念「点 ×2」也要能命中
   * (WAI-ARIA:可访问名应包含可见文本)。
   */
  it('战报速度的钮各自带上「战报速度 ×N」', () => {
    const pref = read('components/settings/SettingsPreferenceSection.vue')
    expect(pref, '战报速度钮缺可访问名').toContain(':aria-label="`战报速度 ×${s}`"')
    expect(pref, '战报速度钮应保留 aria-pressed').toContain(':aria-pressed="settings.battleSpeed === s"')
  })

  /**
   * 可访问名须包含可见文本 —— 否则语音控制用户念着屏幕上的字却点不中。
   * 实例:星象定向的可见文本会随定向状态变成「星象定向 · 仙界 ▾」,
   * 而名字写死成「星象定向」,两者对不上。
   */
  it('星象定向的可访问名跟着可见文案走', () => {
    const view = read('views/AdventureView.vue')
    // 连「▾」也算进名字:那是可见文本的一部分,念「点 星象定向 ▾」同样要能命中
    expect(view, '名字须包含动态后缀与 ▾').toContain(':aria-label="`星象定向${redirectActiveText} ▾`"')
    expect(view, '不该退回写死的静态名').not.toContain('aria-label="星象定向"')
  })
})
