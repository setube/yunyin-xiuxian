/**
 * playerMatchups —— 当前构筑对本世七类实敌的胜率面。
 * 纯算:给构筑快照、场次、种子,回来七行;断言只认「稳定性与有意义的单调」,
 * 不钉具体百分比(数值随平衡走,契约是方向与确定性)。
 */
import { describe, expect, it } from 'vitest'
import { gn } from '@/utils/gnum'
import type { CombatantSnap } from '@/types'
import { playerMatchups } from './playerMatchup'

function snap(over: Partial<CombatantSnap>): CombatantSnap {
  return {
    name: '测试构筑',
    icon: 'user',
    isPlayer: true,
    attack: gn(100),
    defense: gn(55),
    maxHp: gn(1400),
    speed: 1,
    mods: {},
    skills: [{ name: '测试杀招', mult: 1.7, rate: 0.25 }],
    ...over
  }
}

describe('本世对局 · playerMatchups', () => {
  it('固定种子 → 同构筑两遍读数逐位一致(不随刷新跳)', () => {
    // 带铁壁(一次性保命)的构筑:引擎会在命中时改写快照的 ironwallBrace,
    // 若快照被复用,第二遍会因「第一遍已消耗」而与第一遍读数不同 —— 这里就是它的回归闸
    const a = playerMatchups(snap({ ironwallBrace: true }), 40)
    const b = playerMatchups(snap({ ironwallBrace: true }), 40)
    expect(a.map(r => r.winRate)).toEqual(b.map(r => r.winRate))
  })

  it('非正/非整数 n 一律回落默认 60,不再产出 NaN 或越界胜率', () => {
    for (const bad of [0, -3, 0.5, NaN]) {
      const rows = playerMatchups(snap({}), bad)
      expect(rows.length).toBe(7)
      for (const r of rows) {
        expect(Number.isFinite(r.winRate), `n=${bad} 时胜率应有限`).toBe(true)
        expect(r.winRate).toBeGreaterThanOrEqual(0)
        expect(r.winRate).toBeLessThanOrEqual(1)
      }
    }
  })

  it('覆盖七类原型且胜率落在 [0,1]', () => {
    const rows = playerMatchups(snap({}), 40)
    expect(rows.length).toBe(7)
    for (const r of rows) {
      expect(r.winRate).toBeGreaterThanOrEqual(0)
      expect(r.winRate).toBeLessThanOrEqual(1)
    }
  })

  it('四墙标记 = 首领/高爆发/真伤/疾影(与 buildSearch 万金油同源)', () => {
    const rows = playerMatchups(snap({}), 40)
    expect(rows.filter(r => r.wall).map(r => r.id).sort()).toEqual(['boss', 'burst', 'dodge', 'pierce'])
  })

  it('三维更强的构筑,平均胜率不输、且有实打实的拉开(聚合口径,抗抽样方差)', () => {
    // 按面逐一比不抗抽样噪声:两遍独立采样,更强的构筑也有可能在某面上被方差拽低,
    // 平衡一动就随机翻红 —— 比七面平均,合计 840 场下方差被平均掉,方向断言才稳。
    const weak = playerMatchups(snap({}), 120)
    const strong = playerMatchups(snap({ attack: gn(300), defense: gn(150), maxHp: gn(4000) }), 120)
    const avg = (rows: { winRate: number }[]): number => rows.reduce((s, r) => s + r.winRate, 0) / rows.length
    const weakAvg = avg(weak)
    const strongAvg = avg(strong)
    expect(strongAvg + 1e-9, `强构筑平均胜率(${strongAvg.toFixed(3)})应 ≥ 弱构筑(${weakAvg.toFixed(3)})`).toBeGreaterThanOrEqual(weakAvg)
    expect(strongAvg - weakAvg, '强构筑总该有实打实的拉开,否则断言形同虚设').toBeGreaterThan(0.1)
  })
})
