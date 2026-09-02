/* eslint-disable no-console */
/**
 * 天劫解法空间审计(Phase 32.0 后续验证)
 *
 * 验证的不是"成功率高不高",而是设计意图本身:
 *   准备度应描述"解法空间",不应退化成"四维刷满的合格线"。
 *
 * 三条门:
 *   ① 多解门:每种劫型至少有 2 种"形态不同"的构筑可渡(不含全满)
 *   ② 非唯一门:四维全满不是唯一答案(存在专精构筑同样可渡)
 *   ③ 劫型有效门:同一构筑在不同劫型下结论必须出现分歧
 *      (若某构筑对 5 种劫型结论完全一致,劫型只是装饰)
 *
 * 若哪天这三条门开始失败,说明玩家已经可以回到"堆满四维"的旧最优解。
 */
import { describe, it, expect } from 'vitest'
import { buildTribulationPlan, SOULREND_BURST_RELIEF } from './tribulationDecision'
import { TRIBULATIONS, type TribulationKind } from '@/data/tribulations'
import type { StatMods } from '@/types'

/** 代表性构筑形态:每一条对应一条真实路数,而非枚举数值 */
interface Shape {
  key: string
  name: string
  /** 是否"四维全满"型(用于非唯一门排除) */
  maxed?: boolean
  mods: StatMods
}

const SHAPES: Shape[] = [
  { key: 'bare', name: '裸装', mods: {} },
  { key: 'guard', name: '罡盾(护持)', mods: { shieldOnStart: 0.75, damageReduction: 0.3 } },
  { key: 'sustain', name: '沐泽(恢复)', mods: { regenPerRound: 0.16, damageReduction: 0.22 } },
  { key: 'resist', name: '玄承(抗性)', mods: { tribulationResist: 0.5, damageReduction: 0.25, regenPerRound: 0.03 } },
  { key: 'burst', name: '锋芒(爆发)', mods: { critRate: 0.45, damageBonus: 0.5, damageReduction: 0.3, regenPerRound: 0.05 } },
  { key: 'lasthp', name: '背水(濒危)', mods: { lowHpReduction: 0.55, damageReduction: 0.4, shieldOnStart: 0.25 } },
  {
    key: 'balanced',
    name: '均衡(四维中)',
    mods: { shieldOnStart: 0.3, regenPerRound: 0.06, tribulationResist: 0.22, critRate: 0.2, damageReduction: 0.2 }
  },
  {
    key: 'maxed',
    name: '全满(四维皆优)',
    maxed: true,
    mods: { shieldOnStart: 0.6, regenPerRound: 0.12, tribulationResist: 0.45, critRate: 0.4, damageBonus: 0.4, damageReduction: 0.35 }
  }
]

/** 审计口径:中期大关(波次 3+major),取 major=4 作为"已成型但未毕业"的样本 */
const AUDIT_MAJOR = 4

const PASS = new Set(['ok', 'easy'])

function planOf(shape: Shape, kind: TribulationKind) {
  return buildTribulationPlan(AUDIT_MAJOR, shape.mods, kind)
}

