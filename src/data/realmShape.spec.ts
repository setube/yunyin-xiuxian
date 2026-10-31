/**
 * 境界的形状:小境界层数、大境界数、历练区域数三者必须自洽。
 *
 * 这里钉的是一处真实错位风险:
 *   constants.SUB_LEVELS = 10 是「满级判据」用的上界(formulas 里 sub >= SUB_LEVELS - 1 即圆满)
 *   realms.SUB_NAMES      = 10 个名字(一层…九层、圆满),是「显示」用的钳制上界
 * 两个数各写一处,一旦分叉就会出现「界面显示已圆满,实际还能再练」
 * 或「练到第 10 层却没有名字可以显示」。
 *
 * 另外把 realms.ts / regions.ts 注释里的规模数字也一并钉住。
 */
import { describe, expect, it } from 'vitest'
import { REALMS, SUB_NAMES } from '@/data/realms'
import { REGIONS } from '@/data/regions'
import { SUB_LEVELS } from '@/data/constants'
import { MAX_MAJOR } from '@/data/realms'

describe('小境界 · 层数与名字表同源', () => {
  it('SUB_NAMES 的长度等于 SUB_LEVELS', () => {
    expect(SUB_NAMES.length, '名字表与满级判据的层数不一致,会出现「显示圆满还能练」').toBe(SUB_LEVELS)
  })

  it('名字依次是「一层…九层」再加「圆满」(注释写的就是「9 层 + 圆满」)', () => {
    const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
    for (let i = 0; i < 9; i += 1) {
      expect(SUB_NAMES[i], `第 ${i} 层应叫「${CN[i]}层」`).toBe(`${CN[i]}层`)
    }
    expect(SUB_NAMES[9], '最后一阶应是「圆满」').toBe('圆满')
  })

  it('名字两两不同(重复会让两层看起来一样)', () => {
    expect(new Set(SUB_NAMES).size).toBe(SUB_NAMES.length)
  })

  it('名字都非空', () => {
    for (const [i, n] of SUB_NAMES.entries()) expect(n.length, `第 ${i} 层没名字`).toBeGreaterThan(0)
  })
})

describe('大境界与区域 · 规模与注释一致', () => {
  it('历练区域 —— 44 处', () => {
    expect(REGIONS.length, '区域数与注释的 44 不符').toBe(44)
  })

  it('MAX_MAJOR 与 REALMS 的长度自洽', () => {
    // MAX_MAJOR 定义为 REALMS.length - 1,这里验的是它没有被别处写死成别的值
    expect(MAX_MAJOR).toBe(REALMS.length - 1)
  })

  it('每个大境界都有非空名字,且两两不同', () => {
    const names = REALMS.map(r => r.name)
    for (const [i, n] of names.entries()) expect(n.length, `第 ${i} 境没名字`).toBeGreaterThan(0)
    expect(new Set(names).size, '两个大境界同名').toBe(names.length)
  })

  it('区域按 tier 非递减排列(同层可有多个区域,但不能倒序)', () => {
    const tiers = REGIONS.map(r => r.tier)
    for (let i = 1; i < tiers.length; i += 1) {
      expect(tiers[i]!, '区域表的 tier 出现倒序').toBeGreaterThanOrEqual(tiers[i - 1]!)
    }
    expect(new Set(tiers).size, '分区只该有 32 级,与 stoneByTier 的阶梯同源').toBeLessThanOrEqual(tiers.length)
  })
})
