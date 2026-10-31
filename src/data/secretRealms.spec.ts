/**
 * 秘境词条文案与实生效规则必须对得上 —— 与 mutators.spec 同一类隐患。
 *
 * SECRET_RULES[i].text 是玩家在秘境里读到的唯一说明,rules 是真正进战斗的规则。
 * 换算有三个方向,最容易写反:
 *   加性词条:text「+15%」 ↔ mod 0.15
 *   乘性倍率:text「+20%」 ↔ mult 1.2
 *   单侧/双侧:同一条 text 可能同时挂乘性与加性,两侧都要对上
 */
import { describe, expect, it } from 'vitest'
import { SECRET_MAX_LOSSES, SECRET_RULES, SECRET_LAYERS } from '@/data/secretRealms'

const percentsIn = (text: string): number[] =>
  [...text.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g)].map(m => Math.abs(Number(m[1])))

describe('秘境词条 · 文案与规则一致', () => {
  it('每条 text 都得有数字或明确的量词(否则玩家读不出效果)', () => {
    // 三条不含百分数的合法写法:「治疗减半」「回合上限 20」「不得使用护盾」
    for (const r of SECRET_RULES) {
      const readable = /\d/.test(r.text) || /减半|不得|禁止/.test(r.text)
      expect(readable, `词条「${r.text}」既无数字也非明确的量词说法`).toBe(true)
    }
  })

  it('「治疗减半」这类文字说法与倍率方向一致:减半必须是 0.5 量级的降幅', () => {
    for (const r of SECRET_RULES) {
      if (!r.text.includes('减半')) continue
      const v = r.rules.healMult
      expect(v, `「${r.text}」却挂了 healMult=${v}`).toBeDefined()
      expect(v, `「${r.text}」的倍率应为 0.5`).toBeCloseTo(0.5)
    }
  })

  it('「不得使用护盾」对应 shieldCapRatio 归零', () => {
    for (const r of SECRET_RULES) {
      if (!r.text.includes('不得使用护盾')) continue
      expect(r.rules.shieldCapRatio, `「${r.text}」应把护盾上限压到 0`).toBe(0)
    }
  })

  it('乘性倍率:text 里的百分数等于 (mult - 1)', () => {
    let checked = 0
    for (const r of SECRET_RULES) {
      for (const k of ['enemyAtkMult', 'enemyHpMult', 'playerAtkMult', 'playerStartHpPct'] as const) {
        const v = r.rules[k]
        if (v === undefined) continue
        const pct = Math.round(Math.abs(v - 1) * 100)
        expect(percentsIn(r.text), `词条「${r.text}」与 ${k}=${v} 换算出的 ${pct}% 对不上`).toContain(pct)
        checked += 1
      }
    }
    expect(checked, '没有乘性倍率用例,说明结构变了').toBeGreaterThan(0)
  })

  it('加性词条:text 里的百分数等于 mod 值', () => {
    let checked = 0
    for (const r of SECRET_RULES) {
      for (const mods of [r.rules.enemyExtraMods, r.rules.playerExtraMods]) {
        if (!mods) continue
        for (const v of Object.values(mods)) {
          const pct = Math.round(Math.abs(v as number) * 100)
          expect(percentsIn(r.text), `词条「${r.text}」里没有 ${pct}%`).toContain(pct)
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('每条词条都真的改了规则', () => {
    for (const r of SECRET_RULES) {
      expect(Object.keys(r.rules).length, `词条「${r.text}」没有任何规则`).toBeGreaterThan(0)
    }
  })

  it('文案互不重复(玩家要能分清是哪个词条)', () => {
    const texts = SECRET_RULES.map(r => r.text)
    expect(new Set(texts).size).toBe(texts.length)
  })
})

describe('秘境常量', () => {
  it('层数与败北上限都是正整数', () => {
    expect(SECRET_LAYERS).toBeGreaterThan(0)
    expect(SECRET_MAX_LOSSES).toBeGreaterThan(0)
    expect(Number.isInteger(SECRET_LAYERS)).toBe(true)
    expect(Number.isInteger(SECRET_MAX_LOSSES)).toBe(true)
  })
})
