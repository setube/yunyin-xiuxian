/**
 * 品质权重表与品质表必须同长。
 *
 * qualities.ts 里每一档写的是 `weight: QUALITY_WEIGHTS[rank]` —— 手写索引 0..8。
 * 若新增一档品质而忘了扩 QUALITY_WEIGHTS,那一档的 weight 就是 undefined。
 *
 * 后果比「少一档权重」严重得多,因为它一路静默:
 *   qualityWeightAt → `q.weight * …` = NaN
 *   rng.weighted   → `Math.max(0, NaN)` 仍是 NaN ⇒ total = NaN
 *                    `NaN <= 0` 为 false,兜底 pick 不触发;每轮 `roll -= NaN` 也恒为 NaN
 *                    ⇒ 循环一个都不命中,最后**永远返回数组末元素**
 * 也就是品质抽取会整体塌向最好那一档,而没有任何报错。
 *
 * 此前 lootSim 只钉了 DECOMPOSE_DUST.length === QUALITIES.length,没钉权重表。
 */
import { describe, expect, it } from 'vitest'
import { QUALITIES, isRareQuality } from '@/data/qualities'
import { QUALITY_WEIGHTS } from '@/data/constants'

describe('品质权重表 · 与品质表同长', () => {
  it('权重表长度等于品质档数', () => {
    expect(
      QUALITY_WEIGHTS.length,
      `品质 ${QUALITIES.length} 档,权重表只有 ${QUALITY_WEIGHTS.length} 项 —— 缺的那几档 weight 会是 undefined,抽品质会整体塌向末档`
    ).toBe(QUALITIES.length)
  })

  it('每一档的 weight 都是有限正数(undefined / NaN 都会让抽取塌向末档)', () => {
    for (const q of QUALITIES) {
      expect(typeof q.weight, `${q.name}(rank ${q.rank}) 的 weight 不是数字`).toBe('number')
      expect(Number.isFinite(q.weight), `${q.name}(rank ${q.rank}) 的 weight 是 ${q.weight}`).toBe(true)
      expect(q.weight, `${q.name}(rank ${q.rank}) 的权重非正`).toBeGreaterThan(0)
    }
  })

  it('权重随品质单调递减(越好的越罕见)', () => {
    for (let i = 1; i < QUALITIES.length; i += 1) {
      expect(QUALITIES[i]!.weight, `${QUALITIES[i]!.name} 的权重不低于前一档`).toBeLessThan(QUALITIES[i - 1]!.weight)
    }
  })

  it('rank 与数组下标一致(下标即权重索引,错位就会配错权重)', () => {
    QUALITIES.forEach((q, i) => {
      expect(q.rank, `${q.name} 的 rank 是 ${q.rank},但在数组第 ${i} 位`).toBe(i)
    })
  })

  it('没有两档用同一个权重(同权会让高品与低品一样常见)', () => {
    const w = QUALITIES.map(q => q.weight)
    expect(new Set(w).size, '有两档品质权重相同').toBe(w.length)
  })
})

/**
 * 两个 `isRareQuality` 分居两处,阈值不同 —— 这条钉住各自的语义,免得谁改错。
 *
 *   data/qualities  : rank >= 3(灵品起),掉落与气运加成用
 *   ui/qualityTier  : rank >= 6(天品起),盖品阶角章用
 *
 * 同名不同阈值本身是隐患:import 错一行不会报错,只会静默按另一条线判。
 * 两处各自的门槛都在,这里补的是「数据侧那一条」—— 此前它一条判据都没有。
 */
describe('品质 · 数据侧的稀有线(与角章那条分开)', () => {
  it('灵品起算稀有:凡品/良品/精品不算,灵品及以上算', () => {
    const rare = QUALITIES.filter(q => isRareQuality(q)).map(q => q.id)
    expect(rare, '数据侧的稀有线该从灵品起').toEqual([
      'spirit', 'profound', 'earth', 'heaven', 'immortal', 'divine'
    ])
  })

  it('与 ui/qualityTier 的角章线不是同一条', () => {
    // 角章那条从 rank 6 起(天/仙/神);若两处被改成同一条,这里变红
    const dataRare = QUALITIES.filter(q => isRareQuality(q))
    expect(dataRare.length, '两条稀有线不该重合').toBeGreaterThan(3)
  })
})
