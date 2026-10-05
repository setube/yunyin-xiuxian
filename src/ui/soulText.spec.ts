import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dissolveNote, refineCostLine } from './soulText'

/** 器魂页文案 —— 后果(毁器/不返)与账目(道源余额)同屏,页面只许调用不许手打 */
describe('器魂页文案', () => {
  it('凝炼台把代价与余额一起报出', () => {
    expect(refineCostLine(10, '25')).toContain('耗道源 10')
    expect(refineCostLine(10, '25')).toContain('现有道源 25')
    expect(refineCostLine(10, '25')).toContain('入炉即毁原器')
  })

  it('散去把「不返」说在前头(不是事后才看见损失)', () => {
    expect(dissolveNote()).toContain('不返')
    expect(dissolveNote()).toContain('道源')
  })

  it('页面模板只调函数、不手打文案(同源防线)', () => {
    const view = readFileSync(new URL('../views/SoulsView.vue', import.meta.url), 'utf8')
    expect(view).toContain('refineCostLine(')
    expect(view).toContain('dissolveNote()')
    expect(view).not.toContain('入炉即毁原器')
    expect(view).not.toContain('道源不返')
  })
})
