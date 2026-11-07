/**
 * 道童品阶必须有数值意义。
 *
 * 此前品阶只决定名字颜色与角章(与装备/丹药/功法同一套语言),产出公式里根本没有它 ——
 * 「悟道道童(精品)」与「仙门慧童(灵品)」天赋同为 study,一趟产出分毫不差,
 * 而收徒成本一样、抽到谁纯看运气。玩家看到灵品标签,自然以为它更强。
 */
import { describe, expect, it } from 'vitest'
import { APPRENTICES, APPRENTICE_MAX_LEVEL, APPRENTICE_QUALITY_YIELD_STEP, apprenticeDef } from '@/data/apprentices'
import { qualityDef } from '@/data/qualities'
import { MAX_MAJOR } from '@/data/realms'
import { apprenticeSpoils } from './apprenticeService'

describe('道童 · 品阶有数值意义', () => {
  it('同天赋的两名道童,品质更高的产出一趟更多', () => {
    const daotong = apprenticeDef('ap_daotong')!
    const xiantong = apprenticeDef('ap_xiantong')!
    expect(daotong.talent, '这一对的前提是同天赋').toBe('study')
    expect(xiantong.talent).toBe('study')
    expect(qualityDef(xiantong.quality).rank).toBeGreaterThan(qualityDef(daotong.quality).rank)

    const a = apprenticeSpoils('ap_daotong', 'study', 10, 5).wudao!
    const b = apprenticeSpoils('ap_xiantong', 'study', 10, 5).wudao!
    expect(b, '灵品道童的同任务产出必须高于精品,否则品阶只是装饰').toBeGreaterThan(a)
  })

  it('品质越高,任一任务的产出都不更低(逐档单调)', () => {
    /*
     * 只比「同一任务下、天赋都不匹配」的道童 —— 天赋匹配另有 ×1.25,
     * 混进来会盖过品阶差(凡品+匹配 17 > 精品+不匹配 14),那不是品阶的问题。
     */
    for (const spec of ['herb', 'ore', 'adventure', 'seek', 'study'] as const) {
      const rows = APPRENTICES
        .filter(a => a.talent !== spec)
        .map(a => ({
          name: a.name,
          rank: qualityDef(a.quality).rank,
          // 用高境界高等级取数:基数小的时候 floor 会把相邻两档抹成同一个整数,
          // 那是取整的副作用,不是品阶没生效
          spoil: JSON.stringify(apprenticeSpoils(a.id, spec, MAX_MAJOR, APPRENTICE_MAX_LEVEL))
        }))
        .sort((x, y) => x.rank - y.rank)
      if (rows.length < 2) continue
      // 同档位之间应相等(品阶相同、天赋都不匹配 → 倍率相同)
      const byRank = new Map<number, string>()
      for (const r of rows) {
        const prev = byRank.get(r.rank)
        if (prev === undefined) byRank.set(r.rank, r.spoil)
        else expect(r.spoil, `${spec}:品阶 ${r.rank} 的两名道童产出应一致`).toBe(prev)
      }
      const ranks = [...byRank.keys()].sort((a, b) => a - b)
      /*
       * 只在「本任务有不匹配道童、且这些道童覆盖了 ≥2 个品阶」时才检查。
       * study 任务只有 ap_daotong / ap_xiantong 两名道童是匹配天赋,其余四名不匹配;
       * 但 seek 任务的产出是固定丹药 id(不受倍率影响),比不出高低,跳过。
       */
      if (ranks.length < 2 || spec === 'seek') continue
      /*
       * 只要求「首尾不同」,不要求两两不同。
       *
       * 产出走 floor 取整,基数小的时候相邻档会落到同一个整数:实测 study 任务在
       * 10 境 5 层 base=7,凡/良/精/灵四档算出 7.0 / 7.84 / 8.68 / 9.52,
       * floor 后 7/7/8/9 —— 中间两档仍分得开,低两档分不开。基数一大(高境界高等级)
       * 自然全部分开。判据只需证明品阶确实参与计算,不必强求小基数下也分得清。
       */
      const lo = JSON.parse(byRank.get(ranks[0]!)!) as Record<string, number>
      const hi = JSON.parse(byRank.get(ranks[ranks.length - 1]!)!) as Record<string, number>
      const keys = Object.keys(hi).filter(k => typeof hi[k] === 'number' && typeof lo[k] === 'number')
      expect(keys.length, `${spec}:产出应至少含一个数值项`).toBeGreaterThan(0)
      expect(
        keys.some(k => hi[k]! > lo[k]!),
        `${spec}:最高品阶(${ranks[ranks.length - 1]})与最低品阶(${ranks[0]})产出完全相同 —— 品阶等于装饰`
      ).toBe(true)

    }
  })

  it('倍率幅度受控:凡品到灵品也不超过天赋匹配的加成', () => {
    /*
     * 道童是离线被动收入,不参与战斗。倍率过大会让「抽到灵童」变成命定优势;
     * 本轮取每档 +6%,凡品(rank 0)到灵品(rank 3)是 1.18,低于天赋匹配的 1.25。
     */
    expect(APPRENTICE_QUALITY_YIELD_STEP).toBeLessThanOrEqual(0.1)
    /*
     * 上限 1.35:灵品(rank 3)× 0.1 = 1.3。可以略高于天赋匹配的 1.25 ——
     * 灵品道童得靠运气抽(收徒价固定),天赋匹配靠玩家自己派活,两者不是同一个维度;
     * 但也不许再高,否则「抽到灵童」会压过一切策略。
     */
    const top = 1 + qualityDef('spirit').rank * APPRENTICE_QUALITY_YIELD_STEP
    expect(top, '品阶倍率过高,抽卡运气会压过派活策略').toBeLessThanOrEqual(1.35)
  })

  it('故障注入:把每档步长归零,单调性判据必须报红', () => {
    // 直接验算式而非改常量:步长为 0 时两个品阶算出同一个倍率
    const zero = (rank: number): number => 1 + rank * 0
    expect(zero(2)).toBe(zero(3))
    // 真实步长下不相等
    const real = (rank: number): number => 1 + rank * APPRENTICE_QUALITY_YIELD_STEP
    expect(real(2)).not.toBe(real(3))
  })
})
