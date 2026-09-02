/* eslint-disable no-console */
/**
 * 突破服务 —— 渡劫成功率推演
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { tribulationSuccessRate, breakthroughInfo } from './breakthrough'
import { buildTribulationPlan, currentTribulationPlan } from './tribulationDecision'
import type { StatMods } from '@/types'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'

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
})
