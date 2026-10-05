/* eslint-disable no-console */
/**
 * 突破服务 —— 渡劫成功率推演
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { tribulationSuccessRate, breakthroughInfo, attemptBreakthrough } from './breakthrough'
import { clampRate } from './formulas'
import { modOf } from './statsCalc'
import { buildTribulationPlan, currentTribulationPlan } from './tribulationDecision'
import { prepareBreakthrough, breakthroughPrepState, consumeBreakthroughPrep } from './earlyGameService'
import { gn } from '@/utils/gnum'
import type { StatMods } from '@/types'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useCultivationStore } from '@/stores/cultivation'
import { REALMS, WORLDS } from '@/data/realms'

describe('渡劫成功率推演', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('裸装低境界:折半分存亡,而非必死', () => {
    const rate = tribulationSuccessRate(1, {})
    // 首劫伤害公式:0.15+0.02+0.03w,共 4 波,无任何减伤
    // 期望值应落在有意义的中段区间
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
    // 模拟炼气·十层(SUB_LEVELS=10,sub=9 时 isMajorStep)
    player.$patch({ major: 0, sub: 9 })
    resources.$patch({ qi: 99999 })
    // 强制修为圆满:exp >= expRequirement(0,9)
    player.$patch({ exp: { m: 1e12, e: 0 } })
    const info = breakthroughInfo()
    console.log(`境界=${player.realmName} major→${info.targetLabel} needTribulation=${info.needTribulation} rate=${info.rateText}`)

    // Phase 32.0:突破面板只承载"基础突破率",天劫另走决策面板;
    // 若哪天 BreakthroughInfo 上又长出一个渡劫成功率字段,说明系统正在退回"堆成功率"。
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
    // 一无所有的裸号:只余「基础」一项
    const bare = breakthroughInfo()
    expect(bare.needTribulation).toBe(false)
    expect(bare.rateParts.length).toBeGreaterThanOrEqual(1)
    expect(bare.rateParts[0]!.label).toBe('基础')
    const bareSum = bare.rateParts.reduce((a, p) => a + p.value, 0)
    expect(clampRate(bareSum)).toBeCloseTo(bare.rate, 6)
  })

  it('带气运称号时,明细给出「气运 (幸运×5%)」一行,合计仍对上展示率', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.$patch({ major: 0, sub: 5, titleId: 'ti_tianjiao' })
    resources.$patch({ qi: 99999 })
    player.$patch({ exp: { m: 1e12, e: 0 } })
    const info = breakthroughInfo()
    expect(info.needTribulation).toBe(false)
    const luckRow = info.rateParts.find(p => p.label.startsWith('气运'))
    expect(luckRow).toBeDefined()
    // 该行的值 = 当前总幸运值 ×5% —— 与展示率同一批词条(灵根/称号都会进幸运)
    expect(luckRow!.value).toBeCloseTo(modOf(player.finalStats.mods, 'luck') * 0.05, 6)
    const sum = info.rateParts.reduce((a, p) => a + p.value, 0)
    expect(clampRate(sum)).toBeCloseTo(info.rate, 6)
  })

  it('突破准备就绪计入成功率;尝试突破后一次性消耗(TASK-023)', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const player = usePlayerStore()
      const resources = useResourcesStore()
      // major:0 sub:3 —— 非大关,走平概率掷点(渡劫不食此益,见 DEC)
      player.$patch({ major: 0, sub: 3, exp: { m: 1e12, e: 0 } })
      resources.$patch({ qi: 99999 })
      const base = breakthroughInfo().rate
      expect(breakthroughInfo().needTribulation).toBe(false)

      resources.addStone(gn(80))
      expect(prepareBreakthrough('pill')).toBe(true)
      const withPrep = breakthroughInfo()
      expect(withPrep.prep.ready).toBe(true)
      expect(withPrep.rate).toBeCloseTo(Math.min(1, base + 0.05))

      // 尝试突破后,加成一次性消费。掷点成败与消费无关(消费在掷点前),
      // 不做概率断言——rng 是按值捕获的 Math.random,spyOn 替不掉它
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
    // Phase 32.1 口径纪律:决策面板告诉玩家"这套构筑更稳",
    // 结算就不能给出相反结论——否则玩家会觉得系统在骗人。
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
   * 「进阶成功率」的作用域边界(护栏)。
   *
   * 它从前的名字叫「突破成功率」,读起来像万事皆管:玩家把「天命」「破境」堆满再
   * 去渡大关,发现一点用没有。真正的作用域是**小进阶**那一次掷点 —— 每大境 9 次,
   * 一世约 180 次,不是死数据;大关(筑基起的天劫步)走逐波推演,压根不掷这个骰子。
   * 这两条一正一反把边界钉住:谁哪天把它接进天劫(或反过来让小进阶不再读它),
   * 都会在这里红一次。
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
    // major:0 sub:3 —— 非大关,走平概率掷点
    player.$patch({ major: 0, sub: 3, exp: { m: 1e12, e: 0 } })
    resources.$patch({ qi: 99999 })
    const before = breakthroughInfo()
    expect(before.needTribulation).toBe(false)
    cultivation.addBuff('buff_pojing', Date.now()) // 进阶成功率 +15%
    const after = breakthroughInfo()
    console.log(`破境丹:${before.rateText} → ${after.rateText}`)
    expect(after.rate).toBeGreaterThan(before.rate)
  })

  /**
   * 大关皆劫 —— 三个跨界入口(真仙 / 神人 / 混沌真灵)一视同仁。
   *
   * 真仙从前是唯一的「无劫门槛」(旧设计当它是飞升之赏),那条例外让
   * 进阶成功率的作用域、跨界入口的规矩、以及"大关未必渡劫"这条规则全都说不清。
   * 现在飞升也要渡劫:想要无劫的路,得先有本事免劫。
   */
  it('飞升不例外:三个跨界入口都要渡劫', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const entries = WORLDS.filter(w => w.start > 0).map(w => w.start)
    expect(entries.length, '跨界入口数量不对').toBe(WORLDS.length - 1) // 人间界之外的三界
    for (const entry of entries) {
      // 站在入口的前一境圆满:下一境就是那一界的门槛
      player.$patch({ major: entry - 1, sub: 9, exp: { m: 1e30, e: 0 } })
      resources.$patch({ qi: 1e30 })
      const info = breakthroughInfo()
      console.log(`${REALMS[entry - 1]!.name}→${REALMS[entry]!.name}:needTribulation=${info.needTribulation}`)
      expect(info.needTribulation, `${REALMS[entry]!.name} 是界域入口,却没有劫`).toBe(true)
      expect(info.isMajor).toBe(true)
    }
  })
})
