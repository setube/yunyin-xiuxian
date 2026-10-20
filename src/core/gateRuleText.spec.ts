/**
 * 行军一指(gateRuleSummary)—— 八门 CombatRules 摊成一行,与结算同源
 *
 * 每个门都带一份真正参与结算的 CombatRules,但图鉴与远征选门一度只给定性 desc。
 * 此处锁两件事:① 具体门的数值串正确;② 每个生效字段都要落到文案 ——
 * 漏一个字段,就等于又把一条数值藏回散文里。
 */
import { describe, expect, it } from 'vitest'
import { GATES } from '@/data/qimen'
import { gateRuleSummary } from './gateRuleText'

describe('行军一指 · 八门数值摊开', () => {
  it('按门对齐结算派生串(休/生/伤/杜)', () => {
    expect(gateRuleSummary(GATES.find(g => g.id === 'xiu')!.rules)).toBe(
      '每 3 回合 · 回 6% 气血 · 敌方攻势 +5%'
    )
    expect(gateRuleSummary(GATES.find(g => g.id === 'sheng')!.rules)).toBe('攻势 -5% · 治疗 +40%')
    expect(gateRuleSummary(GATES.find(g => g.id === 'shang')!.rules)).toBe(
      '攻势 +15% · 以 85% 气血开战'
    )
    expect(gateRuleSummary(GATES.find(g => g.id === 'du')!.rules)).toBe(
      '攻势 -10% · 敌方攻势 -10%'
    )
  })

  it('按门对齐结算派生串(景/死/惊/开)', () => {
    expect(gateRuleSummary(GATES.find(g => g.id === 'jing9')!.rules)).toBe(
      // 词条自带口径注脚(modsText 与别处同源),这里一并保留 —— 会心是「叠在固有值之上」
      '敌方气血 +8% · 额外 暴击率 +8%(叠于固有会心 5% 之上)'
    )
    expect(gateRuleSummary(GATES.find(g => g.id === 'si')!.rules)).toBe(
      '攻势 +25% · 敌方攻势 +20% · 敌方气血 +15% · 回合上限 20'
    )
    expect(gateRuleSummary(GATES.find(g => g.id === 'jing7')!.rules)).toBe(
      '攻势 +20% · 回合上限 15'
    )
    expect(gateRuleSummary(GATES.find(g => g.id === 'kai')!.rules)).toBe(
      '敌方攻势 -5% · 治疗 +25%'
    )
  })

  /**
   * 逐个生效字段都必须有对应片段。这条是「规则加了字段、文案没跟上」的闸门:
   * 只要有人给 CombatRules 添一条新字段并真的填进门里,而这里还没补,
   * 这个循环就会当场指出是哪一门漏了。
   */
  it('每个生效字段都要落到文案,不许漏藏数值', () => {
    for (const g of GATES) {
      const summary = gateRuleSummary(g.rules)
      expect(summary, `${g.fullName}没有任何数值说明`).not.toBe('')
      if (g.rules.playerAtkMult != null && g.rules.playerAtkMult !== 1) {
        expect(summary, `${g.fullName}漏了攻势`).toContain('攻势')
      }
      if (g.rules.enemyAtkMult != null && g.rules.enemyAtkMult !== 1) {
        expect(summary, `${g.fullName}漏了敌方攻势`).toContain('敌方攻势')
      }
      if (g.rules.enemyHpMult != null && g.rules.enemyHpMult !== 1) {
        expect(summary, `${g.fullName}漏了敌方气血`).toContain('敌方气血')
      }
      if (g.rules.healMult != null && g.rules.healMult !== 1) {
        expect(summary, `${g.fullName}漏了治疗`).toContain('治疗')
      }
      if (g.rules.playerStartHpPct != null) {
        expect(summary, `${g.fullName}漏了开场气血`).toContain('气血开战')
      }
      if (g.rules.maxRounds != null) {
        expect(summary, `${g.fullName}漏了回合上限`).toContain('回合上限')
      }
      if (g.rules.perRounds) {
        expect(summary, `${g.fullName}漏了周期增益`).toContain('回合')
      }
      if (g.rules.playerExtraMods) {
        expect(summary, `${g.fullName}漏了额外词条`).toContain('额外')
      }
    }
  })

  it('无生效字段返回空串(防御:不给空白凑一行)', () => {
    expect(gateRuleSummary({})).toBe('')
    expect(gateRuleSummary({ playerAtkMult: 1, healMult: 1 })).toBe('')
  })

  it('坏数不许吐出 NaN% / Infinity%(与 formatPercent 同一道兜底)', () => {
    expect(gateRuleSummary({ playerAtkMult: Number.NaN })).toBe('')
    expect(gateRuleSummary({ playerAtkMult: Number.POSITIVE_INFINITY })).toBe('')
    // 场次类字段不是百分比,但同样不该把 NaN 摆给玩家看
    expect(gateRuleSummary({ maxRounds: Number.NaN })).not.toContain('NaN')
  })
})
