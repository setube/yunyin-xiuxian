import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { SOUL_TYPES } from '@/data/souls'
import { dissolveNote, refineCostLine, soulFlavorText } from './soulText'

/** 器魂页文案:后果(毁器/不返)与道源余额同屏;页面只许调用不许手打 */
describe('器魂页文案', () => {
  it('凝炼台把代价与余额一起报出', () => {
    expect(refineCostLine(10, '25')).toContain('耗道源 10')
    expect(refineCostLine(10, '25')).toContain('现有 25')
    expect(refineCostLine(10, '25')).toContain('毁原器')
  })

  it('散去把「不返」说在前头(不是事后才看见损失)', () => {
    expect(dissolveNote()).toContain('不返')
    expect(dissolveNote()).toContain('道源')
  })

  it('页面模板只调函数、不手打文案(同源防线)', () => {
    const view = readFileSync(new URL('../views/SoulsView.vue', import.meta.url), 'utf8')
    expect(view).toContain('refineCostLine(')
    expect(view).toContain('dissolveNote()')
    expect(view).not.toContain('入炉毁原器')
    expect(view).not.toContain('道源不返')
  })
})

/**
 * 六类器魂各有一句形意,而界面只印「阶名 · 类型名」:
 * 锋魂与盾魂的区别,得先知道「锋」与「盾」在战斗里各管什么。
 * 数据里那句写得很具体(「此器生来向前,不曾回头,形意里只剩那一分锐」),
 * 原先只在 dataTextAudit 里被扫过文本,从不上界面。
 * 故障注入:把 soulFlavorText 改回恒返回空串,第一条红;从页面删掉它,第二条红。
 */
describe('器魂形意', () => {
  it('六类各取得到那句形意,且与 data/souls 同源', () => {
    for (const def of SOUL_TYPES) {
      const text = soulFlavorText({ type: def.id })
      expect(text, `${def.name} 缺形意句`).toBe(def.desc)
      expect(text.length, `${def.name} 的形意句太短,不像一句形意`).toBeGreaterThan(8)
    }
  })

  it('认不出类型时给空串,调用点据此不印', () => {
    expect(soulFlavorText({ type: 'not-a-type' })).toBe('')
    expect(soulFlavorText({ type: '' })).toBe('')
  })

  it('页面真的接上了 —— 定义了却从不使用的文案是死代码', () => {
    const view = readFileSync(new URL('../views/SoulsView.vue', import.meta.url), 'utf8')
    expect(view, '散置列表应印形意句').toContain('soulFlavorText(soul)')
  })
})