describe('天劫解法空间审计', () => {
  it('矩阵总览(构筑 × 劫型 → 劫势)', () => {
    const head = TRIBULATIONS.map(t => t.name.padEnd(4)).join(' ')
    console.log(`\n  major=${AUDIT_MAJOR} 波次=${3 + AUDIT_MAJOR}`)
    console.log(`  ${'构筑'.padEnd(16)} ${head}`)
    for (const shape of SHAPES) {
      const row = TRIBULATIONS.map(t => {
        const p = planOf(shape, t.id)
        return (PASS.has(p.verdict) ? '○' : '×').padEnd(4)
      }).join(' ')
      const prep = planOf(shape, 'thunder').prep
      console.log(`  ${shape.name.padEnd(14)} ${row}  [护${prep.guard} 恢${prep.sustain} 抗${prep.resist} 爆${prep.burst}]`)
    }
    expect(SHAPES.length).toBeGreaterThan(0)
  })

  it('① 多解门:每种劫型至少 2 种非全满形态可渡', () => {
    for (const t of TRIBULATIONS) {
      const passers = SHAPES.filter(s => !s.maxed && PASS.has(planOf(s, t.id).verdict))
      console.log(`  ${t.name}:可渡形态 = ${passers.map(s => s.name).join('、') || '(无)'}`)
      expect(passers.length, `${t.name}劫的非全满解法少于 2 种——准备度正在退化成合格线`).toBeGreaterThanOrEqual(2)
    }
  })

  it('② 非唯一门:四维全满不是唯一答案', () => {
    for (const t of TRIBULATIONS) {
      const specialists = SHAPES.filter(s => !s.maxed && s.key !== 'bare' && s.key !== 'balanced')
      const ok = specialists.some(s => PASS.has(planOf(s, t.id).verdict))
      expect(ok, `${t.name}劫只有全满/均衡能过,专精构筑无解`).toBe(true)
    }
  })

  it('③ 劫型有效门:至少一种构筑在不同劫型下结论分歧', () => {
    const diverging: string[] = []
    for (const shape of SHAPES) {
      const verdicts = new Set(TRIBULATIONS.map(t => planOf(shape, t.id).verdict))
      if (verdicts.size > 1) diverging.push(`${shape.name}(${[...verdicts].join('/')})`)
    }
    console.log(`  结论随劫型变化的构筑:${diverging.join('、') || '(无)'}`)
    expect(diverging.length, '所有构筑对 5 种劫型结论一致——劫型未产生真实决策').toBeGreaterThan(0)
  })

  it('④ 短板门:专精构筑的最弱维度应被风险行点名', () => {
    // 恢复流在逆流劫下应被点出"逆流:治疗恢复大减"
    const cf = planOf(SHAPES.find(s => s.key === 'sustain')!, 'counterflow')
    expect(cf.risks.join()).toContain('逆流')
    // 爆发流在裂魂劫下不应被点"爆发被压制"(它爆发是够的)
    const sr = planOf(SHAPES.find(s => s.key === 'burst')!, 'soulrend')
    expect(sr.risks.join()).not.toContain('爆发攻势被压制')
  })
})

describe('UI 口径与结算口径一致性', () => {
  it('裂魂爆发削劫:UI 星级即结算输入,不存在"看起来够、算起来不够"的区间', () => {
    // prep.burst 的每一级都必须在结算侧对应一档真实减免;
    // 若两边各用一条线,中间就会出现骗人的灰色地带。
    expect(SOULREND_BURST_RELIEF.length).toBe(4)
    const rates = [0, 0.2, 0.4, 0.6].map(critRate => {
      const plan = buildTribulationPlan(3, { critRate }, 'soulrend')
      return { tier: plan.prep.burst, rate: plan.expectedRate }
    })
    console.log(`  爆发星级 → 期望:${rates.map(r => `${r.tier}星=${r.rate.toFixed(3)}`).join(' ')}`)
    // 星级每升一档,推演结果必须真的变好——否则星级是装饰
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]!.tier).toBeGreaterThan(rates[i - 1]!.tier)
      expect(rates[i]!.rate, `爆发从 ${rates[i - 1]!.tier} 星升到 ${rates[i]!.tier} 星,推演却没变好`).toBeGreaterThan(
        rates[i - 1]!.rate
      )
    }
  })

  it('恢复维度:prep.sustain 计入的词条必须也参与生存推演', () => {
    // 仅有 lifesteal 时 UI 显示恢复有星,若推演不吃 lifesteal 即为口径分裂
    const onlyLifesteal: StatMods = { lifesteal: 0.3 }
    const noSustain: StatMods = {}
    const a = buildTribulationPlan(2, onlyLifesteal, 'thunder')
    const b = buildTribulationPlan(2, noSustain, 'thunder')
    console.log(`  仅吸血:sustain=${a.prep.sustain} 期望=${a.expectedRate.toFixed(3)} / 无:sustain=${b.prep.sustain} 期望=${b.expectedRate.toFixed(3)}`)
    // 若 sustain 星级上升但期望率纹丝不动 → UI 在承诺推演不兑现的东西
    if (a.prep.sustain > b.prep.sustain) {
      expect(a.expectedRate, 'sustain 星级上升但生存推演无变化——UI 承诺了结算不兑现的恢复').toBeGreaterThan(b.expectedRate)
    }
  })
})
