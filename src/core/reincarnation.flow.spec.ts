/**
 * 转世交割端到端契约(confirmReincarnation),对应 ReincarnationDialog「此生交割」:
 * 留下「我是谁」,放下「我拥有多少」,转世重掷道号。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'
import { useAdventureStore } from '@/stores/adventure'
import { useUiStore } from '@/stores/ui'
import { useEndgameStore } from '@/stores/endgame'
import { useDongfuStore } from '@/stores/dongfu'
import { useApprenticeStore } from '@/stores/apprentice'
import { useLoreStore } from '@/stores/lore'
import { useQuestsStore } from '@/stores/quests'
import { STARTER_APPRENTICE } from '@/data/apprentices'
import { prepareReincarnation, confirmReincarnation } from '@/core/reincarnation'
import * as reincarnationService from '@/core/reincarnation'
import { rng } from '@/utils/random'
import { signLifeTrial, lifeTrialRules } from '@/core/lifeTrialService'
import { gn, toNum } from '@/utils/gnum'

/** 摆好一个有存量的人生:境界、资源装备、跨世资产、记忆 */
function seedLife(): void {
  const player = usePlayerStore()
  const res = useResourcesStore()
  const inv = useInventoryStore()
  const cult = useCultivationStore()
  const adv = useAdventureStore()
  const dongfu = useDongfuStore()
  const quests = useQuestsStore()
  const endgame = useEndgameStore()
  const lore = useLoreStore()

  player.initCharacter('旧道号', { roots: [] } as never)
  player.major = 5
  player.sub = 8
  player.exp = gn(1000)
  player.age = 300

  res.spiritStone = gn(99999)
  res.setQi(500, 100)
  res.wudao = 50
  res.herbByGrade[1] = 40
  res.ore = 30
  res.page = 20
  res.dust = 10

  inv.items = [{ uid: 'i1' }] as never
  inv.equipped = { weapon: 'i1' } as never
  inv.pills = { p_jvqisan: 3 }
  inv.artifacts = [{ uid: 'a1' }] as never
  inv.equippedArtifacts = ['a1']

  cult.learned = { m_taixuan: 5, m_jinlian: 3 }
  cult.buffs = [{ id: 'b1', until: 999 }] as never
  cult.mainGongfa = 'm_taixuan'

  adv.unlocked = ['qingyun', 'luoxia']
  adv.cleared = ['qingyun']
  dongfu.setLevel('field', 8)
  player.setPet('pet_yueying')
  useApprenticeStore().$patch({
    apprentices: [{ uid: 'apt1', archId: STARTER_APPRENTICE, level: 3, bond: 20, task: null }] as never
  })

  // 跨世资产
  player.reincarnation.daoFruit = 100
  player.reincarnation.talents = ['t_xian']
  player.reincarnation.insight = 40
  player.titleId = 'ti_lianxu'
  player.nemeses = [{ id: 'n_one', avengedAt: 1 }] as never
  player.regionStats = { qingyun: { totalFights: 30 } } as never
  player.fortuneChoices = { ft_sword_remnant: 'take' }
  player.eventChains = { old_man_stone: 2 }
  quests.counters = { kills: 99 } as never
  lore.materialLore = { m_lingzhi: 2 }
  endgame.daoSource = 5
  endgame.souls = [{ uid: 's1' }] as never
  endgame.equippedSouls = ['s1']
}

