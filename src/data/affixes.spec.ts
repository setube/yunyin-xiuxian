/**
 * 词条按品质分组的边界
 * 自动重铸候选要从一张平铺网格变成四档品质分组 —— 分组逻辑单独测:
 * 传世/珍稀/稀有/常见(稀有度序由 AFFIX_RARITY_RANK 定,不硬编码),
 * 空组不占位、组内保序、全体不漏不重。
 */
import { describe, expect, it } from 'vitest'
import type { AffixDef, AffixRarity } from '@/types'
import { affixesByRarity } from './affixes'

/** 词条夹具:只关心 rarity 与 id,其余字段按类型最小补齐 */
function mk(id: string, rarity: AffixRarity): AffixDef {
  return {
    id,
    name: id,
    desc: '',
    key: 'attackPct',
    min: 1,
    max: 2,
    decimals: 1,
    weight: 0,
    rarity,
    slots: undefined,
    minRank: undefined
  }
}

describe('词条按品质分组 affixesByRarity', () => {
  it('传世 → 珍稀 → 稀有 → 常见(稀有度序高在前),组内保持原序', () => {
    const common = mk('c1', 'common')
    const epic = mk('e1', 'epic')
    const common2 = mk('c2', 'common')
    const legendary = mk('l1', 'legendary')
    const rare = mk('r1', 'rare')
    const groups = affixesByRarity([common, epic, common2, legendary, rare])
    expect(groups.map(g => g.rarity)).toEqual(['legendary', 'epic', 'rare', 'common'])
    expect(groups.find(g => g.rarity === 'common')?.items.map(a => a.id)).toEqual(['c1', 'c2'])
    expect(groups.find(g => g.rarity === 'rare')?.items.map(a => a.id)).toEqual(['r1'])
  })

  it('空组不占位 —— 缺哪档就只给哪几档', () => {
    const groups = affixesByRarity([mk('l1', 'legendary'), mk('c1', 'common')])
    expect(groups.map(g => g.rarity)).toEqual(['legendary', 'common'])
  })

  it('全体不漏不重 —— 并起来与原列表一物不差', () => {
    const input = [mk('a1', 'common'), mk('b1', 'epic'), mk('c1', 'legendary'), mk('d1', 'rare')]
    const ids = affixesByRarity(input).flatMap(g => g.items.map(a => a.id))
    expect([...ids].sort()).toEqual([...input.map(a => a.id)].sort())
  })

  it('空列表返回空', () => {
    expect(affixesByRarity([])).toEqual([])
  })
})
