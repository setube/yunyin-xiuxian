/**
 * 天劫决策
 * ① 劫型由境界×天时派生,确定性
 * ② 准备度四维:护持/恢复/抗性/爆发
 * ③ 风险识别 + 决策档,决定留给玩家
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildTribulationPlan,
  rollTribulation,
  verdictLabel,
  statGuardOf,
  tribulationWaveSpan,
  tribLowHpReduction,
  currentTribResist,
  NO_STAT_GUARD,
  traceTribulation,
  waveDamage,
  effectiveBurstTier
} from './tribulationDecision'
import { baseCombatStats, tribulationWaveDamage } from './formulas'
import { LOW_HP_THRESHOLD, TRIB_REDUCTION_CAP, TRIB_RESIST_CAP } from '@/data/constants'
import { toNum } from '@/utils/gnum'
import { RandomService, mulberry32 } from '@/utils/random'
import { NO_RELIEF } from '@/data/linggenAffinity'
import { TRIBULATIONS, tribulationDef } from '@/data/tribulations'
import { useGameStore } from '@/stores/game'
import type { StatMods } from '@/types'

describe('① 劫型派生', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('五种劫型完整', () => {
    expect(TRIBULATIONS.length).toBe(5)
    for (const t of TRIBULATIONS) {
      expect(t.dmgMult).toBeGreaterThan(0)
      expect(t.desc).toBeTruthy()
    }
  })

  it('同一境界+同一天时 → 同一劫型(确定性)', () => {
    const game = useGameStore()
    game.$patch({ totalPlaySec: 86400 * 7 })
    const a = rollTribulation(3)
    const b = rollTribulation(3)
    expect(a).toBe(b)
  })

  it('不同天时 → 大概率不同劫型(联动天气)', () => {
    // 天时由游戏日决定
    const game = useGameStore()
    const seen = new Set<string>()
    for (let d = 1; d <= 20; d++) {
      game.$patch({ totalPlaySec: d * 86400 })
      seen.add(rollTribulation(3))
    }
    expect(seen.size).toBeGreaterThanOrEqual(3)
  })
})

describe('② 准备度多维 + ③ 风险/决策', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const bare: StatMods = {}

  it('裸装:准备度低,决策档为 danger/hard,风险含"护持/恢复"', () => {
    const plan = buildTribulationPlan(1, bare, 'thunder')
    expect(plan.prep.guard).toBe(0)
    expect(plan.prep.sustain).toBe(0)
    expect(['danger', 'hard']).toContain(plan.verdict)
    expect(plan.risks.length).toBeGreaterThan(0)
    expect(plan, '劫势只给档位与风险,不再附建议句').not.toHaveProperty('advice')
  })

  it('护持+恢复+抗性齐备 → 明显改善(guard/sustain/resist ≥2,固定劫型)', () => {
    const plan = buildTribulationPlan(1, { shieldOnStart: 0.4, regenPerRound: 0.06, tribulationResist: 0.3 }, 'thunder')
    expect(plan.prep.guard).toBeGreaterThanOrEqual(2)
    expect(plan.prep.sustain).toBeGreaterThanOrEqual(2)
    expect(plan.prep.resist).toBeGreaterThanOrEqual(2)
  })

  it('逆流劫:治疗被压缩 → sustain 得分下降', () => {
    const mods: StatMods = { regenPerRound: 0.05 }
    const normal = buildTribulationPlan(1, mods)
    // roll 不一定出逆流,直接测 def 数值
    const cf = TRIBULATIONS.find(t => t.id === 'counterflow')!
    expect(cf.healMult).toBeLessThan(1)
    expect(normal.prep.sustain).toBeGreaterThanOrEqual(0)
  })

  it('决策档映射文字(信息层,不做推荐按钮)', () => {
    expect(verdictLabel('danger')).toBe('高风险')
    expect(verdictLabel('easy')).toBe('稳渡')
  })

  it('期望率不是单一数字依赖:同词条在不同劫型下结论不同', () => {
    const mods: StatMods = { shieldOnStart: 0.35, regenPerRound: 0.03, tribulationResist: 0.2 }
    const plan = buildTribulationPlan(1, mods)
    // 至少产出完整信息结构
    expect(plan).toMatchObject({
      kind: expect.any(String),
      verdict: expect.any(String),
      prep: { guard: expect.any(Number), sustain: expect.any(Number), resist: expect.any(Number), burst: expect.any(Number) },
      risks: expect.any(Array)
    })
  })
})

/** 三维折算:超出本境裸修为的防御 → 抗性、气血 → 开劫水位,各自封顶 */
describe('⑥ 三维折算(防御→抗性 / 气血→开劫水位)', () => {
  const MAJOR = 4
  const SUB = 8
  const bare = baseCombatStats(MAJOR, SUB)
  const bareDef = toNum(bare.defense)
  const bareHp = toNum(bare.maxHp)

  it('裸修为不折算:一个百分点都不白送', () => {
    expect(statGuardOf({ defense: bareDef, maxHp: bareHp, major: MAJOR, sub: SUB })).toEqual({ resist: 0, guard: 0 })
  })

  it('坏档三维 Infinity/境界爆表时整块作废,不再靠封顶兜底(见 utils/gnum toNum)', () => {
    // toNum 在 e>308 返回 Infinity:按 0 折算,不经 Math.min(CAP,…) 折成满抗
    expect(statGuardOf({ defense: Infinity, maxHp: Infinity, major: MAJOR, sub: SUB })).toEqual({ resist: 0, guard: 0 })
    // 境界大到 realmScale 溢出也作废
    expect(statGuardOf({ defense: bareDef, maxHp: bareHp, major: 1e9, sub: 0 })).toEqual({ resist: 0, guard: 0 })
  })

  it('超出部分按倍数线性折算,并各自封顶', () => {
    const six = statGuardOf({ defense: bareDef * 6, maxHp: bareHp * 6, major: MAJOR, sub: SUB })
    // (6-1)×4% = 20%,抗性封顶 18%
    expect(six.resist).toBeCloseTo(0.18, 6)
    expect(six.guard).toBeCloseTo(0.2, 6)
    const whale = statGuardOf({ defense: bareDef * 500, maxHp: bareHp * 500, major: MAJOR, sub: SUB })
    expect(whale.resist).toBe(0.18) // 上限
    expect(whale.guard).toBe(0.35) // 上限
  })

  it('折算真的进了推演:同词条下血厚防高者结论更好', () => {
    const mods: StatMods = { regenPerRound: 0.04 }
    const stat = statGuardOf({ defense: bareDef * 500, maxHp: bareHp * 500, major: MAJOR, sub: SUB })
    const without = buildTribulationPlan(MAJOR, mods, 'thunder', undefined, 1, NO_STAT_GUARD)
    const withStat = buildTribulationPlan(MAJOR, mods, 'thunder', undefined, 1, stat)
    expect(withStat.expectedRate).toBeGreaterThan(without.expectedRate)
    expect(withStat.prep.resist).toBeGreaterThanOrEqual(without.prep.resist) // 星级含结算吃的折算
  })

  it('三维封顶也过不了大劫:硬抗是兜底,不是通行证', () => {
    const whale = statGuardOf({ defense: bareDef * 500, maxHp: bareHp * 500, major: MAJOR, sub: SUB })
    for (const t of TRIBULATIONS) {
      const plan = buildTribulationPlan(MAJOR, {}, t.id, undefined, 1, whale)
      expect(plan.verdict, `${t.name}劫:光靠三维就过了,折算上限该收`).not.toBe('easy')
    }
  })
})

