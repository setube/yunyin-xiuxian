/**
 * 后期限量「灵石 → 悟道点」兑换(Phase C-1)
 *
 * 后期(realm≥18)灵石过剩,给一个可控、限量的出口换悟道点(功法进修/法宝炼化的真货币)。
 * 判据四连:
 *   一 境界不到不开(锁定,连灵石也不碰);
 *   二 每次扣灵石、给悟道点(原子:灵石不足拒不扣不进);
 *   三 每游戏日限次(达上限当日拒兑);
 *   四 坏档计数被 sanitize 夹回,不留下"今天白送 / 永不可兑"。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useGameStore } from '@/stores/game'
import { gn, toNum } from '@/utils/gnum'
import {
  WUDAO_EXCHANGE_MIN_MAJOR, WUDAO_EXCHANGE_PER_DAY, WUDAO_EXCHANGE_GAIN, WUDAO_EXCHANGE_PRICE_BASE
} from '@/data/constants'
import type { LinggenProfile } from '@/types'

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
    res.spiritStone = gn(WUDAO_EXCHANGE_PRICE_BASE)
    expect(player.exchangeStoneForWudao()).toBe(true)
    expect(res.wudao).toBe(WUDAO_EXCHANGE_GAIN)
    expect(toNum(res.spiritStone)).toBe(0)
  })

  it('灵石不足:原子拒绝 —— 不扣灵石也不进悟道点(余额原样)', () => {
    const player = usePlayerStore()
    const res = useResourcesStore()
    player.initCharacter('测试', linggen())
    player.major = WUDAO_EXCHANGE_MIN_MAJOR
    res.spiritStone = gn(WUDAO_EXCHANGE_PRICE_BASE - 1)
    expect(player.exchangeStoneForWudao()).toBe(false)
    expect(res.wudao).toBe(0)
    // 部分扣款也不发生:余额保持原样
    expect(toNum(res.spiritStone)).toBe(WUDAO_EXCHANGE_PRICE_BASE - 1)
  })

  it('每游戏日限次:兑满当日拒兑;次日(另一天)计数自动归零可再兑', () => {
    const player = usePlayerStore()
    const res = useResourcesStore()
    const game = useGameStore()
    game.$patch({ totalPlaySec: 0 })
    player.initCharacter('测试', linggen())
    player.major = WUDAO_EXCHANGE_MIN_MAJOR
    res.spiritStone = gn(WUDAO_EXCHANGE_PRICE_BASE * 100)
    for (let i = 0; i < WUDAO_EXCHANGE_PER_DAY; i += 1) {
      expect(player.exchangeStoneForWudao(), `第 ${i + 1} 次应在限内`).toBe(true)
    }
    expect(player.exchangeStoneForWudao(), '第上限+1 次应被拒(当日已兑满)').toBe(false)
    expect(player.wudaoExchangeToday).toBe(WUDAO_EXCHANGE_PER_DAY)
    // 次日:counter 的 gameDay 不是今天,从 0 重算 → 当日次数归零,真的能再兑
    game.$patch({ totalPlaySec: 1 * 86400 })
    expect(player.canExchangeWudao).toBe(true)
    expect(player.wudaoExchangeToday).toBe(0)
    res.spiritStone = gn(WUDAO_EXCHANGE_PRICE_BASE)
    expect(player.exchangeStoneForWudao()).toBe(true)
    expect(player.wudaoExchangeToday).toBe(1)
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
