import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { VEINS } from '@/data/veins'
import { INSIGHT_DISCOUNT_CAP, INSIGHT_DISCOUNT_PER_POINT, INSIGHT_EFFECT_NAME } from '@/data/veins'
import { formatPercent } from '@/utils/format'
import { STAT_NAMES } from '@/data/statNames'
import {
  veinEffectText,
  veinFullToast,
  veinPeakToast,
  veinShortToast,
  veinSwitchDoneToast,
  veinSwitchShortToast
} from './veinText'
import type { AnyStatKey } from '@/types'

describe('灵脉效果行与每点加成同源', () => {
  it('有 perPoint 的脉,百分比就是每点数值乘点数', () => {
    for (const def of VEINS) {
      const points = 10
      const line = veinEffectText(def, points)
      for (const [k, raw] of Object.entries(def.perPoint)) {
        if (typeof raw !== 'number' || raw === 0) continue
        const name = STAT_NAMES[k as AnyStatKey] ?? k
        expect(line, def.name).toContain(`${name} +${formatPercent(raw * points)}`)
      }
    }
  })

  it('悟道脉读折扣常数,不另写 0.4', () => {
    const insight = VEINS.find(v => v.id === 'insight')!
    expect(veinEffectText(insight, 1)).toBe(`${INSIGHT_EFFECT_NAME} −${formatPercent(INSIGHT_DISCOUNT_PER_POINT)}`)
    expect(veinEffectText(insight, 1)).not.toContain('双成')
    expect(veinEffectText(insight, 1)).not.toContain('耗材')
  })

  it('参悟省耗展示与结算同顶(封到 INSIGHT_DISCOUNT_CAP,越过了也不再虚报)', () => {
    const insight = VEINS.find(v => v.id === 'insight')!
    // 200 点 → 0.8,越过封顶 0.5
    const line = veinEffectText(insight, 200)
    expect(line, '越过封顶后应停在 0.5 而不是 0.8').toContain(`${INSIGHT_EFFECT_NAME} −${formatPercent(INSIGHT_DISCOUNT_CAP)}`)
    expect(line, '不得报出越过封顶的名义值').not.toContain(formatPercent(INSIGHT_DISCOUNT_PER_POINT * 200))
  })
})

describe('灵脉投点提示 · 文言仍报清主副与灵石', () => {
  it('容量、圆满、上限、缺石、改立', () => {
    expect(veinFullToast()).toContain('容量已尽')
    expect(veinPeakToast(true)).toContain('圆满')
    expect(veinPeakToast(false)).toContain('副脉')
    expect(veinPeakToast(false)).toBe('副脉已至上限')
    expect(veinShortToast()).toContain('灵石')
    expect(veinShortToast()).toBe('灵石不足')
    expect(veinShortToast('12')).toContain('灵石尚差 12')
    expect(veinSwitchShortToast()).toBe('灵石不足')
    expect(veinSwitchShortToast('12')).toContain('灵石尚差 12')
    expect(veinSwitchDoneToast('聚灵')).toBe('主脉改立「聚灵」')
  })
})

/**
 * 卡面状态词只能从 veinText 取。
 *
 * `VeinInvestCard.investedStateLabel` 原先把「主脉圆满 / 副脉已至上限」与「容量已尽」
 * 三句又手写了一遍 —— 而 core 的拒绝回执用的是上两个函数。
 * 两份字面量改一处就会对不上:卡面说「副脉已至上限」,点了却回执「主脉圆满」。
 *
 * 判据:组件读那两个函数,且模板与脚本里不再出现那三句的字面量。
 */
describe('灵脉卡面 · 状态词只从 veinText 取', () => {
  const CARD = stripComments(readFileSync(resolve(__dirname, '../components/dongfu/VeinInvestCard.vue'), 'utf-8'))

  it('读共享实现,不自己写', () => {
    expect(CARD, '卡面该读 veinPeakToast').toContain('veinPeakToast(isMain(veinId))')
    expect(CARD, '卡面该读 veinFullToast').toContain('veinFullToast()')
  })

  it('那三句的字面量不再出现在组件里', () => {
    for (const word of ['主脉圆满', '副脉已至上限', '容量已尽']) {
      expect(CARD, `组件又手写了一遍「${word}」`).not.toContain(`'${word}'`)
    }
  })

  it('两种说法确实由共享函数产出一致', () => {
    expect(veinPeakToast(true)).toBe('主脉圆满')
    expect(veinPeakToast(false)).toBe('副脉已至上限')
    expect(veinFullToast()).toBe('容量已尽')
  })
})

/** 剥掉注释:注释里提到这些词不算玩家可见文案 */
function stripComments(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}