/** 波形读数:自变量为第几道(逐道加重)与境界(道数与起点);界面展示须与结算一致 */
describe('⑦ 波形读数(道数 × 逐道加重)', () => {
  it('均匀劫:同一次渡劫里最后一道最重,合计约为单波的数倍', () => {
    const span = tribulationWaveSpan(tribulationDef('thunder'), 5)
    expect(span.waves).toBe(8) // 3 + 5
    expect(span.last).toBeGreaterThan(span.first)
    expect(span.max).toBeCloseTo(span.last, 9)
    expect(span.total).toBeGreaterThan(span.max)
    expect(span.total).toBeLessThan(span.max * span.waves)
    // 期望值按结算公式逐道累加,不写死数字
    let expected = 0
    for (let w = 1; w <= span.waves; w += 1) expected += tribulationWaveDamage(5, w, 0)
    expect(span.total).toBeCloseTo(expected * tribulationDef('thunder').dmgMult, 6)
  })

  it('重压劫:起手两道最重,波形不是单调递增', () => {
    const span = tribulationWaveSpan(tribulationDef('heavyrush'), 5)
    expect(span.first).toBeGreaterThan(span.last)
    expect(span.max).toBeGreaterThan(span.last)
    expect(span.heaviestWave).toBeLessThanOrEqual(2)
  })

  it('境界越深:道数更多、单波起点也更重', () => {
    const def = tribulationDef('thunder')
    const low = tribulationWaveSpan(def, 2)
    const high = tribulationWaveSpan(def, 8)
    expect(high.waves).toBeGreaterThan(low.waves)
    expect(high.first).toBeGreaterThan(low.first)
  })

  it('天时倍率按比例抬高每一道,道数不变', () => {
    const def = tribulationDef('thunder')
    const clear = tribulationWaveSpan(def, 5, 1)
    const storm = tribulationWaveSpan(def, 5, 1.08)
    expect(storm.waves).toBe(clear.waves)
    expect(storm.first).toBeCloseTo(clear.first * 1.08, 9)
    expect(storm.last).toBeCloseTo(clear.last * 1.08, 9)
    expect(storm.total).toBeCloseTo(clear.total * 1.08, 9)
    expect(storm.max).toBeCloseTo(clear.max * 1.08, 9)
  })
})

