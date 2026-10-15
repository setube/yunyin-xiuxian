/**
 * 建号「逆天改命」额度
 *
 * 政策:建号不限次(掷到满意为止),所以额度不是闸门;真正要守的是那副牌 ——
 * 牌面落在 game store 上,刷新页面看到的是同一副牌,而不是背着玩家换一副。
 * 额度保留数字形态,是为了将来收紧成有限次数时不必再动存档结构。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { rollLinggen } from '@/core/linggenGen'
import { confirmReincarnation, prepareReincarnation } from '@/core/reincarnation'
import { RandomService, mulberry32 } from '@/utils/random'
import { CREATE_REROLL_QUOTA } from '@/data/constants'

/** 复刻 CreateView 的 setup:有草稿就沿用,没有才开掷 */
function enterCreateView(rng: RandomService): void {
  const game = useGameStore()
  if (!game.createProfile) game.setCreateProfile(rollLinggen(rng))
}

describe('建号「逆天改命」不限次', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('想刷多少次就刷多少次,额度不会被扣减', () => {
    const rng = new RandomService(mulberry32(20260902))
    const game = useGameStore()
    enterCreateView(rng)

    expect(game.createRerolls, '建号默认不是不限次').toBeNull()
    for (let i = 0; i < 50; i += 1) {
      expect(game.spendCreateReroll()).toBe(true)
      game.setCreateProfile(rollLinggen(rng))
    }
    expect(game.createRerolls, '刷多了额度被扣成数字').toBeNull()
  })

  it('刷新不会背着玩家换牌:已有草稿时不重新开牌', () => {
    const rng = new RandomService(mulberry32(7))
    const game = useGameStore()
    enterCreateView(rng)
    const drafted = game.createProfile

    enterCreateView(rng)
    expect(game.createProfile, '重进建号页换了一副玩家没掷过的牌').toBe(drafted)
  })

  it('旧存档里遗留的有限额度归位到不限次', () => {
    const rng = new RandomService(mulberry32(99))
    const game = useGameStore()
    enterCreateView(rng)
    // 老版本的存档写的是 8 次额度,刷到 0 就被锁住了
    game.createRerolls = 0
    game.sanitize()

    expect(game.createRerolls, '旧存档的花光额度没有归位,老玩家被锁在最后一副牌上').toBeNull()
    expect(game.spendCreateReroll()).toBe(true)
  })

  it('转世是新的一世:上一世的草稿作废,额度回到不限次', () => {
    const rng = new RandomService(mulberry32(1234))
    const game = useGameStore()
    const player = usePlayerStore()
    player.initCharacter('测试道友', rollLinggen(rng))
    enterCreateView(rng)
    game.setCreateProfile(rollLinggen(rng))

    prepareReincarnation()
    confirmReincarnation(null)

    expect(game.createRerolls, '转世后额度形态变了').toBe(CREATE_REROLL_QUOTA)
    expect(game.createProfile, '上一世的建号草稿没有作废').toBeNull()
  })

  it('建号页刷新不丢道号:setCreateName 记下、超长截断、转世即清', () => {
    const game = useGameStore()
    expect(game.createName).toBe('')
    game.setCreateName('清溪剑客')
    expect(game.createName).toBe('清溪剑客')
    // 与输入框 maxlength 同口径:只留 8 字
    game.setCreateName('一二三四五六七八九十')
    expect(game.createName).toBe('一二三四五六七八')
    // 新的一世草稿作废,道号一并清空(不再把上一世的字带进新号)
    game.resetCreateDraft()
    expect(game.createName).toBe('')
  })
})
