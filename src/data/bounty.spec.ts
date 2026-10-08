/**
 * 坊市悬赏板 —— 数据不变量
 */
import { describe, expect, it } from 'vitest'
import { toNum } from '@/utils/gnum'
import { BOUNTY_SLOTS, BOUNTY_MAT_TARGET, BOUNTY_MAT_UNIT_AMOUNT } from '@/data/bounty'
import { MARKET_MAT_STONE_UNITS } from '@/data/market'
import { herbBuyPrice, herbGradeOfMajor } from '@/data/herbGrades'
import { bountyRemainingSec, equipBountyReward, generateBounty } from '@/core/bountyService'

describe('悬赏板 · 订单生成与定价', () => {
  it('一版四类各一:募草/募铁/募丹/贡器,货与栏位齐全', () => {
    const board = generateBounty(5, 1_700_000_000_000)
    expect(board).toHaveLength(BOUNTY_SLOTS)
    expect(new Set(board.map(b => b.kind)).size).toBe(BOUNTY_SLOTS)
    expect(board[0]!.kind).toBe('herb')
    expect(board[1]!.kind).toBe('ore')
    expect(board[2]!.kind).toBe('pill')
    expect(board[3]!.kind).toBe('equip')
    expect(board[3]!.tier, '贡器门槛该是当前境界').toBe(5)
  })

  it('募材价都给得出正数(募草按品计价),募丹价 > 售出倍率,未交货未盖戳', () => {
    const board = generateBounty(3, 1)
    // 募草按品标价:3 境 = 凡品,每株 = 锚价 ×(悬赏档 4.5 / 购入档 6)
    const expectedHerb = herbBuyPrice(herbGradeOfMajor(3)) * (BOUNTY_MAT_UNIT_AMOUNT / MARKET_MAT_STONE_UNITS) * BOUNTY_MAT_TARGET
    expect(toNum(board[0]!.reward)).toBeCloseTo(expectedHerb, 5)
    expect(toNum(board[0]!.reward)).toBeGreaterThan(0)
    expect(toNum(board[1]!.reward), '募铁按阶计价,仍给得出正数').toBeGreaterThan(0)
    expect(board[2]!.kindId).toBeTruthy()
    expect(toNum(board[2]!.reward)).toBeGreaterThan(0)
    const pill = board[2]!
    expect(pill.extra, '募丹附悟道').toBeGreaterThan(0)
    for (const b of board) expect(b.claimed).toBe(false)
  })

  it('贡器奖励随品质档只升不降', () => {
    const lo = equipBountyReward(4, 1)
    const hi = equipBountyReward(4, 5)
    expect(toNum(hi.stone)).toBeGreaterThan(toNum(lo.stone))
    expect(hi.dust).toBeGreaterThan(lo.dust)
    expect(lo.dust, '≥ 基础器尘').toBeGreaterThan(0)
  })

  it('换新单倒计时:未到期正数、已过归零', () => {
    expect(bountyRemainingSec(1_700_000_000_000, 1_700_000_000_000 + 1000)).toBeGreaterThan(0)
    expect(bountyRemainingSec(1_700_000_000_000, 3_000_000_000_000)).toBe(0)
  })

  it('募丹每轮换一味 —— 不同刷新窗口给的丹不一样', () => {
    const a = generateBounty(3, 1_700_000_000_000)[2]!.kindId
    const b = generateBounty(3, 1_700_000_000_000 + (14400 * 1000))[2]!.kindId
    expect(a).not.toBe(b)
  })
})
