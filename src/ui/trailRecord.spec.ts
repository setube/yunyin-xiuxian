import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 行迹录的条数报法。
 *
 * 这一段原是 `.slice(0, 8)`,而 `SectionTitle` 的 hint 读的正是截断后的
 * `lossRows.length` —— 玩家看到「行迹录 8 则」,实际可能有二十几条,
 * 而容器 `card-ink divide-y` 本就没有高度限制,截断纯属人为。
 * 修法是去掉截断,让 hint 与实际渲染同源。
 */
describe('行迹录 · 条数与报数同源', () => {
  const src = readFileSync(resolve(__dirname, '../views/LegacyView.vue'), 'utf-8')

  it('lossRows 不再被截断', () => {
    const start = src.indexOf('const lossRows = computed(')
    expect(start, '找不到 lossRows 定义').toBeGreaterThan(0)
    const block = src.slice(start, start + 800)
    expect(block, 'lossRows 又被截断了 —— hint 会报少').not.toContain('.slice(0, 8)')
  })

  it('标题的「N 则」读的就是全量行', () => {
    const line = src.split('\n').find(l => l.includes('行迹录'))
    expect(line, '找不到行迹录标题').toBeTruthy()
    expect(line, 'hint 该读 lossRows.length,不该另算').toContain('lossRows.length')
  })
})