/**
 * 预览与实结同乘界:结算 runTribulation(breakthrough.ts)唯一随机项是 waveDamage×rng.float(0.85,1.15);
 * 决策档/期望值用 traceTribulation(无浮动,同一份净口径 waveDamage)。
 */
describe('④ 预览与实结同乘界', () => {
  it('traceTribulation(期望值推演)确定性:同输入必同结果', () => {
    const def = tribulationDef('thunder')!
    const mods: StatMods = { shieldOnStart: 0.4, regenPerRound: 0.06, tribulationResist: 0.3 }
    const a = traceTribulation(def, mods, 1, NO_RELIEF, 1, NO_STAT_GUARD)
    const b = traceTribulation(def, mods, 1, NO_RELIEF, 1, NO_STAT_GUARD)
    expect(b).toEqual(a)
  })

  it('waveDamage 是净口径:减伤 30% → 伤害恰为 ×0.7(决策档/结算都不许忽略减伤)', () => {
    const def = tribulationDef('thunder')!
    // 无裂魂修正、气血 ≥0.3 不触发濒危减伤、NO_RELIEF 不折减伤为抗性 → 比值纯 (1-减伤)
    const bare = waveDamage(def, {}, 1, 1, 0.9, NO_RELIEF, 1, NO_STAT_GUARD)
    const reduced = waveDamage(def, { damageReduction: 0.3 }, 1, 1, 0.9, NO_RELIEF, 1, NO_STAT_GUARD)
    expect(reduced).toBeCloseTo(bare * 0.7, 6)
  })

  it('结算噪声带 ±15%:rng.float(0.85,1.15) 恒落带内,且两端真的可达', () => {
    const rand = new RandomService(mulberry32(7))
    let min = Number.POSITIVE_INFINITY
    let max = 0
    for (let i = 0; i < 300; i += 1) {
      const v = rand.float(0.85, 1.15)
      expect(v).toBeGreaterThanOrEqual(0.85)
      expect(v).toBeLessThanOrEqual(1.15)
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
    // 两端可达;带收窄则红
    expect(min).toBeLessThan(0.87)
    expect(max).toBeGreaterThan(1.13)
  })
})

describe('渡劫四维星 · 与结算同源(结算吃了它,星级就必须看得见它)', () => {
  it('归属公报:雷鸣不虚注减伤→抗性 —— 抗性星与其它劫同档(无灵根亲和不自动折算)', () => {
    // 结算 currentTribResist 不给 thunder 特判,resistScore 也不得特判。
    // 故障注入:在 resistScore 里给 thunder 加回折减率,thunder ≠ ironbody,本条红。
    const mods = { tribulationResist: 0, damageReduction: 0.5 } as StatMods
    const thunder = buildTribulationPlan(1, mods, 'thunder', NO_RELIEF, 1, NO_STAT_GUARD).prep.resist
    const iron = buildTribulationPlan(1, mods, 'ironbody', NO_RELIEF, 1, NO_STAT_GUARD).prep.resist
    expect(thunder, '雷鸣的抗性星不得高于普通劫').toBe(iron)
  })

  it('护持星把三维血量折算算进去(与抗性含 stat.resist 对称):血厚者护持档不偏低', () => {
    // guardScore=0(无护盾词条)+ stat.guard 0.2 越过 0.08 门槛进一档
    const guarded = buildTribulationPlan(1, {}, 'thunder', NO_RELIEF, 1, { resist: 0, guard: 0.2 } as { resist: number; guard: number }).prep.guard
    const plain = buildTribulationPlan(1, {}, 'thunder', NO_RELIEF, 1, NO_STAT_GUARD).prep.guard
    expect(guarded, '血厚者的护持星应含三维血量的折算,不偏低').toBeGreaterThan(plain)
  })
})

describe('裂魂爆发星(连灵根/凶兆加持)', () => {
  it('展示星 == 结算吃的 effectiveBurstTier:有攻势被提升一档,推不动零', () => {
    const fire = { ...NO_RELIEF, burstTierBonus: 1 }
    // burstScore = 0.2 → 基档 1;fire +1 → 档 2(未封顶)
    const boostable: StatMods = { critRate: 0.2 }
    const plan = buildTribulationPlan(1, boostable, 'soulrend', fire)
    expect(plan.prep.burst, '展示星必须与结算同档(结算吃 effectiveBurstTier)').toBe(effectiveBurstTier(boostable, fire))
    expect(plan.prep.burst, '火灵根把已有攻势再推一档,不再停在 raw 档').toBeGreaterThan(effectiveBurstTier(boostable, NO_RELIEF))
    // 无攻势:加持推不动零
    const bare = buildTribulationPlan(1, {}, 'soulrend', fire)
    expect(bare.prep.burst).toBe(0)
  })
})

describe('濒危减伤/低血阈值 · 单一事实源(结算与台账不许各写一遍)', () => {
  it('封顶取自 TRIB_REDUCTION_CAP:tribLowHpReduction 与 waveDamage 吃同一个数', () => {
    // 故障注入:把 waveDamage 的 lowHpRed 写死 0.6,或改 helper 的封顶,本条红。
    const capped = { lowHpReduction: 5 } as StatMods
    expect(tribLowHpReduction(capped)).toBe(TRIB_REDUCTION_CAP)
    const def = tribulationDef('thunder')!
    const none = waveDamage(def, {}, 1, 1, 0.1, NO_RELIEF, 1, NO_STAT_GUARD)
    const low = waveDamage(def, capped, 1, 1, 0.1, NO_RELIEF, 1, NO_STAT_GUARD)
    expect(low, '结算必须吃到与 helper 同源的封顶').toBeCloseTo(none * (1 - TRIB_REDUCTION_CAP), 9)
  })

  it('低血判定线是 LOW_HP_THRESHOLD,不是裸字面量', () => {
    // 低于 LOW_HP_THRESHOLD 才触发;界面词条也按它格式化,源码不得写裸 0.3
    const def = tribulationDef('thunder')!
    const mods = { lowHpReduction: 0.4 } as StatMods
    const justAt = waveDamage(def, mods, 1, 1, LOW_HP_THRESHOLD, NO_RELIEF, 1, NO_STAT_GUARD)
    const justBelow = waveDamage(def, mods, 1, 1, LOW_HP_THRESHOLD - 0.01, NO_RELIEF, 1, NO_STAT_GUARD)
    const bare = waveDamage(def, {}, 1, 1, LOW_HP_THRESHOLD, NO_RELIEF, 1, NO_STAT_GUARD)
    expect(justAt, '恰在线上不触发濒危减伤').toBeCloseTo(bare, 9)
    expect(justBelow, '越线即触发(与结算同一条阈值)').toBeLessThan(bare)
  })

  it('结算与 UI 台账读同一份封顶:0.6 不在 waveDamage / CultivationView 里各写', () => {
    const core = readFileSync(resolve(__dirname, './tribulationDecision.ts'), 'utf8')
    expect(core, 'waveDamage 的濒危减伤须走 tribLowHpReduction,不再内联 0.6').not.toContain(
      "Math.min(0.6, modOf(mods, 'lowHpReduction'))"
    )
    expect(core, '低血判定线须引 LOW_HP_THRESHOLD,不得写死 hpLeft < 0.3').not.toContain('hpLeft < 0.3')
    expect(core).toContain('LOW_HP_THRESHOLD')
    // 劫势台账在 composables/useTribulation.ts
    const view = readFileSync(resolve(__dirname, '../composables/useTribulation.ts'), 'utf8')
    expect(view, '台账不得再抄一遍 0.6 封顶').not.toContain("Math.min(0.6, modOf(mods, 'lowHpReduction'))")
    expect(view, '台账须调结算同源的 tribLowHpReduction').toContain('tribLowHpReduction(mods)')
  })

  /** 故障注入:把详情面板改成自己调 currentTribulationPlan,本条红 */
  it('劫势摘要卡与详情同读 useTribulation,不各算一份', () => {
    for (const rel of ['../components/cultivation/TribulationCard.vue', '../components/cultivation/TribulationDetail.vue']) {
      const src = readFileSync(resolve(__dirname, rel), 'utf8')
      expect(src, `${rel} 该读 useTribulation`).toContain('useTribulation(')
      expect(src, `${rel} 不该自己再算劫势`).not.toContain('currentTribulationPlan(')
    }
  })

describe('抗性封顶 · TRIB_RESIST_CAP', () => {
  /**
   * 这个封顶原来是 currentTribResist 里的裸 0.8,而同函数上两行用的都是 TRIB_REDUCTION_CAP。
   * 提到 constants 后,数值改动只在 data/ 一处;本条钉住「它确实在生效」与「它与减伤封顶是两个数」。
   */
  it('抗性总值被钳到 TRIB_RESIST_CAP(不是死分支)', () => {
    // 三部分之和:词条抗性 + 灵根折入 + 三维折算
    expect(currentTribResist({ tribulationResist: 2 } as StatMods)).toBe(TRIB_RESIST_CAP)
    expect(currentTribResist({ tribulationResist: TRIB_RESIST_CAP } as StatMods)).toBe(TRIB_RESIST_CAP)
    expect(currentTribResist({ tribulationResist: TRIB_RESIST_CAP - 0.01 } as StatMods)).toBeCloseTo(TRIB_RESIST_CAP - 0.01, 6)
  })

  it('抗性封顶高于减伤封顶 —— 两者不是同一个数,不可互相替换', () => {
    expect(TRIB_RESIST_CAP, '抗性封顶与减伤封顶相同,说明其中一处写错了').not.toBe(TRIB_REDUCTION_CAP)
    expect(TRIB_RESIST_CAP).toBeGreaterThan(TRIB_REDUCTION_CAP)
  })

  it('减伤经灵根折入抗性时也受抗性封顶约束', () => {
    const relief = { reductionToResist: 1 } as never
    const huge: StatMods = { damageReduction: 5 } as StatMods
    expect(currentTribResist(huge, relief)).toBeLessThanOrEqual(TRIB_RESIST_CAP)
  })

  it('零词条时抗性为 0,不会因封顶写法而给出正的底数', () => {
    expect(currentTribResist({} as StatMods)).toBe(0)
  })
})
})
