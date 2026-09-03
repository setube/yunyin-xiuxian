/* eslint-disable no-console */
/**
 * 天界器魂转化(Phase 33.3)
 *
 * 33.2 让守关者按玩家深度加厚,吸收了膨胀;33.3 更进一步改变装备在天界的性质:
 * 凡器入天界,数值尽去,只余器魂——装备贡献的词条被归一化到固定容量,
 * 但各词条的相对比例完全保留。
 *
 * 设计意图:刷装备的价值从「累加总量」变成「调整方向」。
 * 九件神品与三件精品若构筑方向相同,在天界就是同一个构筑;
 * 想在天界变强只能改方向,不能靠更厚的数值。
 */
import { describe, expect, it } from 'vitest'
import type { StatMods } from '@/types'
import { forgeSoul, SOUL_CAPACITY } from './gauntlet'
import { modDepth } from './statsCalc'

/** 按比例放大一组词条,模拟「同方向但堆得更厚」 */
function scaleMods(mods: StatMods, k: number): StatMods {
  const out: StatMods = {}
  for (const key in mods) out[key as keyof StatMods] = (mods[key as keyof StatMods] ?? 0) * k
  return out
}

/** 两组词条的方向是否一致(各分量占比相同) */
function sameShape(a: StatMods, b: StatMods): boolean {
  const da = modDepth(a)
  const db = modDepth(b)
  if (da === 0 || db === 0) return da === db
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const key = k as keyof StatMods
    const ra = (a[key] ?? 0) / da
    const rb = (b[key] ?? 0) / db
    if (Math.abs(ra - rb) > 1e-9) return false
  }
  return true
}

const LIGHT: StatMods = { critRate: 0.2, critDamage: 0.4, lifesteal: 0.1 }
const HEAVY: StatMods = { critRate: 0.9, critDamage: 2.4, lifesteal: 0.7, comboRate: 0.5 }

describe('器魂 · 容量归一', () => {
  it('轻装未越容量,原样保留(不惩罚装备不足的玩家)', () => {
    expect(modDepth(LIGHT)).toBeLessThan(SOUL_CAPACITY)
    expect(forgeSoul(LIGHT)).toEqual(LIGHT)
  })

  it('重装越过容量后被压到容量线', () => {
    expect(modDepth(HEAVY)).toBeGreaterThan(SOUL_CAPACITY)
    const soul = forgeSoul(HEAVY)
    expect(modDepth(soul)).toBeCloseTo(SOUL_CAPACITY, 6)
    console.log(`\n重装词条深度 ${modDepth(HEAVY).toFixed(2)} → 器魂 ${modDepth(soul).toFixed(2)}(容量 ${SOUL_CAPACITY})`)
  })

  it('无论堆多厚,凝出的器魂深度恒为容量', () => {
    for (const k of [2, 5, 20, 100]) {
      expect(modDepth(forgeSoul(scaleMods(HEAVY, k)))).toBeCloseTo(SOUL_CAPACITY, 6)
    }
  })
})

describe('器魂 · 形状守恒(设计的核心)', () => {
  it('压缩是等比的,构筑方向原样保留', () => {
    const soul = forgeSoul(HEAVY)
    expect(sameShape(HEAVY, soul)).toBe(true)
  })

  it('同方向堆到不同厚度,凝出的器魂完全相同', () => {
    // 这正是「刷装备的价值从累加总量变成调整方向」的直接体现:
    // 三件精品与九件神品若方向一致,在天界是同一个构筑
    const thin = forgeSoul(scaleMods(HEAVY, 1))
    const thick = forgeSoul(scaleMods(HEAVY, 8))
    for (const k of Object.keys(thin)) {
      const key = k as keyof StatMods
      expect(thick[key]).toBeCloseTo(thin[key] ?? 0, 9)
    }
  })

  it('改变方向会得到不同的器魂——天界仍有构筑优化空间', () => {
    const critLean = forgeSoul({ critRate: 1.2, critDamage: 2.0, lifesteal: 0.2 })
    const stealLean = forgeSoul({ critRate: 0.3, critDamage: 0.5, lifesteal: 2.6 })
    expect(sameShape(critLean, stealLean)).toBe(false)
    // 但两者深度相同:天界比的是形状,不是厚度
    expect(modDepth(critLean)).toBeCloseTo(modDepth(stealLean), 6)
  })
})

describe('器魂 · 边界处理', () => {
  it('基础三维百分比不入器魂(它已由 worldFoeSnap 等比抵消)', () => {
    const withBase: StatMods = { ...HEAVY, attackPct: 3.5, defensePct: 2.0, maxHpPct: 2.8 }
    const soul = forgeSoul(withBase)
    expect(soul.attackPct).toBe(3.5)
    expect(soul.defensePct).toBe(2.0)
    expect(soul.maxHpPct).toBe(2.8)
  })

  it('修炼速度不入器魂(不参与战斗)', () => {
    const soul = forgeSoul({ ...HEAVY, cultivationSpeed: 4.2 })
    expect(soul.cultivationSpeed).toBe(4.2)
  })

  it('负向词条不被压缩——构筑代价必须原样带入', () => {
    // 若把代价一并等比缩小,堆得越厚代价越轻,等于变相奖励极端堆叠
    const withCost: StatMods = { ...HEAVY, damageReduction: -0.3 }
    const soul = forgeSoul(withCost)
    expect(soul.damageReduction).toBe(-0.3)
  })

  it('空词条与零值安全处理', () => {
    expect(forgeSoul({})).toEqual({})
    expect(modDepth(forgeSoul({ critRate: 0 }))).toBe(0)
  })
})

describe('器魂 · 与 33.2 深度对称的分工', () => {
  it('器魂先归一装备侧,守关者加厚再处理其余来源', () => {
    // 分工:器魂只管装备(玩家能无限刷的那部分),
    // 功法/洞府/称号/师承/灵兽/天赋属修士自身之道,不受器魂约束,
    // 它们带来的超额深度由 33.2 的 celestialDepthScale 兜底。
    // 两层各司其职,合起来才让「数值成长在天界互相抵消」真正成立
    const soul = forgeSoul(scaleMods(HEAVY, 50))
    expect(modDepth(soul)).toBeCloseTo(SOUL_CAPACITY, 6)
    // 器魂本身不会把玩家压到低于容量,自身之道的加成仍能叠上去
    expect(modDepth(soul)).toBeGreaterThan(0)
  })
})
