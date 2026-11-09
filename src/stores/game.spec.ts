/** 建号「逆天改命」额度:当前不限次;灵根草稿落在 game store,刷新后不换。 */
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

  it('想刷多少次就刷多少次,额度不会被扣减', async () => {
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

  it('游玩时长累加挡住 NaN / Infinity / 负数', async () => {
    const game = useGameStore()
    game.totalPlaySec = 60
    for (const bad of [NaN, Infinity, -Infinity, -5]) game.addPlayTime(bad)
    expect(game.totalPlaySec).toBe(60)
  })

  it('刷新不会背着玩家换牌:已有草稿时不重新开牌', async () => {
    const rng = new RandomService(mulberry32(7))
    const game = useGameStore()
    enterCreateView(rng)
    const drafted = game.createProfile

    enterCreateView(rng)
    expect(game.createProfile, '重进建号页换了一副玩家没掷过的牌').toBe(drafted)
  })

  it('旧存档里遗留的有限额度归位到不限次', async () => {
    const rng = new RandomService(mulberry32(99))
    const game = useGameStore()
    enterCreateView(rng)
    game.createRerolls = 0
    game.sanitize()

    expect(game.createRerolls, '旧存档的花光额度没有归位,老玩家被锁在最后一副牌上').toBeNull()
    expect(game.spendCreateReroll()).toBe(true)
  })

  it('转世是新的一世:上一世的草稿作废,额度回到不限次', async () => {
    const rng = new RandomService(mulberry32(1234))
    const game = useGameStore()
    const player = usePlayerStore()
    player.initCharacter('测试道友', rollLinggen(rng))
    enterCreateView(rng)
    game.setCreateProfile(rollLinggen(rng))

    prepareReincarnation()
    await confirmReincarnation(null)

    expect(game.createRerolls, '转世后额度形态变了').toBe(CREATE_REROLL_QUOTA)
    expect(game.createProfile, '上一世的建号草稿没有作废').toBeNull()
  })

  it('建号页刷新不丢道号:setCreateName 记下、超长截断、转世即清', async () => {
    const game = useGameStore()
    expect(game.createName).toBe('')
    game.setCreateName('清溪剑客')
    expect(game.createName).toBe('清溪剑客')
    // 与输入框 maxlength 同口径:8 字
    game.setCreateName('一二三四五六七八九十')
    expect(game.createName).toBe('一二三四五六七八')
    game.resetCreateDraft()
    expect(game.createName).toBe('')
  })

  it('建号草稿写入只收合法形状:坏灵根拒绝、坏字段修形、坏道号不抛', async () => {
    const rng = new RandomService(mulberry32(20261022))
    const game = useGameStore()
    const drafted = rollLinggen(rng)
    game.setCreateProfile(drafted)

    game.setCreateProfile({ roots: [{ element: 'nope', aptitude: 80 }], gradeName: '坏根', growthMult: 1 } as never)
    expect(game.createProfile, '认不出的灵根不该覆盖现有草稿').toEqual(drafted)

    game.setCreateProfile({ roots: [{ element: 'wood', aptitude: 80 }], gradeName: '木灵根', growthMult: null } as never)
    expect(game.createProfile).toMatchObject({ gradeName: '木灵根', growthMult: 1 })
    expect(game.createProfile?.roots[0]?.element).toBe('wood')

    game.setCreateName('清溪')
    expect(() => game.setCreateName(42 as never)).not.toThrow()
    expect(game.createName, '坏道号不该覆盖玩家已输入的字').toBe('清溪')
  })

  it('最后活跃时刻只认有限非负值,坏时钟不写进离线结算依据', async () => {
    const game = useGameStore()
    game.stampActive(1000)
    for (const bad of [NaN, Infinity, -Infinity, -1]) game.stampActive(bad)
    expect(game.lastActiveAt).toBe(1000)
    game.stampActive(0)
    expect(game.lastActiveAt, '0 是合法时刻(纪元起点),不该被当成坏值').toBe(0)
    game.stampActive(2000)
    expect(game.lastActiveAt).toBe(2000)
  })

  it('开局标记只认严格布尔真:坏档字符串/数字/对象都回落到未开局', async () => {
    const game = useGameStore()
    for (const bad of ['false', 'yes', 1, {}]) {
      game.$patch({ started: bad as never })
      game.sanitize()
      expect(game.started, `坏 started=${JSON.stringify(bad)} 不得绕过开局守卫`).toBe(false)
    }
    game.markStarted()
    game.sanitize()
    expect(game.started, '合法 true 修形后保持开局').toBe(true)
  })
})
