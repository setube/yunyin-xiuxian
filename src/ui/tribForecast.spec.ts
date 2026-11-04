/**
 * 渡劫前的逐波推演读数。
 *
 * 决意前最该知道「最险会掉到哪」与「第几道不支」,而 core 的 traceTribulation 早算出了这两项,
 * 原只用来定「劫势」一档、算完即弃。本层把那两项翻成一句话与一个水位比例。
 *
 * 判据:
 *   一 只转发 core 的数,不重算推演。
 *   二 水位跌破 0 按 0 画 —— 负数的条没有意义。
 *   三 崩了就说崩在第几道;撑到最后就说共几道、最低多少。
 *   四 险度档只看最低水位,与 core 分档同一条线。
 *   五 界面真的接上了。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TribulationTrace } from '@/core/tribulationDecision'
import { tribForecast } from './tribForecast'

const ROOT = resolve(__dirname, '../..')
const DETAIL = readFileSync(resolve(ROOT, 'src/components/cultivation/TribulationDetail.vue'), 'utf-8')

const trace = (over: Partial<TribulationTrace>): TribulationTrace => ({
  survived: true,
  hpLeft: 0.6,
  minHp: 0.35,
  fellAt: 0,
  ...over
})

describe('渡劫推演 · 一、只转发 core 的数', () => {
  it('水位取 core 的 minHp,不是终局 hpLeft', () => {
    // 两者刻意取不同值:终局 0.8、全程最低 0.2
    const f = tribForecast(trace({ hpLeft: 0.8, minHp: 0.2 }), 9)
    expect(f.lowPct).toBeCloseTo(0.2, 5)
  })

  it('崩在第几道原样转发', () => {
    expect(tribForecast(trace({ survived: false, fellAt: 4 }), 9).fellAt).toBe(4)
  })

  it('坏值不抛错', () => {
    const f = tribForecast(trace({ survived: true, minHp: Number.NaN, fellAt: Number.NaN }), Number.NaN)
    expect(Number.isFinite(f.lowPct)).toBe(true)
    expect(f.fellAt).toBe(0)
    expect(f.line).toBeTruthy()
  })
})

describe('渡劫推演 · 二、水位夹在 0~1', () => {
  it('跌破 0 按 0 画 —— 负数的条没有意义', () => {
    expect(tribForecast(trace({ survived: false, minHp: -0.4 }), 9).lowPct).toBe(0)
  })

  it('超过 1 按 1 画 —— 开劫护持能让人先超出血条,但条只有满', () => {
    expect(tribForecast(trace({ minHp: 1.6 }), 9).lowPct).toBe(1)
  })
})

describe('渡劫推演 · 三、两种结局各说各的', () => {
  it('撑到最后:说道数与最低水位', () => {
    const f = tribForecast(trace({ survived: true, minHp: 0.62 }), 9)
    expect(f.line).toContain('9 道')
    expect(f.line).toContain('62%')
  })

  it('崩了:说崩在第几道,不说「最低多少」', () => {
    const f = tribForecast(trace({ survived: false, fellAt: 4, minHp: -0.1 }), 9)
    expect(f.line).toContain('第 4 道')
    expect(f.line).toContain('不支')
  })

  it('道数未知时不编一个数', () => {
    const f = tribForecast(trace({ survived: false, fellAt: 3 }), 0)
    expect(f.line).not.toMatch(/\d+ 道/)
    expect(f.line).toContain('不支')
  })
})

describe('渡劫推演 · 四、险度档', () => {
  it('崩了是 danger', () => {
    expect(tribForecast(trace({ survived: false, fellAt: 2 }), 9).tone).toBe('danger')
  })

  it('撑到最后但最低水位低于 45% 是险过', () => {
    expect(tribForecast(trace({ survived: true, minHp: 0.44 }), 9).tone).toBe('graze')
  })

  it('最低水位高于 45% 是稳过', () => {
    expect(tribForecast(trace({ survived: true, minHp: 0.5 }), 9).tone).toBe('safe')
  })

  it('分档线取 core 那条 0.45,不另立一套', () => {
    const src = readFileSync(resolve(ROOT, 'src/core/tribulationDecision.ts'), 'utf-8')
    expect(src, 'core 里该有 0.45 这条线').toContain('trace.minHp / 0.45')
  })
})

describe('渡劫推演 · 五、界面接上了', () => {
  it('劫势详情里画出了推演水位与读数', () => {
    expect(DETAIL).toContain('tribForecast')
    expect(DETAIL, '该把读数那行写出来').toContain('forecast')
    expect(DETAIL, '该有一根水位条').toContain('trib-forecast')
  })
})
