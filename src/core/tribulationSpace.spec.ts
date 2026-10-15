/* eslint-disable no-console */
/**
 * 天劫解法空间审计(Phase 32.0 后续验证)
 *
 * 验证的不是"成功率高不高",而是设计意图本身:
 *   准备度应描述"解法空间",不应退化成"四维刷满的合格线"。
 *
 * 五条门:
 *   ① 多解门:每种劫型至少有 2 种"形态不同"的构筑可渡(不含全满)
 *   ② 非唯一门:四维全满不是唯一答案(存在专精构筑同样可渡)
 *   ③ 劫型有效门:同一构筑在不同劫型下结论必须出现分歧
 *      (若某构筑对 5 种劫型结论完全一致,劫型只是装饰)
 *   ④ 短板门:专精构筑的最弱维度必须被风险行点名
 *   ⑤ 全境界解法空间门:化神之后难度继续涨,而减伤类词条有绝对上限 ——
 *      每个需渡劫的境界 × 每种劫型都必须还剩一条**非全满**之路,
 *      否则天劫会悄悄退化成"必须堆满硬顶"的墙(见该用例里的普查读数)
 *
 * 若哪天这些门开始失败,说明渡劫又回到了"堆满四维"的旧最优解。
 */
import { describe, it, expect } from 'vitest'
import { buildTribulationPlan, SOULREND_BURST_RELIEF, waveDamage } from './tribulationDecision'
import { TRIBULATIONS, tribulationDef, type TribulationKind } from '@/data/tribulations'
import { MAX_MAJOR, REALMS } from '@/data/realms'
import { WEATHERS, WORLD_WEATHERS } from './weather'
import { NO_RELIEF } from '@/data/linggenAffinity'
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
    key: 'specialist',
    name: '渡劫专精(抗+减)',
    /**
     * 抗性与减伤**两条乘数一起堆**的渡劫向构筑 —— 化神之后这是唯一还走得通的非满配路线
     * (读数见 ⑤)。组成全部来自游戏里已存在的东西:功法分支(避劫/劫印/渡厄/淬体)、
     * 天赋「雷体」、灵兽、称号「渡劫行者」、护腕类装备、丹药「玄冥护体」与「护心」。
     * 它刻意不在"四维皆优"之列:没有护盾、没有爆发,照样能渡 —— 这就是要留给玩家的那条路。
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

/** 审计口径:中期大关(波次 3+major),取 major=4 作为"已成型但未毕业"的样本 */
const AUDIT_MAJOR = 4

const PASS = new Set(['ok', 'easy'])

function planOf(shape: Shape, kind: TribulationKind, major = AUDIT_MAJOR, weatherMult = 1) {
  return buildTribulationPlan(major, shape.mods, kind, NO_RELIEF, weatherMult)
}

describe('天劫解法空间审计', () => {
  /**
   * 扩界守卫:天劫难度不得随境界失控。
   *
   * 伤害公式(0.15 + major×0.02 逐波,波次 3+major)是为 major ≤ 8 设的;
   * 扩界后若让 major 一路线性涨到 20,而减伤类词条有绝对上限,连本文件那套
   * 「四维皆优」参考构筑都会在神帝以上 0/5 可渡 —— 天劫从解法空间退化成硬墙。
   * 这条要求:凡需渡劫的境界,四维皆优的参考构筑必能渡任一劫型。
   */
  it('四维皆优的参考构筑,在每一个需渡劫的境界都能渡任一劫型', () => {
    const maxed = SHAPES.find(s => s.key === 'maxed')!
    // 取最凶的天时(雷鸣/仙劫日/神威日等,最高 ×1.12)——渡劫难度不能靠"那天恰好清和"成立
    const worstWeather = Math.max(...[...WEATHERS, ...Object.values(WORLD_WEATHERS).flat()].map(w => w.tribulationMult))
    // 大关皆劫:1..MAX 每一个可作目标的大境界都要过这一关(含真仙/神人/混沌真灵)
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
    // 恢复流在逆流劫下应被点出"逆流:治疗恢复大减"
    const cf = planOf(SHAPES.find(s => s.key === 'sustain')!, 'counterflow')
    expect(cf.risks.join()).toContain('逆流')
    // 爆发流在裂魂劫下不应被点"爆发被压制"(它爆发是够的)
    const sr = planOf(SHAPES.find(s => s.key === 'burst')!, 'soulrend')
    expect(sr.risks.join()).not.toContain('爆发攻势被压制')
  })

  /**
   * ⑤ 全境界解法空间门 —— 化神之后不许变成硬墙。
   *
   * 上面四条门只在 major=4 上量。扩界之后难度继续随境界涨(波次 3+major、
   * 单波 +0.02/境),而减伤类词条是**绝对上限**(抗性 0.8、减伤 0.6)——
   * 实测:化神那条线上还有 3~6 条非满配之路,炼虚只剩 1~3 条,合体之后只剩
   * 「抗性+减伤双堆」这一条。若不逐境盯着,天劫会悄悄从"解法空间"退化成
   * "必须堆满硬顶"的墙,而玩家看到的只是「我血厚防高,怎么连一道劫都过不去」。
   *
   * 故要求:每个需渡劫的境界 × 每种劫型,都至少还剩一条**非全满**之路。
   * 天时取最凶的 ×1.12 —— 这条路不能只在清和日成立(与上一用例同一纪律)。
   *
   * 口径:参考构筑只带词条,不带三维 —— 故这份普查是**下界**(真实玩家的防御/气血
   * 还能按本境裸修为折出抗性与护持,见 tribulationDecision.statGuardOf)。
   * 这里宁紧不松:词条一侧的路若不成立,三维兜底也补不回一个"解法空间"。
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

describe('濒危减伤(背水/涅槃)——结算兑现,渡劫账也须看得见', () => {
  it('气血垂危(<30%)时 waveDamage 按封顶削一波,≥30% 不受其扰', () => {
    const def = tribulationDef('thunder')
    const mods = { lowHpReduction: 0.4 }
    // 同款封顶与结算一致:不设其他词条,减伤/抗性都为零,差值即纯濒危减伤
    const dmgLow = waveDamage(def, mods, 1, 1, 0.2)
    const dmgHigh = waveDamage(def, mods, 1, 1, 0.5)
    const dmgNone = waveDamage(def, {}, 1, 1, 0.2)
    expect(dmgLow).toBeCloseTo(dmgNone * (1 - 0.4), 9)
    expect(dmgHigh).toBe(dmgNone) // ≥0.3 不触发濒危减伤
  })
})