describe('转世交割 · confirmReincarnation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    seedLife()
  })

  afterEach(() => vi.restoreAllMocks())

  it('准备来世灵根不提前落账,确认后得到的就是预览那副牌', async () => {
    const player = usePlayerStore()
    const before = JSON.stringify(player.$state)
    const loreBefore = JSON.stringify(useLoreStore().$state)
    const view = prepareReincarnation()
    expect(JSON.stringify(player.$state)).toBe(before)
    expect(JSON.stringify(useLoreStore().$state)).toBe(loreBefore)
    expect(view.nextLinggen?.roots.length).toBeGreaterThan(0)
    expect(view.nextLinggen?.growthMult).toBeGreaterThan(0)

    await confirmReincarnation(null)
    expect(player.linggen).toEqual(view.nextLinggen)
  })

  it('连续重刷五十次只换灵根,不重抽天赋或重复发奖,确认采用最后一副牌', async () => {
    const player = usePlayerStore()
    prepareReincarnation()
    const ui = useUiStore()
    const before = JSON.stringify(player.$state)
    const { nextLinggen: initial, ...review } = ui.reincarnation!
    expect(initial.roots.length).toBeGreaterThan(0)
    for (let i = 0; i < 50; i += 1) {
      const previous = ui.reincarnation!.nextLinggen
      reincarnationService.rerollReincarnationLinggen()
      expect(ui.reincarnation!.nextLinggen).not.toBe(previous)
      const { nextLinggen: profile, ...after } = ui.reincarnation!
      expect(profile.roots.length).toBeGreaterThan(0)
      expect(after).toEqual(review)
      expect(JSON.stringify(player.$state)).toBe(before)
    }
    const selected = ui.reincarnation!.nextLinggen
    await confirmReincarnation(ui.reincarnation!.talentChoices[0] ?? null)
    expect(player.linggen).toEqual(selected)
    expect(player.reincarnation.count).toBe(1)
    expect(player.reincarnation.daoFruit).toBe(100 + review.daoFruitGained)
  })

  it('受控掷点产生完整的新灵根,连续抽中相同结果也有效', async () => {
    prepareReincarnation()
    const view = useUiStore().reincarnation!
    view.nextLinggen = { roots: [{ element: 'wood', aptitude: 60 }], gradeName: '异灵根', growthMult: 1.6 }
    view.linggenAptitudeFloor = 5
    // 只控制随机输入,仍走真实生成器:混沌资质先掷 85,随后两次都掷 100。
    vi.spyOn(rng, 'chance').mockReturnValue(true)
    vi.spyOn(rng, 'int').mockReturnValueOnce(85).mockReturnValue(100)

    reincarnationService.rerollReincarnationLinggen()
    expect(view.nextLinggen).toEqual({
      roots: [{ element: 'chaos', aptitude: 90 }],
      gradeName: '混沌灵根',
      growthMult: 3.6
    })

    const capped = { roots: [{ element: 'chaos', aptitude: 100 }], gradeName: '混沌灵根', growthMult: 4 }
    reincarnationService.rerollReincarnationLinggen()
    expect(view.nextLinggen).toEqual(capped)
    reincarnationService.rerollReincarnationLinggen()
    expect(view.nextLinggen).toEqual(capped)
  })

  it.each([0, 9])('境界 %i 的灵根草稿计入本次宿慧与新认知,资质保底与旧结算一致', async major => {
    const player = usePlayerStore()
    player.major = major
    player.reincarnation.insight = 590
    useLoreStore().materialLore = {}
    vi.spyOn(rng, 'chance').mockReturnValue(false)
    vi.spyOn(rng, 'int').mockImplementation(min => min)
    prepareReincarnation()
    const selected = useUiStore().reincarnation!.nextLinggen
    expect(selected).toBeDefined()
    vi.restoreAllMocks()
    await confirmReincarnation(null)
    // 590 + 本世所得 + 新认得的灵材每味 3 宿慧,次数保底仍按转世前的 0+1 计。
    const gained = player.reincarnation.lives[0]!.insight
    const insight = 590 + gained + Object.values(useLoreStore().materialLore).filter(v => v >= 1).length * 3
    const aptitude = Math.min(100, 40 + Math.max(5, Math.floor(insight / 12)))
    expect(player.linggen!.roots.every(root => root.aptitude === aptitude)).toBe(true)
    expect(player.linggen).toEqual(selected)
  })

  it('没有转生窗口时重刷为空操作', async () => {
    const player = usePlayerStore()
    const before = JSON.stringify(player.$state)
    expect(() => reincarnationService.rerollReincarnationLinggen()).not.toThrow()
    expect(JSON.stringify(player.$state)).toBe(before)
    expect(useUiStore().reincarnation).toBeNull()
  })

  it('放下「我拥有多少」:境界/资源/装备/法宝/丹药/灵兽/洞府/灵脉/区域全部归零', async () => {
    const player = usePlayerStore()
    const res = useResourcesStore()
    const inv = useInventoryStore()
    const cult = useCultivationStore()
    const adv = useAdventureStore()
    const dongfu = useDongfuStore()
    const appr = useApprenticeStore()

    prepareReincarnation()
    await confirmReincarnation(null)

    expect(player.major).toBe(0)
    expect(player.sub).toBe(0)
    expect(toNum(player.exp)).toBe(0)
    // a_re1(完成第一次转世)会给新世补发灵石与悟道:灵石只断言存量消失,悟道不断言
    expect(toNum(res.spiritStone)).toBeLessThan(1000)
    expect(res.herb).toBe(0)
    expect(res.ore).toBe(0)
    expect(res.page).toBe(0)
    expect(res.dust).toBe(0)
    expect(res.qi).toBe(0)
    expect(inv.items).toHaveLength(0)
    expect(inv.equipped).toEqual({})
    expect(inv.pills).toEqual({})
    expect(inv.artifacts).toHaveLength(0)
    expect(inv.equippedArtifacts).toEqual([])
    expect(cult.buffs).toHaveLength(0)
    expect(adv.unlocked).toEqual(['qingyun'])
    expect(adv.cleared).toEqual([])
    expect(player.petId).toBeNull()
    expect(dongfu.levels.field).toBe(0)
    expect(appr.apprentices, '道童随转世散去').toHaveLength(0)
    expect(appr.rebirthKarma, 'seedLife 的 bond:20 未达真传,不凝缘').toBe(0)
  })

  it('真传道童转世:道童本体散去,但一丝缘(rebirthKarma)随世带走', async () => {
    const appr = useApprenticeStore()
    useApprenticeStore().$patch({
      apprentices: [{ uid: 'apt2', archId: STARTER_APPRENTICE, level: 9, bond: 150, task: null }] as never
    })
    prepareReincarnation()
    await confirmReincarnation(null)
    expect(appr.apprentices, '道童本体仍随世散去').toHaveLength(0)
    expect(appr.rebirthKarma, '真传之缘随世带走,封顶到真传位阶').toBe(100)
  })

  it('带走「我是谁」:道果/天赋/宿慧/称号/认知/道源道痕/世界记忆全部保留', async () => {
    const player = usePlayerStore()
    const lore = useLoreStore()
    const endgame = useEndgameStore()
    const quests = useQuestsStore()
    const fruitBefore = player.reincarnation.daoFruit

    prepareReincarnation()
    await confirmReincarnation(null)

    expect(player.reincarnation.daoFruit).toBeGreaterThan(fruitBefore)
    expect(player.reincarnation.talents).toContain('t_xian')
    expect(player.reincarnation.insight).toBeGreaterThan(40)
    expect(player.titleId).toBe('ti_lianxu')
    expect(lore.materialLore.m_lingzhi).toBe(2)
    expect(endgame.daoSource).toBe(5)
    expect(endgame.souls).toHaveLength(1)
    expect(player.fortuneChoices).toEqual({ ft_sword_remnant: 'take' })
    expect(player.eventChains).toEqual({ old_man_stone: 2 })
    expect(player.nemeses).toHaveLength(1)
    expect(player.regionStats.qingyun!.totalFights).toBe(30)
    expect(quests.counters.kills).toBe(99)
  })

  it('新的皮囊换新的道号:转世重掷姓名,不沿用旧名', async () => {
    const player = usePlayerStore()
    const before = player.name

    prepareReincarnation()
    await confirmReincarnation(null)

    expect(player.name).not.toBe(before)
    expect(player.name.length).toBeGreaterThan(0)
  })

  it('功法半留:门类记得,层数回到一层', async () => {
    const cult = useCultivationStore()

    prepareReincarnation()
    await confirmReincarnation(null)

    expect(cult.learned.m_taixuan).toBeGreaterThanOrEqual(1)
    expect(cult.learned.m_jinlian).toBeGreaterThanOrEqual(1)
    expect(Math.max(cult.learned.m_taixuan!, cult.learned.m_jinlian!)).toBeLessThan(5)
  })

  it('归档一世履历、结算一遍即止:再次 confirm 应为空操作(防重复发放)', async () => {
    const player = usePlayerStore()
    prepareReincarnation()
    await confirmReincarnation(null)
    const lives = player.reincarnation.lives.length
    const fruit = player.reincarnation.daoFruit

    // 界面已关(view 置 null),守卫挡下
    await confirmReincarnation(null)
    expect(player.reincarnation.lives).toHaveLength(lives)
    expect(player.reincarnation.daoFruit).toBe(fruit)
    expect(useUiStore().reincarnation).toBeNull()
  })

  it('逆旅契随世交割:归档进履历、本世契清空、下世不再受契约束', async () => {
    const player = usePlayerStore()
    // seedLife 给 daoFruit=100,tr_gu 需 24
    expect(signLifeTrial('tr_gu')).toBe(true)
    expect(lifeTrialRules()).toBeDefined()

    prepareReincarnation()
    await confirmReincarnation(null)

    // 先归档、后清空 —— 顺序错了会丢奖励或跨世泄漏
    const last = player.reincarnation.lives[player.reincarnation.lives.length - 1]
    expect(last?.trialId, '履历应记为这世所立之契').toBe('tr_gu')
    expect(player.reincarnation.trial, '本世契应随转世清空,不泄漏进下一世').toBeNull()
    expect(lifeTrialRules()).toBeUndefined()
  })

  /**
   * 转世交割里换了本世之界,而换界是分块异步的。
   *
   * 曾经它没被 await:confirmReincarnation 是同步函数,调用完立刻返回,
   * 此时 adventure.mortalWorld 已被清空、新世界还没生成好 —— 转世后落地到 /
   * 看到的是「此世未成」,几秒后草忽然出来。
   * 故障注入:去掉 confirmReincarnation 里的 await → 本条红。
   */
  it('给定转世交割,当确认转世后,则本世之界已换好而不是空的', async () => {
    const adventure = useAdventureStore()
    const before = adventure.mortalWorld
    prepareReincarnation()
    await confirmReincarnation(null)
    expect(adventure.mortalWorld, '转世后该有一方新天地,不该是空的').not.toBeNull()
    if (before) {
      expect(adventure.mortalWorld?.seed, '该换一方天地').not.toBe(before.seed)
    }
  })
})
