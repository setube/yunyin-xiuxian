/**
 * 规则预算:设计侧的复杂度会计,不是玩家资源。
 * 三条容易被后来者改坏的约定:负词条与正词条同价(abs)、触发型词条权重翻倍、等于 1 的规则视为未设置。
 */
import { describe, expect, it } from 'vitest'
import type { CombatRules } from '@/types'
import { ITEM_BUDGET_CAP, WORLD_BUDGET_CAP, budgetOfMods, budgetOfRules } from './ruleBudget'

describe('词条预算', () => {
  it('空输入记 0', () => {
    expect(budgetOfMods(undefined)).toBe(0)
    expect(budgetOfMods({})).toBe(0)
  })

  it('数值等于参考档时,普通词条记 1 点', () => {
    // damageBonus 的参考档是 0.18,权重 1
    expect(budgetOfMods({ damageBonus: 0.18 })).toBeCloseTo(1)
    expect(budgetOfMods({ damageBonus: 0.36 }), '两倍参考档记 2 点').toBeCloseTo(2)
  })

  it('触发型词条权重翻倍:同样的比值算两倍价', () => {
    // critRate 在 DIMINISH_KEYS 里,参考档 0.18,权重 2
    expect(budgetOfMods({ critRate: 0.18 })).toBeCloseTo(2)
    // attackPct 不在表里,参考档 0.25,权重 1
    expect(budgetOfMods({ attackPct: 0.25 })).toBeCloseTo(1)
  })

  it('负数与正数同价(abs):把加伤改成减伤不该更便宜', () => {
    const pos = budgetOfMods({ damageBonus: 0.36 })
    const neg = budgetOfMods({ damageBonus: -0.36 })
    expect(neg, '负词条同价,否则「反着写」就成省钱漏洞').toBe(pos)
  })

  it('表里没有的词条用默认参考档 0.25 与权重 1', () => {
    // 未知键走 ?? 0.25;用一个确定不在 KEY_REFS 里的键
    expect(budgetOfMods({ unknownStat: 0.25 } as never)).toBeCloseTo(1)
  })

  it('结果是 1 位小数,不是原始浮点', () => {
    const v = budgetOfMods({ damageBonus: 0.01 })
    expect(Number.isInteger(Math.round(v * 10)), '必须已舍到 1 位').toBe(true)
    expect(v).toBeCloseTo(0.1)
  })

  it('多项相加', () => {
    expect(budgetOfMods({ damageBonus: 0.18, attackPct: 0.25 })).toBeCloseTo(2)
  })
})

describe('规则预算', () => {
  it('空输入与空对象都记 0', () => {
    expect(budgetOfRules(undefined)).toBe(0)
    expect(budgetOfRules({})).toBe(0)
  })

  it('等于 1 的倍率视为「没改」,不计价', () => {
    const neutral: CombatRules = { healMult: 1, enemyHpMult: 1, enemyAtkMult: 1, playerAtkMult: 1, playerStartHpPct: 1 }
    expect(budgetOfRules(neutral), '写了 1 等于没写').toBe(0)
  })

  it('真正改了倍率才计价', () => {
    expect(budgetOfRules({ healMult: 0.5 })).toBeCloseTo(3)
    expect(budgetOfRules({ enemyHpMult: 1.2 })).toBeCloseTo(2)
    expect(budgetOfRules({ playerStartHpPct: 0.8 })).toBeCloseTo(3)
  })

  it('不看取值大小的规则:写了就记,不写不记', () => {
    expect(budgetOfRules({ maxRounds: 30 })).toBeCloseTo(3)
    expect(budgetOfRules({ maxRounds: 999 }), '回合上限改多少都是同一笔账').toBeCloseTo(3)
    expect(budgetOfRules({ shieldCapRatio: 0.5 })).toBeCloseTo(3)
    const perRounds: CombatRules = { perRounds: { interval: 3, playerHealPct: 0, playerShieldPct: 0.1, enemyAtkGrowth: 0.05 } }
    expect(budgetOfRules(perRounds), '长生印那类周期性规则记 4 点').toBeCloseTo(4)
  })

  it('追加词条并入同一笔账', () => {
    const r: CombatRules = { playerExtraMods: { damageBonus: 0.18 }, enemyExtraMods: { damageBonus: 0.18 } }
    expect(budgetOfRules(r), '双方各 1 点').toBeCloseTo(2)
  })

  it('规则 + 追加词条一起算', () => {
    const r: CombatRules = { healMult: 0.5, playerExtraMods: { damageBonus: 0.18 } }
    expect(budgetOfRules(r)).toBeCloseTo(4)
  })
})

describe('预算上限', () => {
  it('单件内容上限低于世界规则上限(世界能装下多件规则)', () => {
    expect(ITEM_BUDGET_CAP).toBeLessThan(WORLD_BUDGET_CAP)
  })

  it('两档都是有限正数', () => {
    expect(Number.isFinite(ITEM_BUDGET_CAP)).toBe(true)
    expect(Number.isFinite(WORLD_BUDGET_CAP)).toBe(true)
    expect(ITEM_BUDGET_CAP).toBeGreaterThan(0)
    expect(WORLD_BUDGET_CAP).toBeGreaterThan(0)
  })
})
