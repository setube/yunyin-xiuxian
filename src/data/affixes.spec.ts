/**
 * 词条按品质分组的边界
 * 自动重铸候选要从一张平铺网格变成四档品质分组 —— 分组逻辑单独测:
 * 传世/珍稀/稀有/常见(稀有度序由 AFFIX_RARITY_RANK 定,不硬编码),
 * 空组不占位、组内保序、全体不漏不重。
 */
import { describe, expect, it } from 'vitest'
import type { AffixDef, AffixRarity } from '@/types'
import { AFFIXES, affixesByRarity } from './affixes'

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

describe('饰品专属战斗词缀(B-1)', () => {
  const J_COMBAT = AFFIXES.filter(a => /^dgj|^lsj/.test(a.id))

  it('专属战斗线只在 J 槽(项链/戒指/灵符),绝不落主属性槽(W/A)', () => {
    expect(J_COMBAT.length, '应有一整条 J 专属战斗词缀线').toBeGreaterThan(0)
    for (const a of J_COMBAT) {
      expect(a.id, 'J 专属战斗词缀应限定 J 槽').not.toBeUndefined()
      expect(a.slots, `${a.id} 的槽位不是 J 三件`).toEqual(['necklace', 'ring', 'talisman'])
      // 用的是既有战斗键(闪避/吸血),不是新增键 —— dataIntegrity 不许无源键
      expect(['dodgeRate', 'lifesteal']).toContain(a.key)
    }
  })

  it('数值有限且逐档递增(品质阶梯:下一档上下限都不弱于上一档)', () => {
    const byKey: Record<string, AffixDef[]> = {}
    for (const a of J_COMBAT) {
      ;(byKey[a.key] ??= []).push(a)
    }
    for (const list of Object.values(byKey)) {
      const sorted = [...list].sort((x, y) => (x.minRank ?? 0) - (y.minRank ?? 0))
      for (const a of sorted) {
        expect(a.min, `${a.id} 下限应为正`).toBeGreaterThan(0)
        expect(a.max, `${a.id} 上限应高于下限`).toBeGreaterThan(a.min)
      }
      for (let i = 1; i < sorted.length; i += 1) {
        expect(sorted[i]!.min, `${sorted[i]!.id} 下限不应回落`).toBeGreaterThanOrEqual(sorted[i - 1]!.max)
      }
    }
  })
})
