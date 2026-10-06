/**
 * 转世交割的端到端契约(confirmReincarnation)
 *
 * prepare/confirm 是转世的唯一入口,却一直没有一张直接钉住交割结果的测试网:
 * 此前的覆盖散在 game.spec(草稿作废)与 player.rebirth.spec(rebirth 单点)里,
 * 没人验证「点下踏入轮回之后,玩家拿走的和放下的各是什么」—— 这正是 ReincarnationDialog
 * 「此生交割」那一格玩家的全部预期。
 *
 * 这里按 DEC-003 的字面契约逐条钉住:
 *   - 留下的是「我是谁」:道果/先天之姿/宿慧/称号/认知/道源道痕/世界记忆(机缘/连锁)都要在;
 *   - 放下的是「我拥有多少」:境界/灵石与材料/装备/法宝/丹药/灵兽/洞府/灵脉/区域进度全部归零;
 *   - 新的皮囊换新的道号(转世重掷姓名,不沿用旧名)。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'
import { useAdventureStore } from '@/stores/adventure'
import { useUiStore } from '@/stores/ui'
import { useEndgameStore } from '@/stores/endgame'
import { useDongfuStore } from '@/stores/dongfu'
import { useLoreStore } from '@/stores/lore'
import { useQuestsStore } from '@/stores/quests'
import { prepareReincarnation, confirmReincarnation } from '@/core/reincarnation'
import { gn, toNum } from '@/utils/gnum'

/** 摆好一个「有存量的人生」:某种境界、带资源装备、带跨世资产、有记忆,再转世 */
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
  res.herb = 40
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

  it('放下「我拥有多少」:境界/资源/装备/法宝/丹药/灵兽/洞府/灵脉/区域全部归零', () => {
    const player = usePlayerStore()
    const res = useResourcesStore()
    const inv = useInventoryStore()
    const cult = useCultivationStore()
    const adv = useAdventureStore()
    const dongfu = useDongfuStore()

    prepareReincarnation()
    confirmReincarnation(null)

    expect(player.major).toBe(0)
    expect(player.sub).toBe(0)
    expect(toNum(player.exp)).toBe(0)
    // 灵石特判:清零后,「完成第一次转世」的成就(a_re1)会给新世补发一小笔悟道与灵石,
    // 故不代表 0 —— 但带进的存量(99999)必须消失,所剩只是新世的开局馈赠
    expect(toNum(res.spiritStone)).toBeLessThan(1000)
    // 悟道同理:存量清零,新世开局可能拿 a_re1 的悟道,故不精确断言
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
  })

  it('带走「我是谁」:道果/天赋/宿慧/称号/认知/道源道痕/世界记忆全部保留', () => {
    const player = usePlayerStore()
    const lore = useLoreStore()
    const endgame = useEndgameStore()
    const quests = useQuestsStore()
    const fruitBefore = player.reincarnation.daoFruit

    prepareReincarnation()
    confirmReincarnation(null)

    // 道果 +本世凝得;天赋在;宿慧上涨;称号在
    expect(player.reincarnation.daoFruit).toBeGreaterThan(fruitBefore)
    expect(player.reincarnation.talents).toContain('t_xian')
    expect(player.reincarnation.insight).toBeGreaterThan(40)
    expect(player.titleId).toBe('ti_lianxu')
    // 认知跨世保留(丹方/药性/器纹在 lore)
    expect(lore.materialLore.m_lingzhi).toBe(2)
    // 道源与道痕随神魂不灭;魂灵亦然
    expect(endgame.daoSource).toBe(5)
    expect(endgame.souls).toHaveLength(1)
    // 「世界记得你的选择」:机缘/连锁/宿敌/区域战绩都在
    expect(player.fortuneChoices).toEqual({ ft_sword_remnant: 'take' })
    expect(player.eventChains).toEqual({ old_man_stone: 2 })
    expect(player.nemeses).toHaveLength(1)
    expect(player.regionStats.qingyun!.totalFights).toBe(30)
    // 成就计数也随神魂不灭
    expect(quests.counters.kills).toBe(99)
  })

  it('新的皮囊换新的道号:转世重掷姓名,不沿用旧名', () => {
    const player = usePlayerStore()
    const before = player.name

    prepareReincarnation()
    confirmReincarnation(null)

    expect(player.name).not.toBe(before)
    expect(player.name.length).toBeGreaterThan(0)
  })

  it('功法半留:门类记得,层数回到一层', () => {
    const cult = useCultivationStore()

    prepareReincarnation()
    confirmReincarnation(null)

    // 习过的功法门类仍在(记忆),但层数随皮囊归到一层起手
    expect(cult.learned.m_taixuan).toBeGreaterThanOrEqual(1)
    expect(cult.learned.m_jinlian).toBeGreaterThanOrEqual(1)
    expect(Math.max(cult.learned.m_taixuan!, cult.learned.m_jinlian!)).toBeLessThan(5)
  })

  it('归档一世履历、结算一遍即止:再次 confirm 应为空操作(防重复发放)', () => {
    const player = usePlayerStore()
    prepareReincarnation()
    confirmReincarnation(null)
    const lives = player.reincarnation.lives.length
    const fruit = player.reincarnation.daoFruit

    // 界面已关(view 置 null),再点一次踏步轮回须被守卫挡下,不二次发放
    confirmReincarnation(null)
    expect(player.reincarnation.lives).toHaveLength(lives)
    expect(player.reincarnation.daoFruit).toBe(fruit)
    expect(useUiStore().reincarnation).toBeNull()
  })
})
