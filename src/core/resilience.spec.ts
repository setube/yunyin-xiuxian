/**
 * 构筑韧性:主流派核心词条被封后还剩几成战力。
 * 两处易被改坏:封核只删核心词条(其他一律不动)、保持度在「本来打不赢」时按 0 记而非 NaN。
 */
import { describe, expect, it } from 'vitest'
import type { StatMods } from '@/types'
import type { BuildStyleDef } from './buildDetect'
import { RESILIENCE_SAMPLE_RUNS, resilienceText, sealStyleMods, type ResilienceReport } from './resilience'

const style = (core: Partial<StatMods>): BuildStyleDef =>
  ({ id: 'test', name: '测试流派', seal: '测', desc: '', core }) as BuildStyleDef

describe('封核', () => {
  it('只删核心词条,其余原样保留', () => {
    const mods: StatMods = { damageBonus: 0.3, critRate: 0.2, speed: 0.1 }
    const out = sealStyleMods(mods, style({ damageBonus: 1 }))
    expect(out.damageBonus, '核心词条被清零(键消失)').toBeUndefined()
    expect(out.critRate, '非核心词条不许动').toBeCloseTo(0.2)
    expect(out.speed).toBeCloseTo(0.1)
  })

  it('不改入参(建副本再删)', () => {
    const mods: StatMods = { damageBonus: 0.3 }
    sealStyleMods(mods, style({ damageBonus: 1 }))
    expect(mods.damageBonus, '原对象必须原封不动').toBeCloseTo(0.3)
  })

  it('核心词条本来就没有时也不炸', () => {
    const out = sealStyleMods({ speed: 0.2 }, style({ damageBonus: 1 }))
    expect(out).toEqual({ speed: 0.2 })
  })

  it('核心词条有多条时全部封掉', () => {
    const out = sealStyleMods(
      { damageBonus: 0.3, critRate: 0.2, speed: 0.1 },
      style({ damageBonus: 1, critRate: 1 })
    )
    expect(out.damageBonus).toBeUndefined()
    expect(out.critRate).toBeUndefined()
    expect(out.speed).toBeCloseTo(0.1)
  })

  it('封空核心词条的流派:等于什么都没封', () => {
    const mods: StatMods = { damageBonus: 0.3 }
    expect(sealStyleMods(mods, style({}))).toEqual(mods)
  })
})

describe('韧性档位', () => {
  const report = (retention: number): ResilienceReport => ({ styleName: 'x', normal: 1, sealed: retention, retention })

  it('三档各自的下界都含等号', () => {
    expect(resilienceText(report(1)), '满保持').toBe('道基浑厚')
    expect(resilienceText(report(0.75)), '0.75 恰好是「道基浑厚」下界').toBe('道基浑厚')
    expect(resilienceText(report(0.749)), '差一点掉档').toBe('尚有余地')
    expect(resilienceText(report(0.45)), '0.45 恰好是「尚有余地」下界').toBe('尚有余地')
    expect(resilienceText(report(0.449))).toBe('孤注一掷')
    expect(resilienceText(report(0))).toBe('孤注一掷')
  })

  it('越过 1 的保持度仍是最高档(不退档)', () => {
    expect(resilienceText(report(1.5))).toBe('道基浑厚')
  })
})

describe('采样场次', () => {
  it('是有限的正整数(靠它把随机抖动压下去)', () => {
    expect(Number.isInteger(RESILIENCE_SAMPLE_RUNS)).toBe(true)
    expect(RESILIENCE_SAMPLE_RUNS).toBeGreaterThan(0)
  })
})
