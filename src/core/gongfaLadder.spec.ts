/**
 * 主修功法的品阶阶梯。
 *
 * 原先仙品「金阙玉章」预算 3.5,只比精品的厚土功 3.2 高一点;
 * 神品「天关神兵诀」4.2 更是低于天品「混沌一气功」5.3 —— 品阶照旧只是个标签。
 * 与法宝(artifactLadder)、灵兽(petLadder)是同一类缺陷。
 *
 * 只查**主修**:辅修与秘术是功能件,各有各的用途(敛息、点石、剑心通明),
 * 拿预算比大小会把「有用但不涨数值」的东西判成缺陷。
 */
import { describe, expect, it } from 'vitest'
import { GONGFA } from '@/data/gongfa'
import { qualityDef } from '@/data/qualities'
import { budgetOfMods } from './ruleBudget'

/** 满级时的词条总量:基础 + 每级 × 层数 */
function fullBudget(g: (typeof GONGFA)[number]): number {
  return budgetOfMods(g.baseMods) + budgetOfMods(g.perLevelMods) * g.maxLevel
}

interface Band {
  name: string
  rank: number
  lo: number
  mid: number
  hi: number
}

function mainBands(): Band[] {
  const mains = GONGFA.filter(g => g.type === 'main')
  const byRank = new Map<number, number[]>()
  for (const g of mains) {
    const rank = qualityDef(g.quality).rank
    byRank.set(rank, [...(byRank.get(rank) ?? []), fullBudget(g)])
  }
  return [...byRank.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rank, raw]) => {
      const list = [...raw].sort((a, b) => a - b)
      return {
        name: qualityDef(mains.find(g => qualityDef(g.quality).rank === rank)!.quality).name,
        rank,
        lo: list[0]!,
        mid: list[Math.floor(list.length / 2)]!,
        hi: list[list.length - 1]!
      }
    })
}

describe('主修功法品阶阶梯 · 品阶要能预测份量', () => {
  it('打印各品阶的满级预算区间(给人复核)', () => {
    console.log('\n—— 主修功法满级预算 ——')
    for (const b of mainBands()) console.log(`  ${b.name}(rank ${b.rank}): ${b.lo.toFixed(2)} ~ ${b.mid.toFixed(2)} ~ ${b.hi.toFixed(2)}`)
    expect(GONGFA.filter(g => g.type === 'main').length).toBeGreaterThan(20)
  })

  /**
   * 判据是**中位数**递增、且下沿不低于上一档的中位数 —— 不是「区间不相交」。
   *
   * 主修功法各有侧重(有的叠攻、有的叠气血、有的侧重修炼),同一品阶内本就有宽窄。
   * 要求区间完全不相交会把设计空间压成一根线,那是拿平衡换整齐。
   * 「档位中位更高、且没有哪一件明显掉到上一档的中间以下」才是玩家能感知的分量差。
   */
  it('品阶越高,中位数越高,且下沿不低于上一档的中位数', () => {
    const list = mainBands()
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1]!
      const cur = list[i]!
      expect(cur.mid, `${cur.name} 的中位数 ${cur.mid.toFixed(2)} 不高于 ${prev.name} 的 ${prev.mid.toFixed(2)}`).toBeGreaterThan(
        prev.mid
      )
      expect(
        cur.lo,
        `${cur.name} 的下沿 ${cur.lo.toFixed(2)} 低于 ${prev.name} 的中位数 ${prev.mid.toFixed(2)} —— ` +
          `这一件掉到浅一档的中间以下,品阶就不可信了`
      ).toBeGreaterThanOrEqual(prev.mid)
    }
  })

  /**
   * 仙品与神品是「更深的境界里才有」的功法,须确实压过人间界的天品:
   * 否则玩家冲到大境界换来的是一部更弱的功法。
   */
  it('仙界及以上的主修,下沿不低于人间界最顶那档的上沿', () => {
    const mortal = GONGFA.filter(g => g.type === 'main' && qualityDef(g.quality).rank <= 4)
    const topMortal = Math.max(...mortal.map(fullBudget))
    const high = GONGFA.filter(g => g.type === 'main' && qualityDef(g.quality).rank >= 6)
    expect(high.length, '判据失去对象').toBeGreaterThan(0)
    const weak = high.filter(g => fullBudget(g) < topMortal).map(g => `${g.name}(${fullBudget(g).toFixed(1)} < ${topMortal.toFixed(1)})`)
    expect(weak, `这些高界主修不如人间界顶配:\n${weak.join('\n')}`).toEqual([])
  })

  it('仍在单件内容预算上限内(主修满级可高于法宝,但不能失控)', () => {
    for (const g of GONGFA.filter(x => x.type === 'main')) {
      // 满级词条总量上限:法宝/天赋按单件 5 计,主修随境界成长,放宽到 9
      expect(fullBudget(g), `${g.name} 满级预算 ${fullBudget(g).toFixed(1)} 过高`).toBeLessThanOrEqual(9)
    }
  })
})
