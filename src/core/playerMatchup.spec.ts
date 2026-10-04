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
    const a = playerMatchups(snap({}), 40)
    const b = playerMatchups(snap({}), 40)
    expect(a.map(r => r.winRate)).toEqual(b.map(r => r.winRate))
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

  it('三维更强的构筑,各面胜率都不输,且至少有一面真拉开(单调粗判据)', () => {
    const weak = playerMatchups(snap({}), 60)
    const strong = playerMatchups(snap({ attack: gn(300), defense: gn(150), maxHp: gn(4000) }), 60)
    const weakById = new Map(weak.map(r => [r.id, r.winRate]))
    for (const r of strong) {
      expect(r.winRate + 1e-9, `对「${r.name}」,强构筑应 ≥ 弱构筑`).toBeGreaterThanOrEqual(weakById.get(r.id)!)
    }
    const gains = strong.map(r => r.winRate - weakById.get(r.id)!)
    expect(Math.max(...gains), '强构筑总该有一面明显胜出,否则断言形同虚设').toBeGreaterThan(0.05)
  })
})
