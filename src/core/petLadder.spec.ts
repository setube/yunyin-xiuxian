/**
 * 灵兽品阶阶梯:品阶必须能预测强度。
 *
 * 原先玄品(御雷猴 0.6 / 摇光鹿 0.7)整体弱于灵品(月影狸 1.0),
 * 神品白泽 1.5 也低于仙品应龙 1.6 —— 玩家看到「玄品」二字反而拿到更弱的东西。
 * 与法宝那次(见 core/artifactLadder)是同一类缺陷:品阶只是个标签,没落在数值上。
 *
 * 本条按「预算区间」判,不按单件:同品阶内各兽保留自己的特色(有的偏历练、有的偏战斗),
 * 但**不同品阶的区间不许重叠** —— 区间一重叠,品阶就不再可预测。
 */
import { describe, expect, it } from 'vitest'
import { PETS } from '@/data/pets'
import { qualityDef } from '@/data/qualities'
import { budgetOfMods } from './ruleBudget'

interface Band {
  name: string
  rank: number
  lo: number
  hi: number
}

/** 每个现世品阶的预算区间 */
function bands(): Band[] {
  const byRank = new Map<number, number[]>()
  for (const p of PETS) {
    const rank = qualityDef(p.quality).rank
    byRank.set(rank, [...(byRank.get(rank) ?? []), budgetOfMods(p.mods)])
  }
  return [...byRank.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rank, list]) => ({
      name: qualityDef(PETS.find(p => qualityDef(p.quality).rank === rank)!.quality).name,
      rank,
      lo: Math.min(...list),
      hi: Math.max(...list)
    }))
}

describe('灵兽品阶阶梯 · 品阶要能预测强度', () => {
  it('打印各品阶的预算区间(给人复核) ', () => {
    console.log('\n—— 灵兽预算区间 ——')
    for (const b of bands()) console.log(`  ${b.name}(rank ${b.rank}): ${b.lo.toFixed(2)} ~ ${b.hi.toFixed(2)}`)
    expect(PETS.length).toBeGreaterThan(10)
  })

  it('品阶越高,预算区间整体越高,且相邻两档不重叠', () => {
    const list = bands()
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1]!
      const cur = list[i]!
      expect(
        cur.lo,
        `${cur.name} 的下沿 ${cur.lo.toFixed(2)} 低于 ${prev.name} 的上沿 ${prev.hi.toFixed(2)} —— ` +
          `区间一重叠,玩家看到品阶也猜不出强弱`
      ).toBeGreaterThanOrEqual(prev.hi)
    }
  })

  it('同一品阶内各不相同 —— 同档的几只靠方向分工,不靠数值高低', () => {
    const dupes: string[] = []
    for (const b of bands()) {
      const inBand = PETS.filter(p => qualityDef(p.quality).rank === b.rank)
      const seen = new Map<string, string[]>()
      for (const p of inBand) {
        const key = budgetOfMods(p.mods).toFixed(4)
        seen.set(key, [...(seen.get(key) ?? []), p.name])
      }
      for (const [v, names] of seen) {
        if (names.length > 1) dupes.push(`${b.name} ${v}: ${names.join(' / ')}`)
      }
    }
    expect(dupes, `同品阶预算完全相同(等于同一只):\n${dupes.join('\n')}`).toEqual([])
  })

  it('每只灵兽至少两条词条 —— 单条只是数值,两条才成方向', () => {
    for (const p of PETS) {
      expect(Object.keys(p.mods).length, `${p.name} 只有一条词条`).toBeGreaterThanOrEqual(2)
    }
  })

  it('仍在单件内容预算上限之内(与法宝/天赋同一把尺)', () => {
    for (const p of PETS) {
      expect(budgetOfMods(p.mods), `${p.name} 超预算`).toBeLessThan(5)
    }
  })
})
