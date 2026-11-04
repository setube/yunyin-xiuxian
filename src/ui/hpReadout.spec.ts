/**
 * 血条读数。
 *
 * 历练的战斗面板与天劫的连战面板各有一对血条,原先都只画比例、不标数字。
 * 两处若各写一份四舍五入,迟早一处写 0% 另一处写 1% —— 故抽成一处,并由本用例钉住。
 *
 * 判据:
 *   一 归零写 0%、满血写 100%,两者都不许被四舍五入掉(「已归零」与「还剩一丝」是两件事)。
 *   二 中间值取整到整数,不出现小数。
 *   三 非有限值给「—」,坏档不静默画成满血。
 *   四 越界的比例被夹住,不产出负百分数或三位数以上。
 *   五 两处界面都走这一份,不各写一份。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hpPercent } from './hpReadout'

const ROOT = resolve(__dirname, '../..')
const COMBAT = readFileSync(resolve(ROOT, 'src/components/adventure/CombatPanel.vue'), 'utf-8')
const GAUNTLET = readFileSync(resolve(ROOT, 'src/components/celestial/GauntletPanel.vue'), 'utf-8')

describe('血条读数 · 一、两个端点不取整', () => {
  it('归零写 0% —— 0.4% 不许读成有血', () => {
    expect(hpPercent(0)).toBe('0%')
    expect(hpPercent(0.001)).toBe('0%')
    expect(hpPercent(-5)).toBe('0%')
  })

  it('满血写 100% —— 99.6% 不许读成差一点', () => {
    expect(hpPercent(1)).toBe('100%')
    expect(hpPercent(0.999)).toBe('100%')
    expect(hpPercent(5)).toBe('100%')
  })
})

describe('血条读数 · 二、中间值取整', () => {
  it('取整到整数,没有小数', () => {
    expect(hpPercent(0.5)).toBe('50%')
    expect(hpPercent(0.333)).toBe('33%')
    expect(hpPercent(0.666)).toBe('67%')
    for (const v of [0.01, 0.12, 0.55, 0.87, 0.99]) expect(hpPercent(v)).toMatch(/^\d{1,3}%$/)
  })

  it('一进一出能对上:0 与 1 之间的数都在 0~100 内', () => {
    for (let i = 1; i < 100; i += 1) {
      const n = Number(hpPercent(i / 100).replace('%', ''))
      expect(n, `${i}% 算出了 ${n}`).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(100)
    }
  })
})

describe('血条读数 · 三、坏值有明确占位', () => {
  it('非有限值给「—」,不静默画成满血', () => {
    expect(hpPercent(Number.NaN)).toBe('—')
    expect(hpPercent(Number.POSITIVE_INFINITY)).toBe('—')
    expect(hpPercent(Number.NEGATIVE_INFINITY)).toBe('—')
  })
})

describe('血条读数 · 四、越界被夹住', () => {
  it('负比例夹到 0,超一比夹到 100', () => {
    expect(hpPercent(-0.5)).toBe('0%')
    expect(hpPercent(1.5)).toBe('100%')
  })
})

describe('血条读数 · 五、两处界面同用一份', () => {
  it('战斗面板与连战面板都 import 同一份实现', () => {
    expect(COMBAT, '战斗面板该走 ui/hpReadout').toContain("from '@/ui/hpReadout'")
    expect(GAUNTLET, '连战面板该走 ui/hpReadout').toContain("from '@/ui/hpReadout'")
  })

  it('两处都不许再自写一份 —— 两份四舍五入迟早分叉', () => {
    for (const [src, name] of [
      [COMBAT, '战斗面板'],
      [GAUNTLET, '连战面板']
    ] as const) {
      expect(src, `${name}又自己写了一份 hpPercent`).not.toMatch(/function hpPercent\s*\(/)
    }
  })
})
