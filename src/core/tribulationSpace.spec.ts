/* eslint-disable no-console */
/** 天劫解法空间审计:准备度应描述解法空间,不退化成四维刷满的合格线 */
import { describe, it, expect } from 'vitest'
import { buildTribulationPlan, SOULREND_BURST_RELIEF, waveDamage } from './tribulationDecision'
import { TRIBULATIONS, tribulationDef, type TribulationKind } from '@/data/tribulations'
import { MAX_MAJOR, REALMS } from '@/data/realms'
import { WEATHERS, WORLD_WEATHERS } from './weather'
import { NO_RELIEF } from '@/data/linggenAffinity'
import type { StatMods } from '@/types'

/** 代表性构筑形态(每条对应一条真实路数) */
interface Shape {
  key: string
  name: string
  /** 是否四维全满型 */
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
    key: 'specialist',
    name: '渡劫专精(抗+减)',
    /**
     * 抗性与减伤双堆,刻意不带护盾、爆发:合体起唯一走得通的非满配路线(读数见 ⑤)。
     * 组成均来自游戏内已有来源:功法分支(避劫/劫印/渡厄/淬体)、天赋「雷体」、灵兽、
     * 称号「渡劫行者」、护腕类装备、丹药「玄冥护体」与「护心」。
     */
    mods: { tribulationResist: 0.65, damageReduction: 0.45, regenPerRound: 0.06 }
  },
  {
    key: 'maxed',
    name: '全满(四维皆优)',
    maxed: true,
    mods: { shieldOnStart: 0.6, regenPerRound: 0.12, tribulationResist: 0.45, critRate: 0.4, damageBonus: 0.4, damageReduction: 0.35 }
  }
]

/** 审计口径:中期大关 */
const AUDIT_MAJOR = 4

const PASS = new Set(['ok', 'easy'])

function planOf(shape: Shape, kind: TribulationKind, major = AUDIT_MAJOR, weatherMult = 1) {
  return buildTribulationPlan(major, shape.mods, kind, NO_RELIEF, weatherMult)
}

describe('天劫解法空间审计', () => {
  /*
   * 坠劫者的决策档恒为 danger —— 撑得再久也不许被算成「能过」。
   *
   * 这条钉的是 `failedRate` 的值域 [0.25, 0.44]:上界 0.44 卡在 danger 阈值 0.45 之下。
   * 变异扫描把 `Math.max(0.25, ...)` 报成「改坏了不会红」,而 `tribulationDecision.ts`
   * 那行注释还写着「spec 钉:tribulationSpace.spec.ts」—— 实测全仓 grep 零命中,
   * 注释是错的。这里补上。
   *
   * 玩家看到的是决策档标签。一个已经坠劫的推演如果被标成「可渡」,
   * 玩家会照着它冲境,然后真的死在里面。
   */
  it('坠劫者的决策档恒为 danger,不许因评分抬高翻成可渡', () => {
    const bare = SHAPES.find(s => s.key === 'bare')!
    let fallen = 0
    for (let major = 1; major <= MAX_MAJOR; major += 1) {
      for (const t of TRIBULATIONS) {
        const p = buildTribulationPlan(major, bare.mods, t.id, NO_RELIEF, 1)
        // 存活推演的档位由 minHp 决定,与 failedRate 无关,跳过
        if (p.expectedRate >= 0.45) continue
        fallen += 1
        expect(p.verdict, `${REALMS[major]!.name}·${t.name}劫:评分 ${p.expectedRate.toFixed(3)} 却标成「${p.verdict}」`).toBe('danger')
      }
    }
    expect(fallen, '该有若干坠劫组合,判据不能空转').toBeGreaterThan(0)
  })

  /** 扩界守卫:天劫难度不得随境界失控 */
  it('四维皆优的参考构筑,在每一个需渡劫的境界都能渡任一劫型', () => {
    const maxed = SHAPES.find(s => s.key === 'maxed')!
    // 取最凶天时:不能靠清和日成立
    const worstWeather = Math.max(...[...WEATHERS, ...Object.values(WORLD_WEATHERS).flat()].map(w => w.tribulationMult))
    for (let major = 1; major <= MAX_MAJOR; major += 1) {
      for (const t of TRIBULATIONS) {
        const p = buildTribulationPlan(major, maxed.mods, t.id, NO_RELIEF, worstWeather)
        expect(PASS.has(p.verdict), `${REALMS[major]!.name}·${t.name}劫:四维皆优仍不可渡`).toBe(true)
      }
    }
  })

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
    const cf = planOf(SHAPES.find(s => s.key === 'sustain')!, 'counterflow')
    expect(cf.risks.join()).toContain('逆流')
    const sr = planOf(SHAPES.find(s => s.key === 'burst')!, 'soulrend')
    expect(sr.risks.join()).not.toContain('爆发不足')
  })

  /**
   * 普查读数:化神还有 1~3 条非满配之路,炼虚 1~2 条,合体起只剩「抗性+减伤双堆」。
   * 参考构筑只带词条、不带三维(见 tribulationDecision.statGuardOf),普查是下界。天时取最凶。
   */
  it('⑤ 全境界解法空间门:每个需渡劫境界、每种劫型都还剩一条非全满之路', () => {
    const worstWeather = Math.max(
      ...[...WEATHERS, ...Object.values(WORLD_WEATHERS).flat()].map(w => w.tribulationMult)
    )
    const nonMaxed = SHAPES.filter(s => !s.maxed)
    const rows: string[] = []
    for (let major = 1; major <= MAX_MAJOR; major += 1) {
      const counts = TRIBULATIONS.map(
        t => nonMaxed.filter(s => PASS.has(planOf(s, t.id, major, worstWeather).verdict)).length
      )
      rows.push(`${REALMS[major]!.name}: ${counts.join('/')}`)
      TRIBULATIONS.forEach((t, i) => {
        expect(
          counts[i],
          `${REALMS[major]!.name}·${t.name}劫:只剩「四维全满」一条路 —— 天劫退化成硬墙`
        ).toBeGreaterThanOrEqual(1)
      })
    }
    console.log(`\n  非全满可渡形态数(雷鸣/逆流/裂魂/铁躯/重压;天时 ×${worstWeather}):`)
    for (const r of rows) console.log(`    ${r}`)
  })
})

