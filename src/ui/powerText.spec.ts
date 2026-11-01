/**
 * 战力算式与构成行。
 *
 * 这个模块此前没有测试。它读 `POWER_WEIGHTS` —— 与 core/formulas 的 powerScore
 * 是同一份权重,所以这里既是展示,也是「算式与总战力同源」的旁证。
 */
import { describe, expect, it } from 'vitest'
import { POWER_WEIGHTS } from '@/core/formulas'
import { mulN } from '@/utils/gnum'
import { powerBreakdownRows, powerExplainText } from './powerText'

function stats(attack: number, defense: number, maxHp: number): Parameters<typeof powerBreakdownRows>[0] {
  return {
    attack: { m: attack, e: 0 },
    defense: { m: defense, e: 0 },
    maxHp: { m: maxHp, e: 0 }
  } as never
}

describe('战力构成', () => {
  it('算式里的系数就是 POWER_WEIGHTS 本身,不另抄一份', () => {
    const text = powerExplainText()
    expect(text).toContain(String(POWER_WEIGHTS.attack))
    expect(text).toContain(String(POWER_WEIGHTS.defense))
    expect(text).toContain(String(POWER_WEIGHTS.hp))
  })

  it('三行依次是攻击/防御/气血,权重与折算值同源', () => {
    const rows = powerBreakdownRows(stats(10, 20, 30))
    expect(rows.map(r => r.name)).toEqual(['攻击', '防御', '气血'])
    expect(rows.map(r => r.raw)).toEqual([
      { m: 10, e: 0 },
      { m: 20, e: 0 },
      { m: 30, e: 0 }
    ])
    expect(rows.map(r => r.weight)).toEqual([POWER_WEIGHTS.attack, POWER_WEIGHTS.defense, POWER_WEIGHTS.hp])
    for (const r of rows) expect(r.value).toEqual(mulN(r.raw, r.weight))
  })

  it('零三维给出零值行,不抛错也不产 NaN', () => {
    const rows = powerBreakdownRows(stats(0, 0, 0))
    for (const r of rows) {
      expect(Number.isNaN(r.value.m), `${r.name} 算出 NaN`).toBe(false)
      expect(r.value.m).toBe(0)
    }
  })

  it('超大三维按 GNum 缩放,不走 toNum 溢出成 Infinity', () => {
    const rows = powerBreakdownRows({
      attack: { m: 1, e: 308 },
      defense: { m: 1, e: 308 },
      maxHp: { m: 1, e: 308 }
    } as never)
    for (const r of rows) {
      expect(Number.isFinite(r.value.m), `${r.name} 尾数不是有限数`).toBe(true)
      expect(r.value.m, `${r.name} 尾数应在 GNum 规范区间`).toBeLessThan(10)
      // 权重小于 1 时指数会减一(血权重 0.15 把 1e308 变成 1.5e307),故只要求量级不塌
      expect(r.value.e).toBeGreaterThanOrEqual(300)
    }
  })
})
