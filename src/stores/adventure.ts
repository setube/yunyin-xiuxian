/** 历练状态 —— 区域解锁 / 历练会话 / 待处理事件 / 最近战报 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AdventureSession, CombatResult } from '@/types'
import { persistConfig } from '@/utils/storage'
import { regionDef, unlockClosure } from '@/data/regions'
import { gn } from '@/utils/gnum'
import { asFiniteNumber, asObjectOrNull, asRecord, asStringArray } from '@/utils/saveShape'

export interface LastBattleView {
  enemyName: string
  enemyIcon: string
  /** 敌人定义 id(供适配度展示;旧存档可能缺失) */
  enemyId?: string
  isBoss: boolean
  result: CombatResult
  at: number
  /**
   * 这一场的战利品明细(残页/装备/丹药/法宝;翻倍提示也在内)。
   * 线上一向只把掉落条数记进会话、把文案丢掉,玩家打完看不到自己得了什么。
   * 旧存档没有这一栏,消费方按缺省空数组处理。
   */
  loot?: string[]
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

    /** 存档修复:历练会话/解锁表/事件记忆被写坏会让历练页在渲染期抛错 */
    function sanitize(): void {
      unlocked.value = asStringArray(unlocked.value)
      if (unlocked.value.length === 0) unlocked.value = ['qingyun']
      mortalCleared.value = asStringArray(mortalCleared.value)
      cleared.value = asStringArray(cleared.value)
      /**
       * 旧档补票(境界扩界)—— 「前置已靖 → 此地已开」。
       *
       * 解锁从前只在击败那一刻发生,故数据表后来长出来的下游(仙界 21 起)
       * 对旧档永远开不了:鸿蒙裂隙已靖、首领不复现,而云海仙门还挂着
       * 「需先击败鸿蒙裂隙之主」。这不是「写坏了」,是**新版本欠旧档一张票**,
       * 与 engine 里的 seedLoreIfNeeded 同类,故放在同一个读档修复口上。
       * 幂等:重复读档不重复补。
       */
      unlocked.value = unlockClosure(unlocked.value, cleared.value)
      session.value = asObjectOrNull<AdventureSession>(session.value)
      /**
       * 历练会话是引擎每 tick 都要读的活状态:endsAt/nextBattleAt 若为 NaN,
       * 历练会永远不停(或立刻结束);regionId 认不得则整场都取不到区域。
       * 故除形状外,值也要修 —— 认不得的区域直接结束会话,不硬撑。
       */
      if (session.value) {
        const s = session.value
        const regionOk = !!regionDef(s.regionId)
        const endsAt = asFiniteNumber(s.endsAt, 0, 0)
        if (!regionOk || endsAt <= 0) {
          session.value = null
        } else {
          session.value = {
            ...s,
            mode: s.mode === 'deep' || s.mode === 'risky' ? s.mode : 'normal',
            startedAt: asFiniteNumber(s.startedAt, 0, 0),
            endsAt,
            nextBattleAt: asFiniteNumber(s.nextBattleAt, 0, 0),
            wins: Math.floor(asFiniteNumber(s.wins, 0, 0)),
            losses: Math.floor(asFiniteNumber(s.losses, 0, 0)),
            events: Math.floor(asFiniteNumber(s.events, 0, 0)),
            itemGain: Math.floor(asFiniteNumber(s.itemGain, 0, 0)),
            // 两个 GNum 累加器经 gn() 归一:null/原始数字/坏对象一律归零。
            // 漏掉这步的话,损坏档首胜时 exploration 的 add(s.stoneGain,…) 会在 .m 上炸,
            // 被 tickSafe 吞掉后每场胜利都抛、历练永久卡死
            stoneGain: gn(s.stoneGain),
            expGain: gn(s.expGain)
          }
        }
      }
      pendingEventId.value = typeof pendingEventId.value === 'string' ? pendingEventId.value : null
      pendingEventSince.value = asFiniteNumber(pendingEventSince.value, 0, 0)
      seenOnceEvents.value = asStringArray(seenOnceEvents.value)
      // 战报的 loot 是新增栏:形状不对就清成空表,别让损坏档在战报渲染里炸
      const lb = asObjectOrNull<LastBattleView>(lastBattle.value)
      lastBattle.value = lb ? { ...lb, loot: lb.loot === undefined ? undefined : asStringArray(lb.loot) } : null
      eventMemories.value = asRecord(eventMemories.value)
      mortalWorld.value = asObjectOrNull(mortalWorld.value)
    }

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
      recordBattle,
      sanitize
    }
  },
  { persist: persistConfig('adventure') }
)
