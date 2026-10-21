import { describe, expect, it } from 'vitest'
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
    // 200 点 → 0.8,越过封顶 0.5;展示必须停在封顶值,不随点数一路上扬(与结算同口径)
    const line = veinEffectText(insight, 200)
    expect(line, '越过封顶后应停在 0.5 而不是 0.8').toContain(`${INSIGHT_EFFECT_NAME} −${formatPercent(INSIGHT_DISCOUNT_CAP)}`)
    expect(line, '不得报出越过封顶的名义值').not.toContain(formatPercent(INSIGHT_DISCOUNT_PER_POINT * 200))
  })
})

describe('灵脉投点提示 · 文言仍报清主副与灵石', () => {
  it('容量、圆满、缺石、改立,不说不足', () => {
    expect(veinFullToast()).toContain('容量已尽')
    expect(veinPeakToast(true)).toContain('圆满')
    expect(veinPeakToast(false)).toContain('副脉')
    expect(veinShortToast()).toContain('灵石')
    expect(veinShortToast()).not.toContain('不足')
    expect(veinShortToast('12')).toContain('灵石尚差 12')
    expect(veinSwitchShortToast()).toContain('迁脉')
    expect(veinSwitchShortToast('12')).toContain('灵石尚差 12')
    expect(veinSwitchDoneToast('聚灵')).toBe('主脉改立「聚灵」')
  })
})
