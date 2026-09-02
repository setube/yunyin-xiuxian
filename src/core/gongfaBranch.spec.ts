/**
 * Phase 31.0 A3:功法悟道分支 —— 满级后择一,改变成长方向
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCultivationStore } from '@/stores/cultivation'
import { branchesFor, canEnlighten, gongfaBranchDef, GONGFA_BRANCHES } from '@/data/gongfaBranches'
import { gongfaDef } from '@/data/gongfa'
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

/**
 * 「可悟道」不得虚指。
 *
 * 曾经界面只判满级就挂出「可悟道」,而全书三十余部功法里只有三部写了分支——
 * 玩家练满其余任意一部,都会看到一个点开即空的提示,这正是「不知道什么意思、也没法悟道」的由来。
 * 判据自此收归 canEnlighten 一处,下面这几条守着它别再散开。
 */
describe('悟道提示与实际可选项同源', () => {
  it('满级但该功法无分支时不可悟道(不虚指)', () => {
    // 龟灵吐纳术未写分支:纵然功行圆满,也不该招手
    expect(branchesFor('s_tuna').length).toBe(0)
    expect(canEnlighten('s_tuna', 99)).toBe(false)
  })

  it('有分支的功法满级才可悟道,未满级不可', () => {
    const max = gongfaDef('m_taixuan')?.maxLevel ?? 9
    expect(canEnlighten('m_taixuan', max - 1)).toBe(false)
    expect(canEnlighten('m_taixuan', max)).toBe(true)
  })

  it('不存在的功法一律不可悟道', () => {
    expect(canEnlighten('m_not_a_real_gongfa', 99)).toBe(false)
  })

  it('凡可悟道者必给得出至少两条路 —— 只有一条不叫「择一」', () => {
    const withBranch = new Set(GONGFA_BRANCHES.map(b => b.gongfaId))
    expect(withBranch.size).toBeGreaterThan(0)
    for (const id of withBranch) {
      expect(gongfaDef(id), `分支表引用了不存在的功法 ${id}`).toBeDefined()
      expect(branchesFor(id).length, `${id} 只有一条分支`).toBeGreaterThanOrEqual(2)
    }
  })

  it('每条分支都实给词条 —— 选了等于没选是欺骗', () => {
    for (const b of GONGFA_BRANCHES) {
      const entries = Object.entries(b.mods)
      expect(entries.length, `${b.name} 无任何词条`).toBeGreaterThan(0)
      for (const [k, v] of entries) {
        expect(v, `${b.name} 的 ${k} 非正值`).toBeGreaterThan(0)
      }
    }
  })

  it('分支 id 全局唯一(回查不会串味)', () => {
    const ids = GONGFA_BRANCHES.map(b => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
