/**
 * 变数文案与实生效规则必须对得上。
 *
 * MUTATORS[i].text 是玩家在选择界面读到的唯一说明,rules 是真正进战斗的规则。
 * 两者之间没有任何机制约束,而这里的换算有三种方向,最容易写反:
 *   加性词条:text「+25%」 ↔ mod 0.25
 *   乘性倍率:text「+28%」 ↔ mult 1.28
 *   降幅倍率:text「-75%」 ↔ mult 0.25(不是 -0.75、也不是 0.75)
 * 写反了玩家会按错的预期选变数,而所有现有测试仍是绿的。
 */
import { describe, expect, it } from 'vitest'
import { MUTATORS } from '@/data/mutators'

/** 文案里所有百分数的绝对值 */
const percentsIn = (text: string): number[] =>
  [...text.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g)].map(m => Math.abs(Number(m[1])))

describe('变数文案与规则', () => {
  it('每条 text 里都有百分数或具体数字(否则玩家读不出效果)', () => {
    for (const m of MUTATORS) {
      const hasNumber = /\d/.test(m.text)
      expect(hasNumber, `「${m.name}」的文案「${m.text}」里没有数字`).toBe(true)
    }
  })

  it('加性词条:text 的百分数等于 mod 值', () => {
    const cases: { id: string; key: string; side: 'player' | 'enemy'; pct: number }[] = []
    for (const m of MUTATORS) {
      for (const [side, mods] of [
        ['player', m.rules.playerExtraMods],
        ['enemy', m.rules.enemyExtraMods]
      ] as const) {
        if (!mods) continue
        for (const v of Object.values(mods)) cases.push({ id: m.id, key: m.id, side, pct: Math.round(Math.abs(v as number) * 100) })
      }
    }
    expect(cases.length, '没有加性词条用例,说明结构变了').toBeGreaterThan(0)
    for (const m of MUTATORS) {
      const mine = cases.filter(c => c.id === m.id)
      if (mine.length === 0) continue
      const claimed = percentsIn(m.text)
      // 「敌我…皆 +N%」时文案只写一个数,规则两侧同值,按去重后比对
      const actual = [...new Set(mine.map(c => c.pct))].sort((a, b) => a - b)
      const shown = [...new Set(claimed)].sort((a, b) => a - b)
      expect(shown, `「${m.name}」文案 ${JSON.stringify(m.text)} 与词条值 ${JSON.stringify(actual)} 不符`).toEqual(actual)
    }
  })

  it('乘性倍率:text 的百分数等于 (mult - 1) 的百分数', () => {
    const mults: { m: (typeof MUTATORS)[number]; pct: number }[] = []
    for (const m of MUTATORS) {
      for (const k of ['enemyHpMult', 'playerAtkMult', 'enemyAtkMult'] as const) {
        const v = m.rules[k]
        if (v === undefined) continue
        mults.push({ m, pct: Math.round(Math.abs(v - 1) * 100) })
      }
    }
    expect(mults.length, '没有倍率用例').toBeGreaterThan(0)
    for (const { m, pct } of mults) {
      expect(percentsIn(m.text), `「${m.name}」文案 ${JSON.stringify(m.text)} 与倍率差 ${pct}% 不符`).toContain(pct)
    }
  })

  it('降幅倍率:text 写「-X%」时 mult 必须是 1 - X/100', () => {
    // healMult 0.25 的语义是「只剩 25%」,文案写 -75%
    for (const m of MUTATORS) {
      const v = m.rules.healMult
      if (v === undefined) continue
      const dropPct = Math.round((1 - v) * 100)
      expect(percentsIn(m.text), `「${m.name}」的降幅应为 ${dropPct}%`).toContain(dropPct)
      expect(m.text, '降幅文案应带负号,否则会被读成增强').toContain(`-${dropPct}%`)
    }
  })

  it('healMult 的降幅文案与倍率方向一致:写负号就不能是 >1 的倍率', () => {
    for (const m of MUTATORS) {
      const v = m.rules.healMult
      if (v === undefined) continue
      if (m.text.includes('-')) {
        expect(v, `「${m.name}」文案说降,倍率却是 ${v}`).toBeLessThan(1)
      } else {
        expect(v).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('maxRounds:文案里的回合数与规则同值', () => {
    let checked = 0
    for (const m of MUTATORS) {
      const v = m.rules.maxRounds
      if (v === undefined) continue
      const claimed = /回合上限\s*(\d+)/.exec(m.text)
      expect(claimed, `「${m.name}」有回合规则但文案没写回合数`).not.toBeNull()
      expect(Number(claimed![1]), `「${m.name}」回合数与规则不符`).toBe(v)
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('id 与 name 都不重复', () => {
    const ids = MUTATORS.map(m => m.id)
    const names = MUTATORS.map(m => m.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('每条变数都真的改了规则(空 rules 等于选了个寂寞)', () => {
    for (const m of MUTATORS) {
      expect(Object.keys(m.rules).length, `「${m.name}」没有任何规则`).toBeGreaterThan(0)
    }
  })
})
