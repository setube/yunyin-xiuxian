/**
 * 战斗危险因子在线/离线同源:全局只认 dangerFactorFor,在线 runBattle 与离线 settleOffline 都调它;
 * 任何一处不得再内联 `(1 + (region.danger - 1) * 0.05)`。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dangerFactorFor } from './exploration'

describe('战斗危险因子 · 同源函数', () => {
  it('纯函数:基础倍率 × 地域差值 × 灵兽性格 × 区域事件,层层相乘', () => {
    // 寻常游历(dangerMult 1)× 青云山(danger 1)× 无灵兽 × 无事件 → 1
    expect(dangerFactorFor(1, 1, 1, 1)).toBe(1)
    // 深入探寻(1.45)× 高危险地域 × 好战灵兽(1.15)× 无事件
    expect(dangerFactorFor(1.45, 3, 1.15, 1)).toBeCloseTo(1.45 * (1 + 2 * 0.05) * 1.15, 10)
    // 妖潮叠加:再乘事件危险倍率
    expect(dangerFactorFor(1.45, 3, 1.15, 1.4)).toBeCloseTo(1.45 * (1 + 2 * 0.05) * 1.15 * 1.4, 10)
  })

  it('全局只有一个实现:探索与离线都 import dangerFactorFor,再无内联常数', () => {
    const exploration = readFileSync(resolve(__dirname, './exploration.ts'), 'utf8')
    const offline = readFileSync(resolve(__dirname, './offline.ts'), 'utf8')
    expect(exploration).toContain('dangerFactorFor')
    expect(offline).toContain('dangerFactorFor')
    expect(offline).not.toContain("1 + (region.danger - 1) * 0.05")
  })
})
