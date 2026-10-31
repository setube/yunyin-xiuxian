/**
 * 道途深化纯逻辑:剑意纯度四判据 + 逐胜叠层。
 * 「/N 层」的分母由判据表长度算出,新增判据不必改 UI —— 这条由 SWORD_PURITY_MAX_LAYERS 保证。
 */
import { describe, expect, it } from 'vitest'
import type { StatMods } from '@/types'
import type { BuildDetection } from './buildDetect'
import { STYLE_MATURE_AFFINITY } from './buildDetect'
import {
  SLAUGHTER_PER_WIN,
  SWORD_LAYER_MODS,
  SWORD_PER_WIN,
  SWORD_PURITY_MAX_LAYERS,
  stackedMods,
  swordPurity
} from './daoDepth'

/** 造一个「四判据全过」的基准场景 */
function pureScene(): { mods: StatMods; art: number; build: BuildDetection } {
  return {
    mods: { damageBonus: 0.5 },
    art: 1,
    build: { affinity: STYLE_MATURE_AFFINITY, secondary: undefined } as unknown as BuildDetection
  }
}

describe('剑意纯度', () => {
  it('四项全过时满层,且分母与判据数同源', () => {
    const s = pureScene()
    const p = swordPurity(s.mods, s.art, s.build)
    expect(p.layers).toBe(SWORD_PURITY_MAX_LAYERS)
    expect(p.checks).toHaveLength(SWORD_PURITY_MAX_LAYERS)
    expect(p.checks.every(c => c.ok)).toBe(true)
  })

  it('契合不足 STYLE_MATURE_AFFINITY 时掉一层', () => {
    const s = pureScene()
    const p = swordPurity(s.mods, s.art, { ...s.build, affinity: STYLE_MATURE_AFFINITY - 0.01 } as BuildDetection)
    expect(p.layers).toBe(SWORD_PURITY_MAX_LAYERS - 1)
  })

  it('有副体系时掉一层', () => {
    const s = pureScene()
    const p = swordPurity(s.mods, s.art, { ...s.build, secondary: { id: 'x' } } as unknown as BuildDetection)
    expect(p.layers).toBe(SWORD_PURITY_MAX_LAYERS - 1)
  })

  it('法宝超过一件时掉一层:一件合格,两件不合格', () => {
    const s = pureScene()
    expect(swordPurity(s.mods, 1, s.build).layers).toBe(SWORD_PURITY_MAX_LAYERS)
    expect(swordPurity(s.mods, 2, s.build).layers).toBe(SWORD_PURITY_MAX_LAYERS - 1)
  })

  it('回血之术合计达到 0.02 即掉一层:单吸血 0.02 与两项各 0.01 同判', () => {
    const s = pureScene()
    expect(swordPurity({ ...s.mods, lifesteal: 0.02 }, s.art, s.build).layers).toBe(SWORD_PURITY_MAX_LAYERS - 1)
    // 合计恰好 0.02 也算「修了回血」:判据是 < 0.02 才过
    expect(
      swordPurity({ ...s.mods, lifesteal: 0.01, regenPerRound: 0.01 }, s.art, s.build).layers,
      '两项各 0.01 合计 0.02,应算修了回血'
    ).toBe(SWORD_PURITY_MAX_LAYERS - 1)
    expect(swordPurity({ ...s.mods, lifesteal: 0.019 }, s.art, s.build).layers, '略低于阈值仍算纯').toBe(
      SWORD_PURITY_MAX_LAYERS
    )
  })

  it('没有成形流派时掉一层(副体系判据要求 build 非空)', () => {
    const s = pureScene()
    const p = swordPurity(s.mods, s.art, null)
    expect(p.layers).toBeLessThan(SWORD_PURITY_MAX_LAYERS)
    // build 为 null 时契合判据也过不了:两判据同时失守
    expect(p.layers).toBe(SWORD_PURITY_MAX_LAYERS - 2)
  })

  it('每条判据都带名字,供 UI 逐条解释', () => {
    const s = pureScene()
    for (const c of swordPurity(s.mods, s.art, s.build).checks) {
      expect(c.name.length, '判据没名字就没法解释为什么掉层').toBeGreaterThan(0)
    }
  })
})

describe('逐胜叠层', () => {
  it('层数为 0 时原样返回', () => {
    const base: StatMods = { damageBonus: 0.1 }
    const out = stackedMods(base, SWORD_PER_WIN, 0)
    expect(out).toEqual(base)
    // n<=0 走的是 return base,不建副本;调用点都是 `x = stackedMods(...)` 整体重赋值,不会就地改入参
  })

  it('负层数按 0 处理', () => {
    expect(stackedMods({ damageBonus: 0.1 }, SWORD_PER_WIN, -5)).toEqual({ damageBonus: 0.1 })
  })

  it('线性叠加不是复利:3 层 = 基础 + 3×每层', () => {
    const out = stackedMods({ damageBonus: 0.1 }, SWORD_PER_WIN, 3)
    expect(out.damageBonus).toBeCloseTo(0.1 + SWORD_PER_WIN.damageBonus! * 3)
    expect(out.critRate).toBeCloseTo(SWORD_PER_WIN.critRate! * 3)
  })

  it('杀伐叠层只有一条词条', () => {
    const out = stackedMods({}, SLAUGHTER_PER_WIN, 2)
    expect(out.damageBonus).toBeCloseTo(SLAUGHTER_PER_WIN.damageBonus! * 2)
    expect(out.critRate, '杀伐不叠暴击').toBeUndefined()
  })

  it('剑意每层与剑道逐胜是同一组数值(同源常量)', () => {
    expect(SWORD_LAYER_MODS).toEqual(SWORD_PER_WIN)
  })
})
