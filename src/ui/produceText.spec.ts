import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { produceTierText } from './produceText'

/** 地界物产阶位文案 —— 「此界掉几阶」在出发前亮出,页面只许调用不许手打 */
describe('地界物产文案', () => {
  it('报出阶位', () => {
    expect(produceTierText(6)).toContain('6 阶')
    expect(produceTierText(26)).toContain('26 阶')
  })

  it('页面模板只调函数、不手打文案(同源防线)', () => {
    const view = readFileSync(new URL('../views/AdventureView.vue', import.meta.url), 'utf8')
    expect(view).toContain('produceTierText(')
    expect(view).not.toMatch(/产\s+\d+\s*阶之物/)
  })
})