describe('UI 口径与结算口径一致性', () => {
  it('裂魂爆发削劫:UI 星级即结算输入,不存在"看起来够、算起来不够"的区间', () => {
    expect(SOULREND_BURST_RELIEF.length).toBe(4)
    const rates = [0, 0.2, 0.4, 0.6].map(critRate => {
      const plan = buildTribulationPlan(3, { critRate }, 'soulrend')
      return { tier: plan.prep.burst, rate: plan.expectedRate }
    })
    console.log(`  爆发星级 → 期望:${rates.map(r => `${r.tier}星=${r.rate.toFixed(3)}`).join(' ')}`)
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]!.tier).toBeGreaterThan(rates[i - 1]!.tier)
      expect(rates[i]!.rate, `爆发从 ${rates[i - 1]!.tier} 星升到 ${rates[i]!.tier} 星,推演却没变好`).toBeGreaterThan(
        rates[i - 1]!.rate
      )
    }
  })

  it('恢复维度:prep.sustain 计入的词条必须也参与生存推演', () => {
    const onlyLifesteal: StatMods = { lifesteal: 0.3 }
    const noSustain: StatMods = {}
    const a = buildTribulationPlan(2, onlyLifesteal, 'thunder')
    const b = buildTribulationPlan(2, noSustain, 'thunder')
    console.log(`  仅吸血:sustain=${a.prep.sustain} 期望=${a.expectedRate.toFixed(3)} / 无:sustain=${b.prep.sustain} 期望=${b.expectedRate.toFixed(3)}`)
    if (a.prep.sustain > b.prep.sustain) {
      expect(a.expectedRate, 'sustain 星级上升但生存推演无变化——UI 承诺了结算不兑现的恢复').toBeGreaterThan(b.expectedRate)
    }
  })
})

describe('濒危减伤(背水/涅槃)——结算兑现,渡劫账也须看得见', () => {
  it('气血垂危(<30%)时 waveDamage 按封顶削一波,≥30% 不受其扰', () => {
    const def = tribulationDef('thunder')
    const mods = { lowHpReduction: 0.4 }
    // 无其他词条:差值即纯濒危减伤
    const dmgLow = waveDamage(def, mods, 1, 1, 0.2)
    const dmgHigh = waveDamage(def, mods, 1, 1, 0.5)
    const dmgNone = waveDamage(def, {}, 1, 1, 0.2)
    expect(dmgLow).toBeCloseTo(dmgNone * (1 - 0.4), 9)
    expect(dmgHigh).toBe(dmgNone)
  })
})