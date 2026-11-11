/**
 * 转世「新的一世」:本世进程清零、跨世记忆保留(边界与原世交割对齐)
 *   - 必清:连胜/当日巡游/进行中的秘境/进行中的区域事件/镇压收益
 *   - 保留:区域兴衰战绩与宿敌(不含镇压权益)、机缘选择记忆(fortuneChoices)、奇遇连锁(eventChains)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useDongfuStore } from '@/stores/dongfu'
import { useInventoryStore } from '@/stores/inventory'
import type { SecretRealmState } from '@/core/secretRealm'
import { DAOLU } from '@/data/daolu'

function seedPlayer(p: ReturnType<typeof usePlayerStore>): void {
  p.winStreak = 7
  p.lastCaveEventDay = 5
  p.secretRealm = {
    realmId: 'sr_kurong',
    enteredAt: 1,
    layer: 2,
    wins: 5,
    losses: 0,
    spoils: [],
    rules: [],
    carriedHpPct: 1,
    finished: false
  } as SecretRealmState
  p.regionEvent = { regionId: 'qingyun', eventId: 'ev_raiders', endsAt: 9e15 } as never
  p.suppressedRegions = ['qingyun']
  p.suppressedSince = { qingyun: 12345 }
  p.fortuneChoices = { ft_sword_remnant: 'take' }
  p.eventChains = { old_man_stone: 2 }
}

describe('player.rebirth 转世状态重置', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('清空本世进程:连胜/当日巡游/秘境/区域事件/镇压收益', () => {
    const p = usePlayerStore()
    p.initCharacter('测试道友', { roots: [] } as never)
    seedPlayer(p)

    p.rebirth({ roots: [] } as never)

    expect(p.winStreak).toBe(0)
    expect(p.lastCaveEventDay).toBe(0)
    expect(p.secretRealm).toBeNull()
    expect(p.regionEvent).toBeNull()
    // 镇压收益逐 tick 派发灵石/装备:旧世远境跨世,新世会按旧阶位派发高阶装备
    expect(p.suppressedRegions).toHaveLength(0)
    expect(Object.keys(p.suppressedSince)).toHaveLength(0)
    // 镇压资格同样随世散去:否则新世可一键切回高阶收益
    expect(p.suppressQualified).toHaveLength(0)
  })

  it('本世的关系与本世的契要清空 —— 它们的字段注释一直这么写,而实现漏了', () => {
    /*
     * 三处字段的注释都写着「这一世…转世时清空」,而 `rebirth` 里漏清。
     * 后果不是文案问题,是**功能被永久锁死**:
     *   `daoluService` 用 `if (player.bond) return false` 挡「这一世只能遇一位」;
     *   `lifeTrialService` 用 `if (trial) return false` 挡「再签一张」;
     * 新世带着旧值就再也遇不到道侣、签不了逆旅契。
     * 历世履历(`reincarnation.bonds`)与跨世追求(`vow` 之外的历史)仍应保留。
     */
    const p = usePlayerStore()
    p.initCharacter('测试道友', { roots: [] } as never)
    p.bond = {
      daoluId: DAOLU[0]!.id, stage: 'met', fate: 50, trust: 50, accord: 50, shared: 3, metAt: 1,
      fallen: false, departed: false, doneEvents: [], opportunities: 0, nextEventAt: 6,
      pendingEventId: null, intentPending: false, intent: null
    } as never
    p.reincarnation = {
      ...p.reincarnation,
      trial: { themeId: 't_a', stages: [], done: false } as never,
      vow: { themeId: 'v_a', broken: false } as never
    }

    p.rebirth({ roots: [] } as never)

    expect(p.bond, '本世道侣没清 —— 新世再也遇不到新的一位').toBeNull()
    expect(p.reincarnation.trial, '本世逆旅契没清 —— 新世再也签不了新的').toBeNull()
    expect(p.reincarnation.vow, '本世命题没清 —— 新世立不了新题').toBeNull()
    // 跨世保留项:世号前进、履历不动
    expect(p.reincarnation.count, '世号该前进').toBe(1)
  })

  it('跨世累加接口挡住 NaN / Infinity / 负数:寿元、道果与宿慧不被污染', () => {
    const p = usePlayerStore()
    p.initCharacter('测试道友', { roots: [] } as never)
    p.age = 100
    p.lifespanBonusYears = 10
    p.reincarnation = { ...p.reincarnation, daoFruit: 5, insight: 7 }

    for (const bad of [NaN, Infinity, -Infinity, -3]) {
      p.addAge(bad)
      p.addLifespan(bad)
      p.addDaoFruit(bad)
      p.addInsight(bad)
    }

    expect(p.age, '寿元不能被坏时长写成 NaN 或倒流').toBe(100)
    expect(p.lifespanBonusYears).toBe(10)
    expect(p.reincarnation.daoFruit).toBe(5)
    expect(p.reincarnation.insight).toBe(7)
  })

  it('保留跨世记忆:机缘选择/奇遇连锁(「世界记得你的选择」)', () => {
    const p = usePlayerStore()
    p.initCharacter('测试道友', { roots: [] } as never)
    seedPlayer(p)

    p.rebirth({ roots: [] } as never)

    expect(p.fortuneChoices).toEqual({ ft_sword_remnant: 'take' })
    expect(p.eventChains).toEqual({ old_man_stone: 2 })
  })

  it('师承跨世保留:转世丢了外物,却带走这师门(对照灵兽归零·不可复改)', () => {
    const p = usePlayerStore()
    p.initCharacter('测试道友', { roots: [] } as never)
    p.adoptMentor('swordsman')
    p.setPet('pet_yueying')

    p.rebirth({ roots: [] } as never)

    expect(p.mentor, '师承是「我是谁」的思想,不该随皮囊散去').toBe('swordsman')
    expect(p.petId, '灵兽应随皮囊散去').toBeNull()
    p.adoptMentor('alchemist')
    expect(p.mentor, '转世后也不得另投师门').toBe('swordsman')
  })

  it('新的皮囊换新的道号:转世重掷姓名,不沿用上一世的名号', () => {
    const p = usePlayerStore()
    p.initCharacter('旧道号', { roots: [] } as never)
    seedPlayer(p)
    const before = p.name

    p.rebirth({ roots: [] } as never)

    expect(p.name, '转世后仍沿用旧道号 —— 新的一世无从感知').not.toBe(before)
    expect(p.name.length, '新道号不应为空').toBeGreaterThan(0)
  })

  it('外物归零:灵兽/洞府建筑/灵脉投资', () => {
    const p = usePlayerStore()
    const dongfu = useDongfuStore()
    p.initCharacter('测试道友', { roots: [] } as never)
    p.setPet('pet_yueying')
    dongfu.setLevel('field', 8)
    dongfu.setLevel('library', 6)
    dongfu.setVeinMain('gather')
    dongfu.addVeinPoint('gather', 30)
    dongfu.addVeinPoint('insight', 12)

    p.rebirth({ roots: [] } as never)

    expect(p.petId, '灵兽应随皮囊散去').toBeNull()
    expect(dongfu.levels.field, '洞府建筑应归零').toBe(0)
    expect(dongfu.levels.library).toBe(0)
    expect(dongfu.veinMain, '灵脉主脉应清空').toBeNull()
    expect(Object.values(dongfu.veinPoints).every(v => v === 0), '灵脉投点应清零').toBe(true)
  })

  it('转世不清当日账(wudaoExchange / mansionRedirect)—— 否则同游戏日转世重开兑换/改向配额', () => {
    const p = usePlayerStore()
    p.initCharacter('测试道友', { roots: [] } as never)
    // 当日账按 gameDay 自动重置,转世不清
    p.wudaoExchange = { gameDay: 7, count: 3 }
    p.mansionRedirect = { gameDay: 7, worldId: 'chiyan', count: 1 } as never

    p.rebirth({ roots: [] } as never)

    expect(p.wudaoExchange, '悟道兑换当日账应随神魂带走(否则同日转世重开兑换配额)').toEqual({ gameDay: 7, count: 3 })
    expect(p.mansionRedirect, '值日定向当日账应随神魂带走(否则同日转世重开改向配额)').not.toBeNull()
  })

  /** 宿敌按 enemyId 认人(recordLoss/markAvenged/ghostOf 只 find 第一条) */
  it('sanitize:宿敌同一位写两条合并成一条,败绩取较大、雪耻取较早', () => {
    const p = usePlayerStore()
    p.$patch({
      nemeses: [
        { enemyId: 'e1', enemyName: '血魔', regionId: 'qingyun', lossCount: 3, lastLossAt: 100 },
        { enemyId: 'e1', enemyName: '血魔', regionId: 'qingyun', lossCount: 5, lastLossAt: 300, avengedAt: 900 },
        { enemyId: 'e1', enemyName: '血魔', regionId: 'qingyun', lossCount: 4, lastLossAt: 200, avengedAt: 800 },
        { enemyId: 'e2', enemyName: '阴煞', regionId: 'qingyun', lossCount: 3, lastLossAt: 50 }
      ]
    } as never)
    p.sanitize()
    expect(p.nemeses.map(n => n.enemyId), '同一位只留一条,不同位各自保留').toEqual(['e1', 'e2'])
    const e1 = p.nemeses.find(n => n.enemyId === 'e1')!
    expect(e1.lossCount, '败北次数取较大者').toBe(5)
    expect(e1.lastLossAt, '最后败北取较晚者').toBe(300)
    expect(e1.avengedAt, '首次雪耻取较早那次').toBe(800)
  })

  /** 镇压结算逐条遍历 suppressedRegions,重复会让同一地界每拍产出两份 */
  it('sanitize:镇压表/资格表按地界去重(不重复结算收益)', () => {
    const p = usePlayerStore()
    p.major = 20 // 地界全在境界之内,只测去重
    p.$patch({
      suppressedRegions: ['qingyun', 'qingyun'],
      suppressQualified: ['qingyun', 'qingyun', 'luoxia', 'luoxia']
    } as never)
    p.sanitize()
    expect(p.suppressedRegions, '镇压表同一位只留一份').toEqual(['qingyun'])
    expect(p.suppressQualified, '资格表同一位只留一份').toEqual(['qingyun', 'luoxia'])
  })

  /** 天赋重复会让 talentMods 把同一份词条算两次 */
  it('sanitize:天赋/传承同一条写两遍只留一份,不白送属性', () => {
    const p = usePlayerStore()
    const talent = 't_jianxin'
    p.$patch({
      reincarnation: {
        ...p.reincarnation,
        talents: [talent, talent, 't_not_real'],
        heritage: ['danxin', 'danxin', 'h_not_real']
      }
    } as never)
    p.sanitize()
    expect(p.reincarnation.talents, '同一条天赋只留一份(认不出的旧 id 保留,不产生词条)').toEqual([talent, 't_not_real'])
    expect(p.reincarnation.heritage, '同一条传承只留一份,认不出的清掉').toEqual(['danxin'])

    // 再加同 id 也不重复
    p.addTalent(talent)
    expect(p.reincarnation.talents).toEqual([talent, 't_not_real'])
  })

  /** 祭炼位是境界闸(低境界 1 槽,元婴起 2 槽),与 toggleArtifact / applyLoadout 同口径裁剪 */
  it('sanitize:祭炼位按当前境界裁到槽位上限', () => {
    const p = usePlayerStore()
    const inv = useInventoryStore()
    p.major = 0 // 未达 ARTIFACT_SLOT_UNLOCK_MAJOR:只有 1 个槽
    inv.$patch({ equippedArtifacts: ['a1', 'a2', 'a3'] } as never)
    p.sanitize()
    expect(inv.equippedArtifacts, '低境界只留先祭炼的那一件').toEqual(['a1'])
  })
})

