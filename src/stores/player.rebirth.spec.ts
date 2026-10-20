/**
 * 转世「新的一世」—— 本世进程清零、跨世记忆保留(ISS-015 / TASK-009)
 *
 * 边界(与 DEC-003 对齐):
 *   - 必清:连胜/当日巡游/进行中的秘境/进行中的区域事件/镇压收益 —— 它们属「这一世」的当下
 *     (镇压收益逐 tick 派发灵石/装备,旧世远境跨世即数值爆炸,转世妖气复聚)
 *   - 保留:区域兴衰战绩与宿敌(「成长改变世界」的世界记忆,不含镇压权益)、
 *     机缘选择记忆(fortuneChoices,「世界记得你的选择」)、奇遇连锁(eventChains)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useDongfuStore } from '@/stores/dongfu'
import type { SecretRealmState } from '@/core/secretRealm'

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
  // 镇压收益是本世进程,转世即散(妖气复聚);机缘/连锁是跨世记忆,全保留
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
    // 镇压收益是本世产出(逐 tick 派发灵石/装备),转世即妖气复聚 ——
    // 旧世压下的远境若跨世,新世按旧阶位派发高阶装备,数值爆炸
    expect(p.suppressedRegions).toHaveLength(0)
    expect(Object.keys(p.suppressedSince)).toHaveLength(0)
    // 资格(「镇压过就不必再打满」那枚令)也是经济权柄:新世一键切回高阶收益
    // 会把爆炸换个入口带回来,故一并随世散去
    expect(p.suppressQualified).toHaveLength(0)
  })

  it('保留跨世记忆:机缘选择/奇遇连锁(「世界记得你的选择」)', () => {
    const p = usePlayerStore()
    p.initCharacter('测试道友', { roots: [] } as never)
    seedPlayer(p)

    p.rebirth({ roots: [] } as never)

    // 「世界记得你的选择」:机缘取/弃记忆不随转世清空
    expect(p.fortuneChoices).toEqual({ ft_sword_remnant: 'take' })
    expect(p.eventChains).toEqual({ old_man_stone: 2 })
  })

  it('师承跨世保留:转世丢了外物,却带走这师门(对照灵兽归零·不可复改)', () => {
    const p = usePlayerStore()
    p.initCharacter('测试道友', { roots: [] } as never)
    // 师承 = 跨世保留的成长思想(DEC-003),与灵兽/洞府这些「外物」相反
    p.adoptMentor('swordsman')
    // 对照组:灵兽作外物,转世必清
    p.setPet('pet_yueying')

    p.rebirth({ roots: [] } as never)

    // 师承跨世保留:转世后在
    expect(p.mentor, '师承是「我是谁」的思想,不该随皮囊散去').toBe('swordsman')
    // 外物对照:灵兽随皮囊归零
    expect(p.petId, '灵兽应随皮囊散去').toBeNull()
    // 一经确立不可更改,转世亦然:另投他门被拒
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

  /**
   * 「灵魂/记忆留下,外物归零」:灵兽、洞府建筑、灵脉投资都是外物,
   * 不得随转世带走 —— 否则每一世都从半成品起步,「重新经历」名存实亡。
   */
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
    // 当日账:gameDay 相合才计入当日、次日由闸逻辑自动重置 —— 转世不掺和
    p.wudaoExchange = { gameDay: 7, count: 3 }
    p.mansionRedirect = { gameDay: 7, worldId: 'chiyan', count: 1 } as never

    p.rebirth({ roots: [] } as never)

    expect(p.wudaoExchange, '悟道兑换当日账应随神魂带走(否则同日转世重开兑换配额)').toEqual({ gameDay: 7, count: 3 })
    expect(p.mansionRedirect, '值日定向当日账应随神魂带走(否则同日转世重开改向配额)').not.toBeNull()
  })

  /**
   * 宿敌按 enemyId 认人(recordLoss/markAvenged/ghostOf 都只 find 第一条):
   * 坏档里同一位写两条,第二条永远「尚为宿敌」,征战录还会画出两行同 key。
   */
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

  /**
   * 镇压结算逐条遍历 suppressedRegions:同一位写两遍会让同一片地界
   * 每拍产出两份灵石(离线一并放大)。资格表重复则让「是否已取得」判重。
   */
  it('sanitize:镇压表/资格表按地界去重(不重复结算收益)', () => {
    const p = usePlayerStore()
    p.major = 20 // 让所有地界都「在境界之内」,专测去重而非可达性过滤
    p.$patch({
      suppressedRegions: ['qingyun', 'qingyun'],
      suppressQualified: ['qingyun', 'qingyun', 'luoxia', 'luoxia']
    } as never)
    p.sanitize()
    expect(p.suppressedRegions, '镇压表同一位只留一份').toEqual(['qingyun'])
    expect(p.suppressQualified, '资格表同一位只留一份').toEqual(['qingyun', 'luoxia'])
  })
})
