/**
 * Phase 31.0 A3:功法悟道分支 —— 满级后择一,改变成长方向
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCultivationStore } from '@/stores/cultivation'
import { branchesFor, gongfaBranchDef } from '@/data/gongfaBranches'
import { modOf } from './statsCalc'

describe('功法悟道分支(gongfaBranch)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('太玄引气诀满级前不可选分支', () => {
    const cul = useCultivationStore()
    cul.learn('m_taixuan')
    cul.upgrade('m_taixuan') // 2 层
    expect(cul.chooseBranch('m_taixuan', 'b_taixuan_sha')).toBe(false)
  })

  it('满级后可选分支,且分支词条并入功法属性', () => {
    const cul = useCultivationStore()
    cul.learn('m_taixuan')
    for (let i = 0; i < 9; i++) cul.upgrade('m_taixuan') // 1 + 9 = 10 层(>= maxLevel 9)
    const ok = cul.chooseBranch('m_taixuan', 'b_taixuan_sha')
    expect(ok).toBe(true)
    // 分支词条(attackPct +0.1, damageBonus +0.05)已并入
    expect(modOf(cul.gongfaMods, 'attackPct')).toBeCloseTo(0.1, 5)
    expect(modOf(cul.gongfaMods, 'damageBonus')).toBeCloseTo(0.05, 5)
  })

  it('分支一经选择不可更改', () => {
    const cul = useCultivationStore()
    cul.learn('m_taixuan')
    for (let i = 0; i < 8; i++) cul.upgrade('m_taixuan')
    cul.chooseBranch('m_taixuan', 'b_taixuan_sha')
    expect(cul.chooseBranch('m_taixuan', 'b_taixuan_shou')).toBe(false)
    expect(cul.gongfaBranch.m_taixuan).toBe('b_taixuan_sha')
  })

  it('分支表完整:每个分支可回查,分支属于正确功法', () => {
    for (const b of branchesFor('m_taixuan')) {
      expect(gongfaBranchDef(b.id)?.gongfaId).toBe('m_taixuan')
    }
    expect(branchesFor('m_taixuan').length).toBe(3)
  })
})
