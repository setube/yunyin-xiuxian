/**
 * 词条图的字面 —— 效果区间、部位、品质门槛、稀有度章。
 * 区间直接吃 affixValue(roll 0/1),词条数值改了没必要动这张桌的断言。
 */
import { describe, expect, it } from 'vitest'
import { affixDef, AFFIXES } from '@/data/affixes'
import type { AffixDef } from '@/types'
import { affixRangeEnds, affixRangeText, affixRankText, affixRarityColor, affixRarityLabel, affixSlotsText } from './affixInfoText'

describe('词条图 · 字面现算', () => {
  it('效果区间 = 两端填进 {v}:攻击 2~5、暴伤整数档不落地碎数', () => {
    expect(affixRangeText(affixDef('atk1')!)).toBe('攻击提升 2~5%')
    expect(affixRangeText(affixDef('cdmg4')!)).toBe('暴击伤害提升 50~80%')
  })

  it('区间两头由 affixValue(roll 0/1) 给出,与掉落同式', () => {
    const ends = affixRangeEnds(affixDef('atk3')!) // min 10 max 18
    expect(ends).toEqual({ lo: 10, hi: 18 })
  })

  it('定值词条(两端相等)只写一个数', () => {
    const fixed: AffixDef = {
      id: 'x1', name: '恒定', desc: '攻击提升 {v}%', key: 'attackPct',
      min: 5, max: 5, decimals: 1, weight: 1, rarity: 'common'
    }
    expect(affixRangeText(fixed)).toBe('攻击提升 5%')
  })

  it('部位:不设 slots 记全部位,设了按装备部位列名', () => {
    expect(affixSlotsText(affixDef('atk1')!)).toBe('全部位')
    // crit1 只见武器/项链/戒指/灵符(变量 W+J)
    expect(affixSlotsText(affixDef('crit1')!).split('·')).toEqual(['武器', '项链', '戒指', '灵符'])
  })

  it('品质门槛:按 rank 找品名,无门槛为 null', () => {
    expect(affixRankText(affixDef('atk3')!)).toBe('需地品起') // minRank 5
    expect(affixRankText(affixDef('atk1')!)).toBeNull()
  })

  it('稀有度章与品位色:喂 id 或整条定义都出同一家人', () => {
    const def = affixDef('atk4')! // 权重 8 → legendary
    expect(affixRarityLabel(def)).toBe('传世')
    expect(affixRarityLabel(def.rarity)).toBe('传世')
    expect(affixRarityColor(def.rarity)).toBe(affixRarityColor(def))
    expect(AFFIXES.length).toBeGreaterThan(100) // 池子真在,别哪天被误清
  })
})
