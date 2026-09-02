/**
 * Phase 31.0 S5:装备共鸣 —— 机制组合而非数值堆叠
 */
import { describe, it, expect } from 'vitest'
import { activeSets, setCounts, hasActiveSet, equipSetDef } from './equipSet'
import type { EquipmentInstance, QualityId } from '@/types'

function inst(uid: string, templateId: string): EquipmentInstance {
  return { uid, templateId, quality: 'fine' as QualityId, tier: 3, level: 0, affixes: [] }
}

describe('装备共鸣(equipSet)', () => {
  it('组定义完整:铁壁/星斗,含机制钩子', () => {
    expect(equipSetDef('s_tiebi')?.hook).toBe('ironwall')
    expect(equipSetDef('s_xingdou')?.hook).toBe('astral')
  })

  it('同 set 两件触发共鸣,单件不触发', () => {
    const one = [inst('a', 'w_xuantie')]
    expect(activeSets(one).length).toBe(0)
    const two = [inst('a', 'w_xuantie'), inst('b', 'h_xuantie')]
    const sets = activeSets(two)
    expect(sets.length).toBe(1)
    expect(sets[0]!.id).toBe('s_tiebi')
    expect(hasActiveSet(two, 'ironwall')).toBe(true)
  })

  it('不同 set 互不干扰,各自计件', () => {
    const mixed = [inst('a', 'w_xuantie'), inst('b', 'h_xuantie'), inst('c', 'h_xingchen'), inst('d', 'b_xingluo')]
    const sets = activeSets(mixed)
    expect(sets.length).toBe(2)
  })

  it('已装备统计正确(未装备的不计)', () => {
    const counts = setCounts([inst('a', 'w_xuantie'), inst('b', 'b_xuanwu')])
    expect(counts.get('s_tiebi')).toBe(2)
  })
})
