/**
 * 后期限量「灵石 → 悟道点」兑换。
 * 判据:境界不到锁定(不碰灵石);灵石不足原子拒绝;每游戏日限次;坏档计数由 sanitize 夹回。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useGameStore } from '@/stores/game'
import { gn, sub, toNum } from '@/utils/gnum'
import {
  WUDAO_EXCHANGE_MIN_MAJOR, WUDAO_EXCHANGE_PER_DAY, WUDAO_EXCHANGE_GAIN, WUDAO_EXCHANGE_TIER_AMOUNT
} from '@/data/constants'
import type { LinggenProfile } from '@/types'
import { wudaoExchangeCost, wudaoExchangeState } from './wudaoExchange'
import { stoneByTier } from './formulas'
import { maxTierForMajor } from '@/data/regions'
import { STONE_AMT_PER_BATTLE } from './pillValue'
import { winsPerHour } from './expIncome'
import { formatGN } from '@/utils/format'

/** 测试用兑换价:按测试所设境界现算,不手抄数字 */
const PRICE = (major: number) => toNum(wudaoExchangeCost(major))

beforeEach(() => {
  setActivePinia(createPinia())
})

function linggen(): LinggenProfile {
  return { roots: [{ element: 'fire', aptitude: 60 }, { element: 'water', aptitude: 40 }], growthMult: 1 } as unknown as LinggenProfile
}