/** 认不出的师承会永久堵死拜师入口 */
describe('读写档:认不出的称号/灵兽/师承回落空', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('titleId / petId / mentor 为野 id 时回落 null,真 id 原样保留', () => {
    const p = usePlayerStore()
    p.$patch({ titleId: 'ti_ghost', petId: 'pet_ghost', mentor: 'ghost' } as never)
    p.sanitize()
    expect(p.titleId).toBeNull()
    expect(p.petId).toBeNull()
    expect(p.mentor).toBeNull()

    p.$patch({ titleId: 'ti_churu', petId: 'pet_qingyu', mentor: 'swordsman' } as never)
    p.sanitize()
    expect(p.titleId).toBe('ti_churu')
    expect(p.petId).toBe('pet_qingyu')
    expect(p.mentor).toBe('swordsman')
  })

  it('野师承清掉之后仍能正常拜师', () => {
    const p = usePlayerStore()
    p.$patch({ mentor: 'ghost' } as never)
    p.sanitize()
    p.adoptMentor('alchemist')
    expect(p.mentor).toBe('alchemist')
  })

  it('区域事件认不出的 eventId 整块清掉,真事件原样保留', () => {
    const p = usePlayerStore()
    // 野事件 id 无倍率,却占住「本轮已有事件」槽
    p.$patch({ regionEvent: { regionId: 'qingyun', eventId: 'ghost', endsAt: Date.now() + 60_000 } } as never)
    p.sanitize()
    expect(p.regionEvent).toBeNull()

    p.$patch({ regionEvent: { regionId: 'qingyun', eventId: 'yaochao', endsAt: Date.now() + 60_000 } } as never)
    p.sanitize()
    expect(p.regionEvent?.eventId).toBe('yaochao')
  })

  /** 野 pendingEventId:弹窗打不开,offerBondEvent 又因其非空不再出新事件 */
  it('道侣待决事件认不出的 id 清回 null,真事件原样保留', () => {
    const p = usePlayerStore()
    p.$patch({
      bond: {
        daoluId: 'dl_qingli',
        stage: 'met',
        fate: 0,
        trust: 0,
        accord: 0,
        shared: 1,
        metAt: 1,
        fallen: false,
        doneEvents: [],
        pendingEventId: 'bond_ghost',
        opportunities: 6,
        nextEventAt: 6
      }
    } as never)
    // 先确认道侣本体认得,免得整块作废而假通过
    p.sanitize()
    expect(p.bond, '道侣本体应认得').not.toBeNull()
    expect(p.bond?.pendingEventId, '野事件 id 不再堵住下一次机会').toBeNull()

    p.$patch({ bond: { ...p.bond!, pendingEventId: 'be_relic' } } as never)
    p.sanitize()
    expect(p.bond?.pendingEventId, '认得的事件原样保留').toBe('be_relic')
  })
})
