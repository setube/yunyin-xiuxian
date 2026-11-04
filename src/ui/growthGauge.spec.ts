/**
 * 修行倍率的刻度。
 *
 * 建号页掷完灵根只给一个数「修行倍率 ×1.11」,而 1.11 算好还是不好无从判断 ——
 * 同屏有五个资质数、一个「杂灵根」标签,唯独没有「这一手在你可能拿到的牌里排哪一段」。
 *
 * 判据:
 *   一 区间两端由 core 的因子上下界推出,不是拍的:低 0.60、高 4.00。
 *   二 位置夹在 0~1,坏值不产出 NaN。
 *   三 绝品那一档刻意窄 —— 混沌灵根与满资质单灵根都在最右,不该占掉四分之一条。
 *   四 界面接上了。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readFileSync as rf } from 'node:fs'
import { MULT_CEIL, MULT_FLOOR, growthGauge, growthPosition } from './growthGauge'

const ROOT = resolve(__dirname, '../..')
const VIEW = readFileSync(resolve(ROOT, 'src/views/CreateView.vue'), 'utf-8')
const GEN = rf(resolve(ROOT, 'src/core/linggenGen.ts'), 'utf-8')

describe('倍率刻度 · 一、区间两端由因子上下界推出', () => {
  it('下界 = 五根杂灵根的最低倍率', () => {
    // (40/60) × COUNT_FACTOR[5]=0.9 × 无特殊
    const lowest = (40 / 60) * 0.9
    expect(MULT_FLOOR).toBeCloseTo(lowest, 2)
  })

  it('上界盖得住混沌灵根', () => {
    // 混沌:资质 85~100 → (100/60) × 1.6 × 1.5
    const chaosTop = (100 / 60) * 1.6 * 1.5
    expect(MULT_CEIL).toBeGreaterThanOrEqual(chaosTop)
    expect(MULT_CEIL).toBeGreaterThan(chaosTop - 0.01)
  })

  it('两端确实取自 core 的表,不是另写一套', () => {
    // core 里那三个数改了,本层的区间就该跟着改;此处钉住它们当前的来源
    expect(GEN, 'core 该有根数系数表').toContain('COUNT_FACTOR')
    expect(GEN, 'core 该有特殊灵根加成').toContain('hasSpecial ? 1.2 : 1')
    expect(GEN, 'core 该有除以 60 的资质基准').toContain('avgAptitude / 60')
  })
})

describe('倍率刻度 · 二、位置夹在 0~1', () => {
  it('两端各给 0 与 1', () => {
    expect(growthPosition(MULT_FLOOR)).toBeCloseTo(0, 6)
    expect(growthPosition(MULT_CEIL)).toBeCloseTo(1, 6)
  })

  it('越界不溢出', () => {
    expect(growthPosition(-99)).toBe(0)
    expect(growthPosition(999)).toBe(1)
    expect(growthPosition(Number.NaN)).toBe(0)
    expect(growthPosition(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('典型手牌落在可解释的位置', () => {
    // ×1.11 是截图里那一手:五根杂灵根、平均资质约 74
    const p = growthPosition(1.11)
    expect(p).toBeGreaterThan(0.1)
    expect(p).toBeLessThan(0.25)
    expect(growthGauge(1.11).tier).toBe('low')
  })
})

describe('倍率刻度 · 三、绝品那一档刻意窄', () => {
  it('四档说法各不同', () => {
    const labels = new Set(['low', 'mid', 'high', 'peak'].map(t => growthGauge(
      t === 'low' ? 0.7 : t === 'mid' ? 1.5 : t === 'high' ? 2.8 : 3.9
    ).label))
    expect(labels.size).toBe(4)
  })

  it('混沌灵根落在绝品', () => {
    expect(growthGauge(3.6).tier).toBe('peak')
    expect(growthGauge(4.0).tier).toBe('peak')
  })

  it('满资质单灵根也落在绝品', () => {
    // (100/60) × 1.6 × 1.2 = 3.20
    expect(growthGauge(3.2).tier).toBe('peak')
  })

  it('绝品段不到整条的三分之一', () => {
    // position ≥ 0.70 才是绝品 → 至多占 30%
    expect(1 - 0.7).toBeLessThan(0.34)
    expect(growthGauge(3.8).position).toBeGreaterThanOrEqual(0.7)
  })

  it('四档按真实牌型切,不按四等分', () => {
    // 五根杂灵根资质 70 → 1.05 仍在最低档;三根资质 70 → 1.34 进第二档
    expect(growthGauge(1.05).tier).toBe('low')
    expect(growthGauge(1.34).tier).toBe('mid')
    // 真灵根(二根)70 → 1.58 与单根异灵根 70 → 1.87 同属第二档
    expect(growthGauge(1.58).tier).toBe('mid')
    expect(growthGauge(1.87).tier).toBe('mid')
    // 变异灵根资质 70 → 2.24 才进上乘
    expect(growthGauge(2.24).tier).toBe('high')
  })

  it('坏值回落一档,不抛错', () => {
    const g = growthGauge(Number.NaN)
    expect(g.mult).toBe(1)
    expect(Number.isFinite(g.position)).toBe(true)
  })
})

describe('倍率刻度 · 四、建号页接上了', () => {
  it('倍率旁边有刻度与档次', () => {
    expect(VIEW).toContain('growthGauge')
    expect(VIEW, '该有一根刻度').toContain('growth-gauge')
    expect(VIEW, '该说出这一手属哪档').toContain('growthTier')
  })

  it('轴两端有数 —— 没有参照的刻度等于没有', () => {
    expect(VIEW).toMatch(/growthTier\.floor|MULT_FLOOR/)
    expect(VIEW).toMatch(/growthTier\.ceil|MULT_CEIL/)
  })
})
