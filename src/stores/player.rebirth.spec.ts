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
})
