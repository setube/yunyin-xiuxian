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
import { IMMORTAL_RANK, PETS, genericPetPool } from '@/data/pets'
import { QUALITIES, qualityDef } from '@/data/qualities'
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

  /**
   * 不许有两只灵兽的词条组合完全相同 —— 同形即是同一只,只是贵一些。
   *
   * 241 轮实测:螭龙幼子(天品)与应龙(仙品)都是 attackPct+maxHpPct+cultivationSpeed,
   * 连 personality 都是 fierce,应龙只是把三项各放大 1.5 倍。
   * 上面那条「同品阶内预算各不相同」查的是同一 rank,跨品阶正好落在盲区。
   *
   * 故障注入:把螭龙幼子改回 attackPct+maxHpPct+cultivationSpeed,本条红。
   */
  it('没有两只灵兽的词条组合完全相同', () => {
    const seen = new Map<string, string[]>()
    for (const p of PETS) {
      const key = Object.keys(p.mods).sort().join('+')
      seen.set(key, [...(seen.get(key) ?? []), `${p.name}(${p.quality})`])
    }
    const dupes = [...seen.entries()].filter(([, names]) => names.length > 1)
      .map(([key, names]) => `${key}: ${names.join(' / ')}`)
    expect(dupes, `词条组合完全相同的灵兽(后一只只是前一只放大一点):\n${dupes.join('\n')}`).toEqual([])
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

  /**
   * 品阶档位不许有空格。
   *
   * 九档品阶里灵兽曾只占七档 —— 玄品(1.8~1.9)之后直接跳到天品(2.2~2.6),
   * **地品这一档一直是空的**:玩家在玄品与天品之间刷上几十程,以为是自己运气不好。
   * 这不是平衡问题,是内容缺一档 —— 品阶阶梯既然按档给了预算区间,档就该有人站。
   *
   * 判据:凡「相邻两档之间夹着一整档」的位置,都要有人站上去。
   * 只查灵兽自己用到的最高档以下 —— 地品以上的仙/神两档另有获取路径(指名事件),
   * 不在此列,由 contentGateAudit 钉着。
   *
   * 故障注入:删掉 pet_panshi 与 pet_shigu,本条报出空着的地品档。
   */
  it('品阶档位不许留空档 —— 空档会让玩家以为是自己运气不好', () => {
    const ranks = new Set(PETS.map(p => qualityDef(p.quality).rank))
    const gaps: string[] = []
    // 只看从最低到最高之间:跨过一整档没人站,就是内容缺一档
    const lo = Math.min(...ranks)
    const hi = Math.max(...ranks)
    for (let r = lo; r <= hi; r += 1) {
      if (!ranks.has(r)) gaps.push(`rank ${r}(${QUALITIES.find(q => q.rank === r)?.name ?? '?'})`)
    }
    expect(gaps, `这些品阶档位一只灵兽都没有:\n${gaps.join('\n')}`).toEqual([])
  })

  /**
   * 新兽要真的能到手 —— 死内容比没有内容更糟(图鉴里一直挂着一条收不到的条目)。
   * 泛型事件池是入门灵兽的唯一发放口(见 data/pets.genericPetPool),
   * 仙品及以上才走指名事件。故地品及以下必须都在池里。
   * 故障注入:把一只地品改成 immortal,本条红。
   */
  it('地品及以下都在泛型事件池里,能真的抽到', () => {
    const pool = new Set(genericPetPool(new Set()).map(p => p.id))
    for (const p of PETS) {
      if (qualityDef(p.quality).rank >= IMMORTAL_RANK) continue
      expect(pool.has(p.id), `${p.name} 不在泛型池里 —— 图鉴挂着却收不到`).toBe(true)
    }
  })
})
