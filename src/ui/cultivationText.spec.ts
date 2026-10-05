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
    expect(view).toContain('repairActLabel(')
    expect(view).toContain('prepPillShortToast()')
    expect(view).not.toContain('灵气不足')
    expect(view).not.toContain('灵石不足')
    expect(view, '天威区间须乘入今日 tribulationMult,与劫势/引劫同源').toContain(
      'tribulationWaveSpan(tribPlan.value.def, tribTargetMajor.value, tribWeather.value.tribulationMult)'
    )
    expect(view).toContain('weatherTribulationLine')
    expect(view, '开劫护持与每波恢复须走 guardScore / sustainScore').toContain('guardScore(')
    expect(view).toContain('sustainScore(')
    const offline = readFileSync(new URL('../core/offline.ts', import.meta.url), 'utf8')
    expect(offline).toContain('breakthroughReadyNote(')
    expect(offline).toContain('atMaxRealm')
  })
})
