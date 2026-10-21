import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  breakthroughActLabel,
  breakthroughExpReason,
  breakthroughGoalText,
  breakthroughPeakReason,
  breakthroughQiReason,
  breakthroughReadyNote,
  prepPillDisabledLabel,
  prepPillShortToast,
  repairActLabel,
  repairDoneToast,
  repairIdleToast,
  repairShortToast
} from './cultivationText'

describe('修行页提示 · 文言仍报清缕数与药资', () => {
  it('疗伤缺气、落成、无伤,不说不足', () => {
    expect(repairIdleToast()).toContain('无恙')
    expect(repairShortToast('120')).toBe('灵气未足,静养需 120 缕')
    expect(repairShortToast('120')).not.toContain('不足')
    expect(repairDoneToast('120')).toContain('耗灵气 120')
    expect(repairActLabel(true, '80')).toContain('引气疗伤')
    expect(repairActLabel(false, '80')).toBe(repairShortToast('80'))
  })

  it('备药与突破门槛仍报灵石、灵气', () => {
    expect(prepPillShortToast()).toContain('灵石')
    expect(prepPillShortToast()).toContain('备药')
    expect(prepPillShortToast()).not.toContain('不足')
    // 欠资禁用说明与备药 toast 同一句「未足」,也不够硬
    expect(prepPillDisabledLabel()).toContain('灵石')
    expect(prepPillDisabledLabel()).not.toContain('不足')
    expect(breakthroughPeakReason()).toContain('大道尽头')
    expect(breakthroughExpReason()).toContain('圆满')
    expect(breakthroughQiReason('40')).toBe('灵气未足,此关需 40 缕')
    expect(breakthroughActLabel(false)).toBe('尝试突破')
    expect(breakthroughActLabel(true)).toBe('引劫突破')
    expect(breakthroughGoalText(true, true, '筑基初期')).toBe('引劫突破「筑基初期」')
    expect(breakthroughGoalText(true, false, '炼气中期')).toBe('尝试突破「炼气中期」')
    expect(breakthroughReadyNote(true)).toBe('修为已至圆满,可引劫突破')
    expect(breakthroughReadyNote(false)).not.toContain('引劫')
  })
})

describe('修行页与提示同源', () => {
  it('疗伤按钮与备药 toast 走 cultivationText', () => {
    const view = readFileSync(new URL('../views/CultivationView.vue', import.meta.url), 'utf8')
    // 破境卡(成功率/准备/引劫)拆出后判据随本体走:宿主办疗伤,卡办备药 —— 两处合扫
    const card = readFileSync(new URL('../components/cultivation/BreakthroughCard.vue', import.meta.url), 'utf8')
    // 劫势读数拆出后判据随本体走(composables/useTribulation.ts),宿主只留「进阶成功率」与备药
    const trib = readFileSync(new URL('../composables/useTribulation.ts', import.meta.url), 'utf8')
    expect(view).toContain('repairActLabel(')
    expect(card).toContain('prepPillShortToast()')
    // 破境按钮与准备板只此一份:宿主若把整块再抄回来,两处文案迟早分叉
    expect(view, '宿主只挂载破境卡').toContain('<BreakthroughCard />')
    expect(view, '宿主不再自带突破按钮').not.toContain('引 劫 突 破')
    expect(card, '引劫/尝试按钮在卡里').toContain('attemptBreakthrough()')
    expect(view + card).not.toContain('灵气不足')
    expect(view + card).not.toContain('灵石不足')
    expect(trib, '天威区间须乘入今日 tribulationMult,与劫势/引劫同源').toContain(
      'tribulationWaveSpan(tribPlan.value.def, tribTargetMajor.value, tribWeather.value.tribulationMult)'
    )
    expect(trib).toContain('weatherTribulationLine')
    expect(trib, '开劫护持与每波恢复须走 guardScore / sustainScore').toContain('guardScore(')
    expect(trib).toContain('sustainScore(')
    const offline = readFileSync(new URL('../core/offline.ts', import.meta.url), 'utf8')
    expect(offline).toContain('breakthroughReadyNote(')
    expect(offline).toContain('atMaxRealm')
  })
})

/**
 * 「现在就能变强」的信号要在列表上看得见。
 *
 * 升层是主动消费(悟道点 + 残页),没有层内进度可画;主修卡从前只印「第 X 层」,
 * 玩家攒够了也看不出升得动,得逐部点开详情。故障注入:删掉 mainCanUpgrade,
 * 或把它改成恒 true(付不起也亮)→ 本条红。
 */
describe('修行页 · 主修可升层信号', () => {
  const view = readFileSync(new URL('../views/CultivationView.vue', import.meta.url), 'utf8')

  it('可升层 chip 只在付得起下一层时亮,成本走与升级同一处', () => {
    expect(view, '卡面要有可升层信号').toContain('可升层')
    expect(view, '信号挂在主修卡上').toContain('v-if="mainCanUpgrade"')
    expect(view, '成本取 gongfaUpgradeCost,不另写一套').toContain('const cost = gongfaUpgradeCost(def.id)')
    expect(view, '判据与 upgradeGongfa 同源').toContain("resources.hasSmall('wudao', cost.wudao)")
    expect(view, '判据与 upgradeGongfa 同源').toContain("resources.hasSmall('page', cost.page)")
    expect(view, '取不到成本(已圆满/未习得)就不该亮').toContain('if (!cost) return false')
  })
})
