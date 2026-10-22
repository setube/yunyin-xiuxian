/** 历练状态 —— 区域解锁 / 历练会话 / 待处理事件 / 最近战报 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AdventureSession, CombatResult, GNum } from '@/types'
import { persistConfig } from '@/utils/storage'
import { regionDef, unlockClosure } from '@/data/regions'
import { gn } from '@/utils/gnum'
import { asFiniteNumber, asNumberRecord, asObjectOrNull, asRecord, asStringArray } from '@/utils/saveShape'
import { eventDef } from '@/data/events'
import { exploreModeOf } from '@/core/exploreModes'

/**
 * 本世之界只收「结构完整、认得出」的那一份。
 *
 * 这份数据是生成器一次写成的,玩家永远不会逐字段改它 —— 形状不对只可能来自
 * 坏档/旧版。留着半份的代价不是「少看一点」:`worldView` 直接 map chain、
 * `worldIdentity` 读 `sorted[0]`,空链或非数组会让历练页与主页在渲染期抛错,
 * 整页白屏。故宁可整份丢掉(下次进页面会重新生成),也不让残骸进渲染。
 */
function sanitizeMortalWorld(raw: unknown): import('@/core/mortalWorldGen').MortalWorld | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const w = raw as Partial<import('@/core/mortalWorldGen').MortalWorld>
  if (!Array.isArray(w.chain) || w.chain.length === 0) return null
  if (typeof w.ruleId !== 'string' || typeof w.ruleName !== 'string' || typeof w.bias !== 'string') return null
  const chain: import('@/core/mortalWorldGen').MortalPlace[] = []
  for (const rawPlace of w.chain) {
    if (!rawPlace || typeof rawPlace !== 'object') return null
    const p = rawPlace as Partial<import('@/core/mortalWorldGen').MortalPlace>
    if (
      typeof p.nodeId !== 'string' ||
      typeof p.fromId !== 'string' ||
      typeof p.name !== 'string' ||
      typeof p.boss !== 'string' ||
      typeof p.archetype !== 'string' ||
      !Number.isFinite(p.tier) ||
      !Array.isArray(p.enemies) ||
      !Array.isArray(p.eventTags)
    ) {
      return null
    }
    chain.push({
      nodeId: p.nodeId,
      fromId: p.fromId,
      name: p.name,
      tier: p.tier as number,
      enemies: asStringArray(p.enemies),
      boss: p.boss,
      archetype: p.archetype,
      eventTags: asStringArray(p.eventTags)
    })
  }
  const rules = w.rules && typeof w.rules === 'object' && !Array.isArray(w.rules) ? w.rules : {}
  return {
    seed: asFiniteNumber(w.seed, 0),
    chain,
    shapeId: typeof w.shapeId === 'string' ? w.shapeId : '',
    shapeName: typeof w.shapeName === 'string' ? w.shapeName : '',
    rhythmId: typeof w.rhythmId === 'string' ? w.rhythmId : '',
    rhythmName: typeof w.rhythmName === 'string' ? w.rhythmName : '',
    ruleId: w.ruleId,
    ruleName: w.ruleName,
    rules,
    bias: w.bias,
    bossFallbackAt: Array.isArray(w.bossFallbackAt)
      ? w.bossFallbackAt.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
      : []
  }
}

/**
 * 上一场战报:渲染层直接读 `result.win / result.log / result.rounds`,
 * 形状坏掉就是整块战斗面板白屏。结果对象或日志不对,整份作废(旧档没有它也能活)。
 */
function sanitizeLastBattle(raw: unknown): LastBattleView | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const b = raw as Partial<LastBattleView>
  if (typeof b.enemyName !== 'string' || typeof b.enemyIcon !== 'string') return null
  const r = b.result as Partial<CombatResult> | undefined
  if (!r || typeof r !== 'object' || typeof r.win !== 'boolean' || !Array.isArray(r.log)) return null
  return {
    ...b,
    enemyName: b.enemyName,
    enemyIcon: b.enemyIcon,
    isBoss: b.isBoss === true,
    result: {
      ...r,
      win: r.win,
      log: r.log.filter(x => !!x && typeof x === 'object' && typeof x.text === 'string'),
      rounds: Math.max(0, Math.floor(asFiniteNumber(r.rounds, 0))),
      playerHpPct: Math.min(1, asFiniteNumber(r.playerHpPct, 0, 0))
    },
    at: asFiniteNumber(b.at, 0),
    loot: b.loot === undefined ? undefined : asStringArray(b.loot),
    enemyPower: b.enemyPower === undefined ? undefined : gnStrict(b.enemyPower),
    playerPower: b.playerPower === undefined ? undefined : gnStrict(b.playerPower)
  }
}

