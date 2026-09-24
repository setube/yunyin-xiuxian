/**
 * 删档重修后境界称号能否再解锁(玩家反馈:「删档重修后化神称号无法解锁」)。
 *
 * 称号由境界成就随手到(progress.trackRealm → unlockAchievement → grantReward →
 * quests.ownTitle)。成就与 titleOwned 都随「清空存档」一并清掉(见 utils/storage
 * 的 PERSISTED_STORES 与 clearAllSave),所以重修到同一境应能再次解锁。
 * 这条规格把「首次解锁 → 清档 → 重修再解锁」的完整回路钉死,
 * 防止任何一方(如成就已达成标志没清干净、或 ownTitle 记成永久)把玩家锁死在门外。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { trackRealm } from './progress'

describe('境界称号 · 清档重修可再解锁', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function reachHuashen(major = 4): void {
    const player = usePlayerStore()
    player.major = major
    trackRealm()
  }

  it('首轮到化神:达成成就并获得 ti_huashen', () => {
    reachHuashen()
    const quests = useQuestsStore()
    expect(quests.hasAchieved('a_r4')).toBe(true)
    expect(quests.titlesOwned).toContain('ti_huashen')
  })

  it('清档重修后再到化神:依旧能重新解锁', () => {
    reachHuashen()
    expect(useQuestsStore().titlesOwned).toContain('ti_huashen')

    // 模拟「清空存档」:全新的 pinia = 全部从零
    setActivePinia(createPinia())
    const player = usePlayerStore()
    const quests = useQuestsStore()
    expect(player.major, '新档应从零开始').toBe(0)
    expect(quests.hasAchieved('a_r4'), '清档后成就不应残留').toBe(false)
    expect(quests.titlesOwned, '清档后称号不应残留').not.toContain('ti_huashen')

    // 重修到化神
    reachHuashen()
    expect(quests.hasAchieved('a_r4'), '重修后成就要能再次达成').toBe(true)
    expect(quests.titlesOwned, '重修后称号要能再次入手').toContain('ti_huashen')
  })

  it('同一世重复触发不重复发放(成就保持已达成)', () => {
    reachHuashen()
    const quests = useQuestsStore()
    const countBefore = quests.titlesOwned.filter(t => t === 'ti_huashen').length
    reachHuashen()
    const countAfter = quests.titlesOwned.filter(t => t === 'ti_huashen').length
    expect(countAfter).toBe(countBefore)
    expect(quests.titlesOwned.filter(t => t === 'ti_huashen').length).toBe(1)
  })
})
