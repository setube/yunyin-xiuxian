/**
 * 「灵石 + 器灵尘」差额口径只有一份。
 *
 * 这段算式原先在 reforge.reforgeShortfall 与 affixTransfer.transferShortfall 里各写一遍,
 * 逐字相同。两条路径都拿它决定置灰、价签与拒因:抄两份时若只改一处,
 * 同一种「两样都缺」的场景会在两处给出不同的首选拒因,
 * 而玩家看不出这是两个独立实现,只会觉得「强化说缺灵石、转移却说缺尘」。
 *
 * 现已收进 costShortfall.twoPartShortfall,两个入口转为调用它。
 * 本文件钉两件事:纯函数在各种余额下的行为,以及两个入口给出的结果完全一致。
 */
import { describe, expect, it } from 'vitest'
import { gn, toNum } from '@/utils/gnum'
import { twoPartShortfall } from './costShortfall'

describe('两样差额 · 纯函数本身', () => {
  it('两样都够时 short 为 null,差额为 0', () => {
    const r = twoPartShortfall({ stone: gn(100), dust: 50 }, gn(1000), 500)
    expect(r.short).toBeNull()
    expect(toNum(r.stone)).toBe(0)
    expect(r.dust).toBe(0)
  })

  it('只缺灵石时报灵石,不报尘', () => {
    const r = twoPartShortfall({ stone: gn(1000), dust: 50 }, gn(400), 500)
    expect(r.short, '灵石缺就该报灵石').toBe('stone')
    expect(toNum(r.stone), '差的该是 600').toBeCloseTo(600, 6)
    expect(r.dust, '尘够,差额该是 0').toBe(0)
  })

  it('只缺尘时报尘,不报灵石', () => {
    const r = twoPartShortfall({ stone: gn(100), dust: 500 }, gn(1000), 200)
    expect(r.short, '灵石够、尘缺,该报尘').toBe('dust')
    expect(toNum(r.stone), '灵石够,差额该是 0').toBe(0)
    expect(r.dust, '差的该是 300').toBe(300)
  })

  it('两样都缺时先报灵石', () => {
    const r = twoPartShortfall({ stone: gn(1000), dust: 500 }, gn(0), 0)
    expect(r.short, '两样都缺时首选灵石').toBe('stone')
    expect(toNum(r.stone)).toBeCloseTo(1000, 6)
    expect(r.dust).toBe(500)
  })

  it('恰好够付时不算缺(边界)', () => {
    const r = twoPartShortfall({ stone: gn(100), dust: 50 }, gn(100), 50)
    expect(r.short, '恰好够付该算付得起').toBeNull()
    expect(toNum(r.stone)).toBe(0)
    expect(r.dust).toBe(0)
  })

  it('差额永不为负', () => {
    for (const [bal, dustOwn] of [[0, 0], [1e9, 1e9], [0, 1e9], [1e9, 0]]) {
      const r = twoPartShortfall({ stone: gn(100), dust: 100 }, gn(bal as number), dustOwn as number)
      expect(toNum(r.stone), `余额 ${bal} 时差额为负`).toBeGreaterThanOrEqual(0)
      expect(r.dust, `尘 ${dustOwn} 时差额为负`).toBeGreaterThanOrEqual(0)
    }
  })
})
