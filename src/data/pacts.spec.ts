/**
 * 天道契约的说明与实效必须对得上。
 *
 * PactDef.ruleText 是玩家签约前后读到的唯一说明,而实际效果来自三处:
 *   rules     —— 战斗规则(healMult / playerStartHpPct / maxRounds …)
 *   special   —— 机制钩子(soloArtifact / endHp80 / sealCore)
 *   sourceMult —— 道源倍率
 *
 * 最容易错的是「道源 ×N」这一句:它和 sourceMult 是两个独立的数,写岔了玩家会按错的回报率做选择。
 * 另钉三条契约性约束:倍率必须 >1(契约是拿风险换回报,不换就不值得签)、
 * 只许加难、每条都必须至少有一条实际约束(空契约等于白送道源)。
 */
import { describe, expect, it } from 'vitest'
import { PACTS } from '@/data/pacts'

const percentsIn = (text: string): number[] =>
  [...text.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g)].map(m => Math.abs(Number(m[1])))

describe('天道契约 · 说明与实效一致', () => {
  it('ruleText 里的「道源 ×N」等于 sourceMult', () => {
    let checked = 0
    for (const p of PACTS) {
      const m = /道源\s*×\s*([\d.]+)/.exec(p.ruleText)
      expect(m, `「${p.name}」的说明里没写道源倍率:${JSON.stringify(p.ruleText)}`).not.toBeNull()
      expect(Number(m![1]), `「${p.name}」说明写 ×${m![1]},实际 sourceMult=${p.sourceMult}`).toBeCloseTo(p.sourceMult)
      checked += 1
    }
    expect(checked, '一条都没验到说明用例空转').toBe(PACTS.length)
  })

  it('healMult:说明的百分数与规则同值;0 用「无效」这类文字表达', () => {
    let checked = 0
    for (const p of PACTS) {
      const v = p.rules?.healMult
      if (v === undefined) continue
      if (v === 0) {
        // 0% 不写成数字,项目里用「治疗无效」这类说法
        expect(/无效|不得|禁止/.test(p.ruleText), `「${p.name}」的 healMult=0 没在说明里体现`).toBe(true)
      } else {
        expect(percentsIn(p.ruleText), `「${p.name}」说明里没有 ${Math.round(v * 100)}%`).toContain(Math.round(v * 100))
      }
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('playerStartHpPct:说明的百分数与规则同值', () => {
    for (const p of PACTS) {
      const v = p.rules?.playerStartHpPct
      if (v === undefined) continue
      expect(percentsIn(p.ruleText), `「${p.name}」说明里没有 ${Math.round(v * 100)}%`).toContain(Math.round(v * 100))
    }
  })

  it('maxRounds:说明里的回合数等于规则值', () => {
    for (const p of PACTS) {
      const v = p.rules?.maxRounds
      if (v === undefined) continue
      expect(p.ruleText, `「${p.name}」说明里没有回合上限 ${v}`).toContain(String(v))
    }
  })

  it('特殊钩子与说明里的关键词对应', () => {
    const marker: Record<string, RegExp> = {
      soloArtifact: /法宝/,
      endHp80: /气血\s*≥\s*80%/,
      sealCore: /核心词条/
    }
    let checked = 0
    for (const p of PACTS) {
      if (!p.special) continue
      const re = marker[p.special]
      expect(re, `出现未登记的特殊钩子 ${p.special}`).toBeDefined()
      expect(re!.test(p.ruleText), `「${p.name}」的钩子 ${p.special} 没在说明里体现:${JSON.stringify(p.ruleText)}`).toBe(true)
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('天道契约 · 契约性约束', () => {
  it('道源倍率必须 >1(签契约是拿风险换回报)', () => {
    for (const p of PACTS) {
      expect(p.sourceMult, `「${p.name}」的倍率 ${p.sourceMult} 不高于 1,签它没有回报`).toBeGreaterThan(1)
    }
  })

  it('只许加难:治疗与开局气血不得超过 1,回合上限为正', () => {
    for (const p of PACTS) {
      const heal = p.rules?.healMult
      if (heal !== undefined) expect(heal, `「${p.name}」的治疗倍率 ${heal} 反而增强了治疗`).toBeLessThanOrEqual(1)
      const hp = p.rules?.playerStartHpPct
      if (hp !== undefined) expect(hp, `「${p.name}」的开局气血 ${hp} 超过 1`).toBeLessThanOrEqual(1)
      const rounds = p.rules?.maxRounds
      if (rounds !== undefined) expect(rounds, `「${p.name}」的回合上限应为正`).toBeGreaterThan(0)
    }
  })

  it('每条契约都至少有一条实际约束(rules 或 special),不能白送道源', () => {
    for (const p of PACTS) {
      const hasRules = p.rules !== undefined && Object.keys(p.rules).length > 0
      const hasSpecial = p.special !== undefined
      expect(hasRules || hasSpecial, `「${p.name}」既没有战斗规则也没有特殊钩子,却给 ×${p.sourceMult} 道源`).toBe(true)
    }
  })

  it('倍率各不相同(两条契约同价会让玩家只挑好签的那条)', () => {
    const mults = PACTS.map(p => p.sourceMult)
    expect(new Set(mults).size, '道源倍率必须两两不同').toBe(mults.length)
  })
})

describe('天道契约 · 结构不变式', () => {
  it('id 与 name 都不重复', () => {
    const ids = PACTS.map(p => p.id)
    const names = PACTS.map(p => p.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('印章是单汉字且互不重复', () => {
    const seals = PACTS.map(p => p.seal)
    for (const p of PACTS) expect(p.seal.length, `「${p.name}」的印章「${p.seal}」不是单字`).toBe(1)
    expect(new Set(seals).size).toBe(seals.length)
  })

  it('契文与规则说明都非空', () => {
    for (const p of PACTS) {
      expect(p.desc.length, `${p.id} 没有契文`).toBeGreaterThan(0)
      expect(p.ruleText.length, `${p.id} 没有规则说明`).toBeGreaterThan(0)
    }
  })
})
