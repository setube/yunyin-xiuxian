/**
 * 逆旅契的规则说明与实生效规则必须对得上。
 *
 * LifeTrialDef.ruleText 是玩家签约前读到的唯一说明,rules 是真正进战斗的规则。
 * 这里的换算方向有五种,每一种都可能写错:
 *   healMult        :「治疗效力 25%」   ↔ 0.25 (直接读出剩余比例,不是 -75%)
 *   playerStartHpPct:「开局气血 70%」   ↔ 0.7
 *   maxRounds       :「回合上限 30」   ↔ 30
 *   enemyAtkMult    :「攻击 +30%」     ↔ 1.3 (倍率是 1+增幅)
 *   enemyHpMult     :「生命 +20%」     ↔ 1.2
 *
 * 另有一条契约性约束写在接口注释里:「本世生效的战斗规则,只许加难」——
 * 逆旅契是拿命换道果的,任何一条把战斗变简单的规则都违背设计意图。
 */
import { describe, expect, it } from 'vitest'
import { LIFE_TRIALS } from '@/data/lifeTrials'

const percentsIn = (text: string): number[] =>
  [...text.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g)].map(m => Math.abs(Number(m[1])))

describe('逆旅契 · 规则说明与规则一致', () => {
  it('healMult:抄的是剩余比例,与 ruleText 的百分数相等', () => {
    let checked = 0
    for (const t of LIFE_TRIALS) {
      const v = t.rules.healMult
      if (v === undefined) continue
      const pct = Math.round(v * 100)
      expect(percentsIn(t.ruleText), `「${t.name}」说「${t.ruleText}」,治疗倍率 ${v} 应为 ${pct}%`).toContain(pct)
      checked += 1
    }
    expect(checked, '没有治疗相关的契,说明结构变了').toBeGreaterThan(0)
  })

  it('playerStartHpPct:与 ruleText 的百分数相等', () => {
    for (const t of LIFE_TRIALS) {
      const v = t.rules.playerStartHpPct
      if (v === undefined) continue
      expect(percentsIn(t.ruleText), `「${t.name}」开局气血 ${v} 与说明不符`).toContain(Math.round(v * 100))
    }
  })

  it('maxRounds:ruleText 里的回合数等于规则值', () => {
    for (const t of LIFE_TRIALS) {
      const v = t.rules.maxRounds
      if (v === undefined) continue
      expect(t.ruleText, `「${t.name}」的回合上限 ${v} 没写进说明`).toContain(String(v))
    }
  })

  it('乘性倍率:ruleText 里的增幅等于 (mult - 1)', () => {
    let checked = 0
    for (const t of LIFE_TRIALS) {
      for (const k of ['enemyAtkMult', 'enemyHpMult', 'playerAtkMult'] as const) {
        const v = t.rules[k]
        if (v === undefined) continue
        const pct = Math.round(Math.abs(v - 1) * 100)
        expect(percentsIn(t.ruleText), `「${t.name}」的 ${k} 换算出的 ${pct}% 不在说明里`).toContain(pct)
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('只许加难:治疗倍率与开局气血不得超过 1,敌方倍率不得低于 1', () => {
    for (const t of LIFE_TRIALS) {
      const heal = t.rules.healMult
      if (heal !== undefined) expect(heal, `「${t.name}」的治疗倍率 ${heal} 等于或超过 1,不是加难`).toBeLessThanOrEqual(1)
      const hp = t.rules.playerStartHpPct
      if (hp !== undefined) expect(hp, `「${t.name}」的开局气血 ${hp} 超过 1`).toBeLessThanOrEqual(1)
      for (const k of ['enemyAtkMult', 'enemyHpMult'] as const) {
        const v = t.rules[k]
        if (v !== undefined) expect(v, `「${t.name}」的 ${k}=${v} 低于 1,反而变简单了`).toBeGreaterThanOrEqual(1)
      }
      const rounds = t.rules.maxRounds
      if (rounds !== undefined) expect(rounds, `「${t.name}」的回合上限应为正`).toBeGreaterThan(0)
    }
  })
})

describe('逆旅契 · 结构不变式', () => {
  it('id 与 name 都不重复', () => {
    const ids = LIFE_TRIALS.map(t => t.id)
    const names = LIFE_TRIALS.map(t => t.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size, '重名会让逆旅契列表分不清').toBe(names.length)
  })

  it('印章是单汉字且互不重复', () => {
    const seals = LIFE_TRIALS.map(t => t.seal)
    for (const t of LIFE_TRIALS) expect(t.seal.length, `「${t.name}」的印章「${t.seal}」不是单字`).toBe(1)
    expect(new Set(seals).size, '印章重复会让两张契看起来是同一张').toBe(seals.length)
  })

  it('契约文本与规则说明都非空,且规则不为空', () => {
    for (const t of LIFE_TRIALS) {
      expect(t.desc.length, `${t.id} 没有契文`).toBeGreaterThan(0)
      expect(t.ruleText.length, `${t.id} 没有规则说明`).toBeGreaterThan(0)
      expect(Object.keys(t.rules).length, `${t.id} 没有任何规则`).toBeGreaterThan(0)
    }
  })

  it('定价为正且随难度递增(更凶的契更贵)', () => {
    for (const t of LIFE_TRIALS) expect(t.cost, `「${t.name}」的定价应为正`).toBeGreaterThan(0)
    const costs = LIFE_TRIALS.map(t => t.cost)
    const sorted = [...costs].sort((a, b) => a - b)
    expect(costs, '定价表按难度排,应已升序').toEqual(sorted)
  })
})
