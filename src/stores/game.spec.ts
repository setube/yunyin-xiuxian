/**
 * 建号「逆天改命」额度(修复:额度只存在组件 ref 里,刷新页面即可无限重掷)
 *
 * 额度和当前那副牌都必须落在 game store 上,两者缺一不可:
 *   只持久化额度 → 刷新后 CreateView 重新 rollLinggen,等于白拿一次重掷
 *   只持久化牌面 → 刷新后额度回满,照样能刷
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { rollLinggen } from '@/core/linggenGen'
import { confirmReincarnation, prepareReincarnation } from '@/core/reincarnation'
import { RandomService, mulberry32 } from '@/utils/random'
import { CREATE_REROLL_LIMIT } from '@/data/constants'

/** 复刻 CreateView 的 setup:有草稿就沿用,没有才开掷 */
function enterCreateView(rng: RandomService): void {
  const game = useGameStore()
  if (!game.createProfile) game.setCreateProfile(rollLinggen(rng))
}

describe('建号重掷额度', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('额度记在 store 上,重进建号页不会回满', () => {
    const rng = new RandomService(mulberry32(20260902))
    const game = useGameStore()
    enterCreateView(rng)

    expect(game.createRerolls).toBe(CREATE_REROLL_LIMIT)
    for (let i = 0; i < 3; i += 1) {
      expect(game.spendCreateReroll()).toBe(true)
      game.setCreateProfile(rollLinggen(rng))
    }
    expect(game.createRerolls).toBe(CREATE_REROLL_LIMIT - 3)

    // 「刷新页面」= 组件重建、store 状态由存档还原
    enterCreateView(rng)
    expect(game.createRerolls, '重进建号页把额度洗回满了').toBe(CREATE_REROLL_LIMIT - 3)
  })

  it('刷新不等于免费重掷:已有草稿时不重新开牌', () => {
    const rng = new RandomService(mulberry32(7))
    const game = useGameStore()
    enterCreateView(rng)
    const drafted = game.createProfile

    enterCreateView(rng)
    expect(game.createProfile, '重进建号页换了一副牌,相当于白拿一次重掷').toBe(drafted)
  })

  it('额度耗尽后不可透支,牌面停在最后一次的结果', () => {
    const rng = new RandomService(mulberry32(99))
    const game = useGameStore()
    enterCreateView(rng)
    for (let i = 0; i < CREATE_REROLL_LIMIT; i += 1) {
      expect(game.spendCreateReroll()).toBe(true)
      game.setCreateProfile(rollLinggen(rng))
    }
    const last = game.createProfile

    expect(game.createRerolls).toBe(0)
    expect(game.spendCreateReroll(), '额度已空却仍允许重掷').toBe(false)
    expect(game.spendCreateReroll()).toBe(false)
    expect(game.createRerolls, '额度被扣成负数').toBe(0)
    expect(game.createProfile).toBe(last)
  })

  it('转世是新的一世:额度归满,上一世的草稿作废', () => {
    const rng = new RandomService(mulberry32(1234))
    const game = useGameStore()
    const player = usePlayerStore()
    player.initCharacter('测试道友', rollLinggen(rng))
    enterCreateView(rng)
    while (game.spendCreateReroll()) game.setCreateProfile(rollLinggen(rng))
    expect(game.createRerolls).toBe(0)

    prepareReincarnation()
    confirmReincarnation(null)

    expect(game.createRerolls, '转世后额度没有归还').toBe(CREATE_REROLL_LIMIT)
    expect(game.createProfile, '上一世的建号草稿没有作废').toBeNull()
  })
})
