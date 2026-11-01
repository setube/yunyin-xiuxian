/* eslint-disable no-console */
/** 突破服务:渡劫成功率推演 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { tribulationSuccessRate, breakthroughInfo, attemptBreakthrough } from './breakthrough'
import { clampRate } from './formulas'
import { modOf } from './statsCalc'
import { buildTribulationPlan, currentTribulationPlan } from './tribulationDecision'
import { prepareBreakthrough, breakthroughPrepState, consumeBreakthroughPrep } from './earlyGameService'
import { gn } from '@/utils/gnum'
import { formatNum, formatPercent } from '@/utils/format'
import type { StatMods } from '@/types'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useCultivationStore } from '@/stores/cultivation'
import { REALMS, WORLDS, MAX_MAJOR } from '@/data/realms'
import { SUB_LEVELS } from '@/data/constants'
import { breakthroughExpReason, breakthroughPeakReason, breakthroughQiReason } from '@/ui/cultivationText'

describe('渡劫成功率推演', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('裸装低境界:折半分存亡,而非必死', () => {
    const rate = tribulationSuccessRate(1, {})
    // 首劫伤害:0.15+0.02+0.03w,共 4 波,无减伤
    console.log(`裸装首劫成功率:${(rate * 100).toFixed(1)}%`)
    expect(rate).toBeGreaterThan(0.2)
    expect(rate).toBeLessThan(0.8)
  })

  it('词条加成单调提升:减伤/渡劫抗性/护盾/再生都会提高存活率', () => {
    const base = tribulationSuccessRate(2, {})
    const withReduction = tribulationSuccessRate(2, { damageReduction: 0.4 })
    const withResist = tribulationSuccessRate(2, { tribulationResist: 0.4 })
    const withShield = tribulationSuccessRate(2, { shieldOnStart: 0.8 })
    const withRegen = tribulationSuccessRate(2, { regenPerRound: 0.05 })
    expect(withReduction).toBeGreaterThan(base)
    expect(withResist).toBeGreaterThan(base)
    expect(withShield).toBeGreaterThan(base)
    expect(withRegen).toBeGreaterThan(base)
  })

  it('同输入确定性:固定种子结果稳定', () => {
    const mods: StatMods = { damageReduction: 0.3, tribulationResist: 0.5, regenPerRound: 0.02 }
    const a = tribulationSuccessRate(3, mods)
    const b = tribulationSuccessRate(3, mods)
    expect(a).toBe(b)
  })

  it('境界越高天劫越难:同词条下高境界成功率不升', () => {
    const low = tribulationSuccessRate(1, { damageReduction: 0.3 })
    const high = tribulationSuccessRate(6, { damageReduction: 0.3 })
    expect(low).toBeGreaterThan(high)
  })

  it('breakthroughInfo:渡劫场景不再吐出单一成功率,而是给出劫型与四维准备度', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    // 炼气·十层(SUB_LEVELS=10,sub=9 时 isMajorStep)
    player.$patch({ major: 0, sub: 9 })
    resources.$patch({ qi: 99999 })
    // 修为圆满:exp >= expRequirement(0,9)
    player.$patch({ exp: { m: 1e12, e: 0 } })
    const info = breakthroughInfo()
    console.log(`境界=${player.realmName} major→${info.targetLabel} needTribulation=${info.needTribulation} rate=${formatPercent(info.rate)}`)

    // 突破面板只承载基础突破率,天劫另走决策面板;BreakthroughInfo 不得有渡劫成功率字段
    expect(Object.keys(info)).not.toContain('tribRate')

    if (info.needTribulation) {
      const plan = currentTribulationPlan()
      expect(plan.kind).toBeTruthy()
      expect(plan.risks.length).toBeGreaterThan(0)
      for (const dim of ['guard', 'sustain', 'resist', 'burst'] as const) {
        expect(plan.prep[dim]).toBeGreaterThanOrEqual(0)
        expect(plan.prep[dim]).toBeLessThanOrEqual(3)
      }
      console.log(`  劫型=${plan.title} 档=${plan.verdict} 准备度=${JSON.stringify(plan.prep)}`)
    }
  })

  it('rateParts:成功率的构成逐项可见,合计(取上下限后)= 展示率', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.$patch({ major: 0, sub: 5 })
    resources.$patch({ qi: 99999 })
    player.$patch({ exp: { m: 1e12, e: 0 } })
    const bare = breakthroughInfo()
    expect(bare.needTribulation).toBe(false)
    expect(bare.rateParts.length).toBeGreaterThanOrEqual(1)
    expect(bare.rateParts[0]!.label).toBe('基础')
    const bareSum = bare.rateParts.reduce((a, p) => a + p.value, 0)
    expect(clampRate(bareSum)).toBeCloseTo(bare.rate, 6)
  })

  it('带气运称号时,明细给出「气运 ×5%」一行,合计仍对上展示率', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.$patch({ major: 0, sub: 5, titleId: 'ti_tianjiao' })
    resources.$patch({ qi: 99999 })
    player.$patch({ exp: { m: 1e12, e: 0 } })
    const info = breakthroughInfo()
    expect(info.needTribulation).toBe(false)
    const luckRow = info.rateParts.find(p => p.label.startsWith('气运'))
    expect(luckRow).toBeDefined()
    // 灵根/称号都进幸运
    expect(luckRow!.value).toBeCloseTo(modOf(player.finalStats.mods, 'luck') * 0.05, 6)
    const sum = info.rateParts.reduce((a, p) => a + p.value, 0)
    expect(clampRate(sum)).toBeCloseTo(info.rate, 6)
  })

  it('分项之和越过上限时,明细补一行「封顶」差额:各行相加正好是展示率', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const player = usePlayerStore()
      const resources = useResourcesStore()
      player.$patch({ major: 0, sub: 0, exp: { m: 1e12, e: 0 } })
      resources.$patch({ qi: 99999 })
      resources.addStone(gn(80))
      expect(prepareBreakthrough('pill')).toBe(true)
      const info = breakthroughInfo()
      const cap = info.rateParts.find(p => p.label === '封顶')
      expect(cap, '基础 95% 加准备加成已越过上限').toBeDefined()
      expect(cap!.value).toBeLessThan(0)
      const sum = info.rateParts.reduce((a, p) => a + p.value, 0)
      expect(sum).toBeCloseTo(info.rate, 6)
    } finally {
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })

  it('突破准备就绪计入成功率;尝试突破后一次性消耗', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const player = usePlayerStore()
      const resources = useResourcesStore()
      // 非大关,走平概率掷点(渡劫不食此益,见 DEC)
      player.$patch({ major: 0, sub: 3, exp: { m: 1e12, e: 0 } })
      resources.$patch({ qi: 99999 })
      const base = breakthroughInfo().rate
      expect(breakthroughInfo().needTribulation).toBe(false)

      resources.addStone(gn(80))
      expect(prepareBreakthrough('pill')).toBe(true)
      const withPrep = breakthroughInfo()
      expect(withPrep.prep.ready).toBe(true)
      expect(withPrep.rate).toBeCloseTo(Math.min(1, base + 0.05))

      // 消费在掷点前,与成败无关;不做概率断言:rng 按值捕获 Math.random,spyOn 替不掉
      const view = attemptBreakthrough()
      expect(view).not.toBeNull()
      expect(breakthroughPrepState().ready).toBe(false)
      expect(consumeBreakthroughPrep()).toBe(0)
    } finally {
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })

  it('UI 预览与实际结算同向:推演更好的构筑,采样成功率也必须更高', () => {
    const weak: StatMods = { regenPerRound: 0.01 }
    const strong: StatMods = { regenPerRound: 0.08, damageReduction: 0.35, shieldOnStart: 0.5 }
    for (const kind of ['thunder', 'counterflow', 'soulrend', 'ironbody', 'heavyrush'] as const) {
      const previewWeak = buildTribulationPlan(3, weak, kind).expectedRate
      const previewStrong = buildTribulationPlan(3, strong, kind).expectedRate
      const actualWeak = tribulationSuccessRate(3, weak, kind)
      const actualStrong = tribulationSuccessRate(3, strong, kind)
      console.log(
        `${kind}:预览 ${previewWeak.toFixed(3)}→${previewStrong.toFixed(3)} 采样 ${actualWeak.toFixed(3)}→${actualStrong.toFixed(3)}`
      )
      expect(previewStrong, `${kind}:预览未反映构筑改善`).toBeGreaterThan(previewWeak)
      expect(actualStrong, `${kind}:预览说变好了,结算却没有——UI 与结算口径分裂`).toBeGreaterThan(actualWeak)
    }
  })

  /**
   * 「进阶成功率」只入小进阶那一次掷点;大关(筑基起的天劫步)走逐波推演,不掷这个骰子。
   * 下面两条一正一反钉住边界。
   */
  it('大关天劫不吃进阶成功率:堆到 50% 也改不动渡劫推演', () => {
    const base: StatMods = { regenPerRound: 0.03, damageReduction: 0.2 }
    const stacked: StatMods = { ...base, breakthroughRate: 0.5 }
    for (const kind of ['thunder', 'counterflow', 'soulrend', 'ironbody', 'heavyrush'] as const) {
      const a = buildTribulationPlan(5, base, kind)
      const b = buildTribulationPlan(5, stacked, kind)
      expect(b.expectedRate, `${kind}劫:进阶成功率不该改变渡劫推演`).toBe(a.expectedRate)
      expect(b.verdict).toBe(a.verdict)
    }
    expect(tribulationSuccessRate(5, stacked, 'thunder')).toBe(tribulationSuccessRate(5, base, 'thunder'))
  })

  it('小进阶才吃它:嗑「破境」丹,进阶成功率必须真的涨', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const cultivation = useCultivationStore()
    // 非大关,走平概率掷点
    player.$patch({ major: 0, sub: 3, exp: { m: 1e12, e: 0 } })
    resources.$patch({ qi: 99999 })
    const before = breakthroughInfo()
    expect(before.needTribulation).toBe(false)
    cultivation.addBuff('buff_pojing', Date.now()) // 进阶成功率 +15%
    const after = breakthroughInfo()
    console.log(`破境丹:${formatPercent(before.rate)} → ${formatPercent(after.rate)}`)
    expect(after.rate).toBeGreaterThan(before.rate)
  })

  /** 大关皆劫:三个跨界入口(真仙 / 神人 / 混沌真灵)都要渡劫 */
  it('飞升不例外:三个跨界入口都要渡劫', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const entries = WORLDS.filter(w => w.start > 0).map(w => w.start)
    expect(entries.length, '跨界入口数量不对').toBe(WORLDS.length - 1) // 人间界之外的三界
    for (const entry of entries) {
      player.$patch({ major: entry - 1, sub: 9, exp: { m: 1e30, e: 0 } })
      resources.$patch({ qi: 1e30 })
      const info = breakthroughInfo()
      console.log(`${REALMS[entry - 1]!.name}→${REALMS[entry]!.name}:needTribulation=${info.needTribulation}`)
      expect(info.needTribulation, `${REALMS[entry]!.name} 是界域入口,却没有劫`).toBe(true)
      expect(info.isMajor).toBe(true)
    }
  })
})

