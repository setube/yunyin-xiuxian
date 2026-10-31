/**
 * 灵草购价:唯一的草价锚,坊市买/售、悬赏募草都从它派生。
 * 三条不变式:随层级同尺缩放、逐品 ×2、恒为 4 的倍数(售=购/2 与悬赏=购×3/4 才都是整数)。
 */
import { describe, expect, it } from 'vitest'
import { HERB_GRADES } from '@/data/herbGrades'
import { MAX_MAJOR } from '@/data/realms'
import { maxTierForMajor } from '@/data/regions'
import { toNum } from '@/utils/gnum'
import { stoneByTier } from './formulas'
import { herbBuyPrice } from './herbPrice'

/** 价锚:一场战斗 ≈ 10,草按 64 折算 */
const HERB_STONE_AMOUNT = 64

describe('灵草购价', () => {
  it('凡品价 = 该层级石粮 × 64 /(10 的系数)', () => {
    const major = 0
    const base = toNum(stoneByTier(maxTierForMajor(major), HERB_STONE_AMOUNT))
    // 实现里先 Math.floor(raw / 4) * 4,所以只能比到 4 的倍数
    expect(herbBuyPrice(1, major)).toBe(Math.floor(base / 4) * 4)
  })

  it('恒为 4 的倍数:售(×1/2)与悬赏(×3/4)才都是整数', () => {
    for (const major of [0, 3, 9, 14, MAX_MAJOR]) {
      for (const grade of HERB_GRADES) {
        expect(herbBuyPrice(grade, major) % 4, `品阶 ${grade} · 境界 ${major}`).toBe(0)
      }
    }
  })

  it('逐品翻倍:每一品是上一品的两倍(取整前的关系)', () => {
    const major = 10
    for (let i = 1; i < HERB_GRADES.length; i += 1) {
      const cur = herbBuyPrice(HERB_GRADES[i]!, major)
      const prev = herbBuyPrice(HERB_GRADES[i - 1]!, major)
      expect(cur, `品阶 ${i + 1} 相对 ${i}`).toBeGreaterThan(prev * 1.9)
      expect(cur).toBeLessThan(prev * 2.1)
    }
  })

  it('随境界单调递增(用同一把 maxTierForMajor 尺)', () => {
    let prev = 0
    for (let major = 0; major <= MAX_MAJOR; major += 1) {
      const cur = herbBuyPrice(1, major)
      expect(cur, `境界 ${major} 的草价不该低于前一境`).toBeGreaterThanOrEqual(prev)
      prev = cur
    }
  })

  it('边界:境界 0 与上限都取得到正价,不给 0 也不给负', () => {
    expect(herbBuyPrice(1, 0)).toBeGreaterThan(0)
    expect(herbBuyPrice(1, MAX_MAJOR)).toBeGreaterThan(0)
    expect(herbBuyPrice(HERB_GRADES[HERB_GRADES.length - 1]!, MAX_MAJOR)).toBeGreaterThan(0)
  })

  it('越界境界不炸,且落到下限/上限那一档', () => {
    // maxTierForMajor 的 best 初值 1:没有区域满足 minRealm <= major 时返回 1
    const MIN_TIER = 1
    expect(maxTierForMajor(-5), '负数境界落到最低层').toBe(MIN_TIER)
    expect(herbBuyPrice(1, -5)).toBe(herbBuyPrice(1, -999))
    expect(Number.isFinite(herbBuyPrice(1, -5))).toBe(true)
    // 超大境界夹在最高层
    expect(maxTierForMajor(999)).toBe(maxTierForMajor(MAX_MAJOR))
    expect(herbBuyPrice(1, 999), '超出境界上限按最高层计价').toBe(herbBuyPrice(1, MAX_MAJOR))
  })

  it('同一境界下高品草更贵(单调性,防止阶乘写反)', () => {
    const major = 12
    for (let i = 1; i < HERB_GRADES.length; i += 1) {
      expect(herbBuyPrice(HERB_GRADES[i]!, major)).toBeGreaterThan(herbBuyPrice(HERB_GRADES[i - 1]!, major))
    }
  })
})
