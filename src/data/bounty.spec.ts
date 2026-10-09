/**
 * 坊市悬赏板 —— 数据不变量
 */
import { describe, expect, it } from 'vitest'
import { toNum } from '@/utils/gnum'
import { BOUNTY_SLOTS, BOUNTY_MAT_TARGET } from '@/data/bounty'
import { bountyRemainingSec, equipBountyReward, generateBounty, herbBountyReward } from '@/core/bountyService'

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

  it('募材价都给得出正数(募草按所交品计价:生成时占位、交货现算),募丹价 > 售出倍率,未交货未盖戳', () => {
    const board = generateBounty(3, 1)
    // 募草 reward 生成时为占位 0 —— 交货按**所交之品**现算(任意品可交),故订单不预定价
    expect(toNum(board[0]!.reward)).toBe(0)
    // 真正担纲的是 herbBountyReward:凡品即给得出正数,高品更高
    expect(toNum(herbBountyReward(1, BOUNTY_MAT_TARGET))).toBeGreaterThan(0)
    expect(toNum(herbBountyReward(5, BOUNTY_MAT_TARGET))).toBeGreaterThan(toNum(herbBountyReward(1, BOUNTY_MAT_TARGET)))
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