describe('后期限量灵石→悟道兑换(Phase C-1)', () => {
  it('境界未到(WUDAO_EXCHANGE_MIN_MAJOR 前):兑换锁定,灵石分文不动', () => {
    const player = usePlayerStore()
    const res = useResourcesStore()
    player.initCharacter('测试', linggen())
    player.major = WUDAO_EXCHANGE_MIN_MAJOR - 1
    res.spiritStone = gn(999_999)
    expect(player.exchangeStoneForWudao()).toBe(false)
    expect(toNum(res.spiritStone)).toBe(999_999)
    expect(res.wudao).toBe(0)
  })

  it('境界到了:每次扣灵石、加悟道点', () => {
    const player = usePlayerStore()
    const res = useResourcesStore()
    const game = useGameStore()
    game.$patch({ totalPlaySec: 3 * 86400 })
    player.initCharacter('测试', linggen())
    player.major = WUDAO_EXCHANGE_MIN_MAJOR
    res.spiritStone = gn(PRICE(WUDAO_EXCHANGE_MIN_MAJOR))
    expect(player.exchangeStoneForWudao()).toBe(true)
    expect(res.wudao).toBe(WUDAO_EXCHANGE_GAIN)
    expect(toNum(res.spiritStone)).toBe(0)
  })

  it('灵石不足:原子拒绝 —— 不扣灵石也不进悟道点(余额原样)', () => {
    const player = usePlayerStore()
    const res = useResourcesStore()
    player.initCharacter('测试', linggen())
    player.major = WUDAO_EXCHANGE_MIN_MAJOR
    res.spiritStone = gn(PRICE(WUDAO_EXCHANGE_MIN_MAJOR) - 1)
    expect(player.exchangeStoneForWudao()).toBe(false)
    expect(res.wudao).toBe(0)
    expect(toNum(res.spiritStone)).toBe(PRICE(WUDAO_EXCHANGE_MIN_MAJOR) - 1)
    expect(player.canExchangeWudao, '付不起灵石时按钮不该亮').toBe(false)
    // 价位已是大数(混沌海一次数十亿),绝对差额在 GNum 归一后只保相对精度
    expect(toNum(player.wudaoExchangeState.stoneShort) / PRICE(WUDAO_EXCHANGE_MIN_MAJOR)).toBeCloseTo(1 / PRICE(WUDAO_EXCHANGE_MIN_MAJOR), 6)
  })

  it('兑换判据把境界、当日限额与灵石余额分开报', () => {
    expect(wudaoExchangeState(WUDAO_EXCHANGE_MIN_MAJOR - 1, 0, gn(0))).toMatchObject({
      lockedByRealm: true,
      dailyFull: false,
      canExchange: false
    })
    expect(wudaoExchangeState(WUDAO_EXCHANGE_MIN_MAJOR, WUDAO_EXCHANGE_PER_DAY, gn(999))).toMatchObject({
      lockedByRealm: false,
      dailyFull: true,
      canExchange: false
    })
    expect(wudaoExchangeState(WUDAO_EXCHANGE_MIN_MAJOR, 0, gn(PRICE(WUDAO_EXCHANGE_MIN_MAJOR) - 7))).toMatchObject({
      lockedByRealm: false,
      dailyFull: false,
      canExchange: false
    })
    expect(wudaoExchangeState(WUDAO_EXCHANGE_MIN_MAJOR, 0, gn(PRICE(WUDAO_EXCHANGE_MIN_MAJOR))).canExchange).toBe(true)
  })

  it('每游戏日限次:兑满当日拒兑;次日(另一天)计数自动归零可再兑', () => {
    const player = usePlayerStore()
    const res = useResourcesStore()
    const game = useGameStore()
    game.$patch({ totalPlaySec: 0 })
    player.initCharacter('测试', linggen())
    player.major = WUDAO_EXCHANGE_MIN_MAJOR
    res.spiritStone = gn(PRICE(WUDAO_EXCHANGE_MIN_MAJOR) * 100)
    for (let i = 0; i < WUDAO_EXCHANGE_PER_DAY; i += 1) {
      expect(player.exchangeStoneForWudao(), `第 ${i + 1} 次应在限内`).toBe(true)
    }
    expect(player.exchangeStoneForWudao(), '第上限+1 次应被拒(当日已兑满)').toBe(false)
    expect(player.wudaoExchangeToday).toBe(WUDAO_EXCHANGE_PER_DAY)
    // 次日:gameDay 不是今天,计数从 0 重算
    game.$patch({ totalPlaySec: 1 * 86400 })
    expect(player.canExchangeWudao).toBe(true)
    expect(player.wudaoExchangeToday).toBe(0)
    res.spiritStone = gn(PRICE(WUDAO_EXCHANGE_MIN_MAJOR))
    expect(player.exchangeStoneForWudao()).toBe(true)
    expect(player.wudaoExchangeToday).toBe(1)
  })

  /**
   * 价位须骑层级:混沌海一战胜就几十亿灵石。写死绝对值(旧口径 3000 石)时,
   * 一次兑换只值该境一战收益的百万分之一,整条限量出口形同白送。
   * 故障注入:把 wudaoExchangeCost 改回 stoneByTier(tier, 固定小数) → 本条红。
   */
  it('兑换价随境界层级走:十次上限约合该境一小时的灵石收入,而非固定数字', () => {
    for (const major of [WUDAO_EXCHANGE_MIN_MAJOR, WUDAO_EXCHANGE_MIN_MAJOR + 1, 20]) {
      const tier = maxTierForMajor(major)
      const cost = toNum(wudaoExchangeCost(major))
      const perWin = toNum(stoneByTier(tier, STONE_AMT_PER_BATTLE))
      const perHour = perWin * winsPerHour()
      // 调价只让「日上限总价」落在同一数量级的一小时收入内,不要求精确相等
      const dailyRatio = (cost * WUDAO_EXCHANGE_PER_DAY) / perHour
      expect(dailyRatio, `major ${major}: 日上限总价 ${formatGN(cost * WUDAO_EXCHANGE_PER_DAY)} 与一小时收入 ${formatGN(perHour)} 差了 ${dailyRatio.toFixed(3)} 倍`)
        .toBeGreaterThan(0.2)
      expect(dailyRatio, `major ${major}: 兑换太贵,十次要花掉 ${dailyRatio.toFixed(1)} 小时收入`).toBeLessThan(5)
      // 也不能低到一战就换得起十次
      expect(cost, `major ${major}: 一次兑换比一战收益还便宜`).toBeGreaterThan(perWin * 0.5)
    }
    expect(WUDAO_EXCHANGE_TIER_AMOUNT, '价位常量应写成层级单位,交给 stoneByTier 折算').toBeGreaterThan(0)
    // 高境必须比低境贵:沿层级曲线涨
    expect(toNum(wudaoExchangeCost(20)), '高境兑换价不随层级涨').toBeGreaterThan(toNum(wudaoExchangeCost(WUDAO_EXCHANGE_MIN_MAJOR)))
  })

  it('界面报价与实际扣费同源:state.cost 就是扣掉的那一份', () => {
    const player = usePlayerStore()
    const res = useResourcesStore()
    player.initCharacter('测试', linggen())
    player.major = 20
    // 先把余额垫到兑换价之上:initCharacter 的初始灵石未必够混沌海的价
    const cost = player.wudaoExchangeState.cost
    res.spiritStone = cost
    const before = res.spiritStone
    expect(player.exchangeStoneForWudao()).toBe(true)
    // 用 GNum 减法对账:两边都是大数,转 number 比会吃掉尾差
    expect(toNum(sub(before, res.spiritStone)), '实扣与报价不一致').toBeCloseTo(toNum(cost), -3)
  })

  it('坏档 count 越界:sanitize 夹回上限,不留下"永不可兑"', () => {
    const player = usePlayerStore()
    player.initCharacter('测试', linggen())
    player.wudaoExchange = { gameDay: 3, count: 999 }
    player.sanitize()
    expect(player.wudaoExchange.count).toBe(WUDAO_EXCHANGE_PER_DAY)
    player.wudaoExchange = { gameDay: 3, count: Number.NaN } as never
    player.sanitize()
    expect(player.wudaoExchange.count).toBe(0)
  })
})
