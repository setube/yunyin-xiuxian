/**
 * 删档重修后境界称号能否再解锁(玩家反馈:「删档重修后化神称号无法解锁」)。
 *
 * 称号由境界成就随手到(progress.trackRealm → unlockAchievement → grantReward →
 * quests.ownTitle)。成就与 titleOwned 都随「清空存档」一并清掉(见 utils/storage
 * 的 PERSISTED_STORES 与 clearAllSave),所以重修到同一境应能再次解锁。
 *
 * 清档这段不是换成空 pinia 凑数 —— 那样防不住「clearAllSave 本身坏了」:
 * 本档用真·持久化回路跑一遍 解锁 → 落盘 → 清档 → 从磁盘重建 → 重解锁,
 * 任一环(成就没落盘 / 清档漏删 quests 分片 / 重建还带出旧成就)都逃不过。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { trackRealm } from './progress'
import { clearAllSave, flushSaveWrites, storageKey, PERSISTED_STORES } from '@/utils/storage'

/** 一份能进存档的内存 localStorage */
function installStorage(): void {
  const disk = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => void disk.set(k, v),
    removeItem: (k: string) => void disk.delete(k),
    clear: () => disk.clear(),
    key: () => null,
    length: 0
  })
}

/** 真 pinia + 真持久化插件:让 store 与存档之间那条路完整跑起来 */
function bootStores(): void {
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  createApp({ render: () => null }).use(pinia)
  setActivePinia(pinia)
}

function reachHuashen(major = 4): void {
  const player = usePlayerStore()
  player.major = major
  trackRealm()
}

describe('境界称号 · 清档重修可再解锁', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('首轮到化神:达成成就并获得 ti_huashen', () => {
    reachHuashen()
    const quests = useQuestsStore()
    expect(quests.hasAchieved('a_r4')).toBe(true)
    expect(quests.titlesOwned).toContain('ti_huashen')
  })

  it('真·清档重修:解锁落盘 → 清空 → 从磁盘重建 → 再解锁', async () => {
    installStorage()
    bootStores()
    reachHuashen()
    // 持久化插件的订阅走 Vue 调度器(微任务),得等一拍才落进待写队列
    await nextTick()
    flushSaveWrites()

    // 一号局:称号已到手,且已真正写进磁盘(不然下面的清档是空转)
    expect(useQuestsStore().titlesOwned).toContain('ti_huashen')
    const questsKey = storageKey('quests')
    expect(localStorage.getItem(questsKey), '清档前成就该已落盘').not.toBeNull()

    // 清空存档:跑生产代码,不是换空 pinia
    clearAllSave()
    expect(
      PERSISTED_STORES.filter(id => localStorage.getItem(storageKey(id)) !== null),
      '清档要真把每片都删干净'
    ).toEqual([])

    // 重建:从干净的磁盘起一个新世界(模拟玩家清档后重进游戏)
    bootStores()
    const player = usePlayerStore()
    const quests = useQuestsStore()
    expect(player.major, '新档应从零开始').toBe(0)
    expect(quests.hasAchieved('a_r4'), '清档后成就不应在内').toBe(false)
    expect(quests.titlesOwned, '清档后称号不应残留').not.toContain('ti_huashen')

    // 重修到化神:要能再次解锁
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