describe('大关不食突破准备(渡劫背面是颗天劫骰,不是这颗 rate)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('大关(需渡劫)展示率不受就绪准备影响,明细也剔除那一行(平概率掷点才吃此益)', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const player = usePlayerStore()
      const resources = useResourcesStore()
      // 顶格 sub → isMajorStep → needTribulation(大关皆劫)
      player.$patch({ major: 0, sub: SUB_LEVELS - 1, exp: { m: 1e13, e: 0 } })
      resources.$patch({ qi: 99999 })
      expect(breakthroughInfo().needTribulation, '应是大关').toBe(true)
      const base = breakthroughInfo().rate

      resources.addStone(gn(80))
      expect(prepareBreakthrough('pill')).toBe(true)
      const withPrep = breakthroughInfo()
      expect(withPrep.prep.ready, '大关若带着就绪的准备,应在状态里可见').toBe(true)
      // 大关成败走 runTribulation,不吃准备加成
      expect(withPrep.rate, '大关展示率不得被准备加成抬高').toBeCloseTo(base, 6)
      expect(
        withPrep.rateParts.some(p => p.label === '聚气丹' || p.label === '静坐调息'),
        '大关明细不该出现突破准备的加成行'
      ).toBe(false)
    } finally {
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })
})

describe('巅峰(大道尽头)', () => {
  it('已达大道尽头时,「下一步」不再 clamp 回自己的重名境界,而是如实说已至尽头', () => {
    const player = usePlayerStore()
    player.major = MAX_MAJOR
    player.sub = SUB_LEVELS - 1
    const info = breakthroughInfo()
    expect(player.atMaxRealm, '构造出的应为巅峰').toBe(true)
    expect(info.ready, '巅峰不可再突破').toBe(false)
    // realmLabel(major+1, 0) 会被 clamp 回 MAX_MAJOR,指向自己境界的「一层」
    expect(info.targetLabel).toBe(breakthroughPeakReason())
    expect(info.targetLabel, '不再出现自己境界的「一层」残影').not.toContain('一层')
  })


/**
 * 突破闸门的状态机。
 *
 * breakthroughInfo 有三道闸门,按固定顺序判:修为未满 → 灵气不足 → 就绪。
 * 此前只测了「巅峰不可再突破」那一道,另两道没测 —— 而它们的拒因文案是玩家
 * 唯一能看到的指引,顺序错了会给出让人白等的提示(比如灵气不够却先说修为未满)。
 */
describe('突破闸门 · 三道拒绝的顺序与拒因', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('新档:先说修为未至圆满,不先报缺灵气', () => {
    const info = breakthroughInfo()
    expect(info.ready, '新档不可能就绪').toBe(false)
    expect(info.reason).toBe(breakthroughExpReason())
    expect(info.reason, '修为未满时不该先报灵气').not.toContain('灵气')
  })

  it('修为圆满但灵气不足:改为报灵气差额,且差额与 qiCost 一致', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.exp = gn(1e18)
    expect(player.expFull, '构造失败:修为应已圆满').toBe(true)
    resources.qi = 0
    const info = breakthroughInfo()
    expect(info.ready).toBe(false)
    expect(info.reason, '此时应报灵气不足').toBe(breakthroughQiReason(formatNum(info.qiCost)))
    expect(info.reason, '差额数字要写进去,不能只写「灵气不足」').toContain(formatNum(info.qiCost))
  })

  it('补足灵气后就绪,且不再带拒因', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.exp = gn(1e18)
    const need = breakthroughInfo().qiCost
    resources.qi = need
    const info = breakthroughInfo()
    expect(info.ready, '修为与灵气都够,应就绪').toBe(true)
    expect(info.reason, '就绪时不该再有拒因').toBe('')
  })

  it('灵气差一点也拒绝(边界取 >= 而非 >)', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.exp = gn(1e18)
    const need = breakthroughInfo().qiCost
    resources.qi = need - 1
    expect(breakthroughInfo().ready, '差一缕灵气即不可突破').toBe(false)
    resources.qi = need
    expect(breakthroughInfo().ready).toBe(true)
  })

  it('三道闸门按顺序判:修为未满时即便灵气为零,也只报修为', () => {
    const resources = useResourcesStore()
    resources.qi = 0
    const info = breakthroughInfo()
    expect(info.reason, '灵气为零但修为也没满,应只报修为').toBe(breakthroughExpReason())
  })
})
})