export interface LastBattleView {
  enemyName: string
  enemyIcon: string
  /** 敌人定义 id(供适配度展示;旧存档可能缺失) */
  enemyId?: string
  isBoss: boolean
  /** 敌方战力(开打那一刻有效快照折出,战斗卡片「敌 X · 我 Y」用;旧存档可能缺失) */
  enemyPower?: GNum
  /** 我方战力(战斗那一刻冻结 —— 卡片与敌力同刻比较,不拿战后的活数陪它站) */
  playerPower?: GNum
  result: CombatResult
  at: number
  /**
   * 这一场的战利品明细(残页/装备/丹药/法宝/灵草;翻倍提示也在内)。
   * 线上一向只把掉落条数记进会话、把文案丢掉,玩家打完看不到自己得了什么。
   * 旧存档没有这一栏,消费方按缺省空数组处理。
   */
  loot?: string[]
}

/** 战力栏修形:经 gn() 归一,归零即当作缺失(卡片 v-if 只看有值的 GNum 才渲染) */
function gnStrict(v: unknown): GNum | undefined {
  const g = gn(v as GNum)
  return g.m === 0 && g.e === 0 ? undefined : g
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
    /** 已靖起钟:妖气复聚(旧主归来)从这一刻算,见 core/regionRevival */
    const clearedAt = ref<Record<string, number>>({})
    /** 旧主已归来的地界(正待再靖);归来的不再是「已靖」 */
    const revived = ref<string[]>([])
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
      mortalCleared.value = [...new Set(asStringArray(mortalCleared.value))]
      cleared.value = [...new Set(asStringArray(cleared.value))]
      /**
       * 妖气复聚状态(Phase 30.11):两者都只认真存在的区域:
       * revived 与 cleared 互斥(归来的不再是「已靖」),坏档里若重叠以 cleared 为准收掉 revived。
       * clearedAt 是已靖起钟时刻,认不得/非正数一律丢弃(宁可晚复聚,不拿坏时刻误触)。
       */
      revived.value = asStringArray(revived.value).filter(id => !!regionDef(id) && !cleared.value.includes(id))
      clearedAt.value = Object.fromEntries(
        Object.entries(asNumberRecord(clearedAt.value, 0)).filter(([id, at]) => at > 0 && !!regionDef(id))
      )
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
            mode: exploreModeOf(s.mode),
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
      /**
       * 待处理事件按事件 id 认事:认不出的 id 弹窗永远打不开(EventDialog 查不到定义),
       * 历练却会被它一直堵着,直到 120 秒超时自动结算一个「不存在的事件」。
       * 认不出就清掉,让下一拍照常开战。
       */
      const pendingId = typeof pendingEventId.value === 'string' ? pendingEventId.value : null
      pendingEventId.value = pendingId && eventDef(pendingId) ? pendingId : null
      pendingEventSince.value = pendingEventId.value ? asFiniteNumber(pendingEventSince.value, 0, 0) : 0
      /**
       * 「一次就没了」的见闻与事件记忆都按事件 id 认事。
       * 记忆条目形状坏掉时,LegacyView 直接读 `m.times`/`m.lastAt` ——
       * `times` 是 NaN 就排在乱序、`lastAt` 是 NaN 就写出「NaN 次际遇」。
       * 同一条事件写两遍同理:余波文案按「完成过几次」分档,两行会各算各的。
       * 故这里按 id 合并取较大计数与较晚时刻,并把选择索引夹回选项数内。
       * 认不出的事件 id 不清:它可能是改名/下线的旧档内容,认得的部分照旧生效。
       */
      seenOnceEvents.value = [...new Set(asStringArray(seenOnceEvents.value))]
      const fixedMemories: Record<string, import('@/types').EventMemory> = {}
      for (const [id, raw] of Object.entries(asRecord<unknown>(eventMemories.value))) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
        const m = raw as Partial<import('@/types').EventMemory>
        const times = Math.floor(asFiniteNumber(m.times, 0, 0))
        if (times <= 0) continue
        const lastAt = asFiniteNumber(m.lastAt, 0, 0)
        const choiceCount = eventDef(id)?.choices.length ?? 0
        const rawIdx = Math.floor(asFiniteNumber(m.lastChoiceIdx, 0, 0))
        const lastChoiceIdx = choiceCount > 0 ? Math.min(choiceCount - 1, rawIdx) : 0
        const prev = fixedMemories[id]
        fixedMemories[id] = prev
          ? {
              eventId: id,
              times: Math.max(prev.times, times),
              lastAt: Math.max(prev.lastAt, lastAt),
              lastChoiceIdx: lastAt >= prev.lastAt ? lastChoiceIdx : prev.lastChoiceIdx
            }
          : { eventId: id, times, lastAt, lastChoiceIdx }
      }
      eventMemories.value = fixedMemories
      // 战报的 loot 是新增栏:形状不对就清成空表,别让损坏档在战报渲染里炸。
      // 两个战力栏同款修形:坏对象(含 m/e 非数)经 gn() 归零,归零即当作缺失 ——
      // 卡片 v-if 只认有值的 GNum,坏了就不渲染,格式GN 不会拿到坏数抛错
      lastBattle.value = sanitizeLastBattle(lastBattle.value)
      mortalWorld.value = sanitizeMortalWorld(mortalWorld.value)
    }

    const sessionActive = computed(() => session.value !== null)
    const currentRegion = computed(() => (session.value ? regionDef(session.value.regionId) : undefined))

    function setSession(s: AdventureSession | null): void {
      if (s === null) {
        session.value = null
        return
      }
      if (!regionDef(s.regionId)) return
      if (!Number.isFinite(s.endsAt) || !Number.isFinite(s.nextBattleAt)) return
      session.value = s
    }

    function unlock(regionId: string): boolean {
      if (!regionDef(regionId)) return false
      if (unlocked.value.includes(regionId)) return false
      unlocked.value = [...unlocked.value, regionId]
      return true
    }

    function markCleared(regionId: string): boolean {
      if (!regionDef(regionId)) return false
      if (cleared.value.includes(regionId)) return false
      cleared.value = [...cleared.value, regionId]
      // 已靖即起钟:妖气从这一刻重新聚(离线斩首也走这里,故离线也认得这个起点)
      clearedAt.value = { ...clearedAt.value, [regionId]: Date.now() }
      // 再靖:收掉此地的「旧主归来」标记 —— 已归过一次,复位待下一次复聚
      if (revived.value.includes(regionId)) revived.value = revived.value.filter(id => id !== regionId)
      return true
    }

    /**
     * 妖气复聚:该地界不再「已靖」,旧主归来(见 core/regionRevival)。
     *
     * 只动「已靖」与起钟:镇压资格是永久的,松开镇压由 core 单独做 ——
     * 复聚不构成对挂机的惩罚。
     */
    function markRevived(regionId: string): boolean {
      if (!regionDef(regionId)) return false
      if (revived.value.includes(regionId)) return false
      cleared.value = cleared.value.filter(id => id !== regionId)
      const nextAt = { ...clearedAt.value }
      delete nextAt[regionId]
      clearedAt.value = nextAt
      revived.value = [...revived.value, regionId]
      return true
    }

    function setPendingEvent(id: string | null, now: number): void {
      if (id !== null && !eventDef(id)) return
      if (id !== null && (!Number.isFinite(now) || now < 0)) return
      pendingEventId.value = id
      pendingEventSince.value = id ? now : 0
    }

    /**
     * 暂停恢复:把按墙钟到期的历练状态顺延暂停时长。
     *
     * 暂停期间心跳不结算,但会话的 endsAt / nextBattleAt 仍是墙钟 ——
     * 不顺延的话,开着重置 / 导入确认窗几分钟,回来这一程就「自己走完」了。
     * 已靖起钟与待处理事件的超时同样顺延,免得暂停吃掉复聚与自动处置的宽限。
     */
    function shiftTimedState(pausedMs: number): void {
      if (!Number.isFinite(pausedMs) || pausedMs <= 0) return
      if (session.value) {
        session.value = {
          ...session.value,
          endsAt: session.value.endsAt + pausedMs,
          nextBattleAt: session.value.nextBattleAt + pausedMs
        }
      }
      const nextAt: Record<string, number> = {}
      for (const [id, at] of Object.entries(clearedAt.value)) {
        nextAt[id] = at > 0 ? at + pausedMs : at
      }
      clearedAt.value = nextAt
      if (pendingEventSince.value > 0) pendingEventSince.value += pausedMs
    }

    function markEventSeen(id: string): void {
      if (!eventDef(id)) return
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
      if (typeof nodeId !== 'string' || nodeId === '') return false
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
      clearedAt,
      revived,
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
      markRevived,
      setPendingEvent,
      shiftTimedState,
      markEventSeen,
      recordBattle,
      sanitize
    }
  },
  { persist: persistConfig('adventure') }
)
