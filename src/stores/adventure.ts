/** 历练状态 —— 区域解锁 / 探索会话 / 待处理事件 / 最近战报 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AdventureSession, CombatResult } from '@/types'
import { persistConfig } from '@/utils/storage'
import { regionDef } from '@/data/regions'

export interface LastBattleView {
  enemyName: string
  enemyIcon: string
  /** 敌人定义 id(供适配度展示;旧存档可能缺失) */
  enemyId?: string
  isBoss: boolean
  result: CombatResult
  at: number
}

export const useAdventureStore = defineStore(
  'adventure',
  () => {
    const unlocked = ref<string[]>(['qingyun'])
    /**
     * 本世之界(Phase 34)—— 这一世的世界气象。
     *
     * 由 mortalWorldGen 生成并过四门验收,转世时重新生成。
     * 目前只承载展示:让玩家在打第一场之前就知道「这一世不是上一世那一套」。
     * 实际历练仍走 REGIONS,两者通过 fromId 对应
     */
    const mortalWorld = ref<import('@/core/mortalWorldGen').MortalWorld | null>(null)
    /**
     * 本世已通的路线节点。
     *
     * 与 cleared(旧 REGIONS 通关记录)分开:本世路线的推进只认这里,
     * 转世换界时清空 —— 新的天地要从第一段重新走
     */
    const mortalCleared = ref<string[]>([])
    const cleared = ref<string[]>([])
    const session = ref<AdventureSession | null>(null)
    const pendingEventId = ref<string | null>(null)
    const pendingEventSince = ref(0)
    const seenOnceEvents = ref<string[]>([])
    const lastBattle = ref<LastBattleView | null>(null)
    /** Phase 30.9 世界记忆:已完成事件的结果记录 */
    const eventMemories = ref<Record<string, import('@/types').EventMemory>>({})

    const sessionActive = computed(() => session.value !== null)
    const currentRegion = computed(() => (session.value ? regionDef(session.value.regionId) : undefined))

    function setSession(s: AdventureSession | null): void {
      session.value = s
    }

    function unlock(regionId: string): boolean {
      if (unlocked.value.includes(regionId)) return false
      unlocked.value = [...unlocked.value, regionId]
      return true
    }

    function markCleared(regionId: string): boolean {
      if (cleared.value.includes(regionId)) return false
      cleared.value = [...cleared.value, regionId]
      return true
    }

    function setPendingEvent(id: string | null, now: number): void {
      pendingEventId.value = id
      pendingEventSince.value = id ? now : 0
    }

    function markEventSeen(id: string): void {
      if (!seenOnceEvents.value.includes(id)) {
        seenOnceEvents.value = [...seenOnceEvents.value, id]
      }
    }

    function recordBattle(view: LastBattleView): void {
      lastBattle.value = view
    }

    function setMortalWorld(w: import('@/core/mortalWorldGen').MortalWorld | null): void {
      mortalWorld.value = w
      // 换界即换路:本世进度不跨界继承
      mortalCleared.value = []
    }

    /** 标记本世某节点已通;已通过则返回 false */
    function markNodeCleared(nodeId: string): boolean {
      if (mortalCleared.value.includes(nodeId)) return false
      mortalCleared.value = [...mortalCleared.value, nodeId]
      return true
    }

    return {
      mortalWorld,
      mortalCleared,
      setMortalWorld,
      markNodeCleared,
      unlocked,
      cleared,
      session,
      pendingEventId,
      pendingEventSince,
      seenOnceEvents,
      lastBattle,
      eventMemories,
      sessionActive,
      currentRegion,
      setSession,
      unlock,
      markCleared,
      setPendingEvent,
      markEventSeen,
      recordBattle
    }
  },
  { persist: persistConfig('adventure') }
)
