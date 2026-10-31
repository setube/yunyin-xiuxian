/** 历练状态 —— 区域解锁 / 历练会话 / 待处理事件 / 最近战报 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AdventureSession, CombatResult, CombatSideStats, FoeOrigin, FoeOriginPart, GNum } from '@/types'
import { persistConfig } from '@/utils/storage'
import { regionDef, unlockClosure } from '@/data/regions'
import { gn } from '@/utils/gnum'
import { asFiniteNumber, asNumberRecord, asObjectOrNull, asRecord, asStringArray } from '@/utils/saveShape'
import { eventDef } from '@/data/events'
import { exploreModeOf } from '@/core/exploreModes'

/**
 * 本世之界只收结构完整的一份,否则整份丢弃(下次进页面重新生成)。
 * 空链 / 非数组会让 `worldView`、`worldIdentity` 在渲染期抛错,历练页与主页白屏。
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

/** CombatSideStats 里全部 GNum 字段;缺一项,战斗分析的 formatGN 就会读到 undefined.m */
const SIDE_GNUM_KEYS = [
  'dealt',
  'taken',
  'pierceTaken',
  'biggestHitTaken',
  'healed',
  'shieldAbsorbed'
] as const
/** 计数类字段,非有限值归零 */
const SIDE_COUNT_KEYS = [
  'dodges',
  'missedHits',
  'hitsLanded',
  'counters',
  'combos',
  'crits',
  'skillCasts',
  'artifactProcs',
  'stunnedTurns'
] as const

/**
 * 战报遥测修形:旧档可能缺后加字段或写成 null,分析面板直接读 `dealt.m`。
 * 坏到补不出侧数据即整份丢弃(与 stats 缺失同义:分析面板按「无遥测」不渲染)。
 */
function sanitizeSideStats(raw: unknown): CombatSideStats | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const out = {} as Record<string, GNum | number>
  for (const key of SIDE_GNUM_KEYS) out[key] = gn(r[key] as GNum)
  for (const key of SIDE_COUNT_KEYS) out[key] = Math.max(0, Math.floor(asFiniteNumber(r[key], 0)))
  return out as unknown as CombatSideStats
}

/** 敌人加成来源修形:parts 里的倍率进文案与比值,坏形即整条丢弃(报「无加成」比抛错好) */
function sanitizeFoeOrigin(raw: unknown): FoeOrigin | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const o = raw as Partial<FoeOrigin>
  if (typeof o.label !== 'string') return undefined
  const parts = Array.isArray(o.parts)
    ? o.parts.filter(
        (p): p is FoeOriginPart =>
          !!p && typeof p === 'object' && typeof p.label === 'string' && Number.isFinite(p.ratio)
      )
    : []
  return {
    label: o.label,
    ratio: asFiniteNumber(o.ratio, 1, 1),
    damageBonus: asFiniteNumber(o.damageBonus, 0, 0),
    damageReduction: asFiniteNumber(o.damageReduction, 0, 0),
    parts,
    note: typeof o.note === 'string' ? o.note : ''
  }
}

/** 先手判定修形:两个速度直接进读数,非有限值即丢这一项 */
function sanitizeFirstMove(raw: unknown): CombatResult['firstMove'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const f = raw as Record<string, unknown>
  if (typeof f.playerFirst !== 'boolean') return undefined
  const playerSpeed = asFiniteNumber(f.playerSpeed, NaN)
  const enemySpeed = asFiniteNumber(f.enemySpeed, NaN)
  if (!Number.isFinite(playerSpeed) || !Number.isFinite(enemySpeed)) return undefined
  return { playerFirst: f.playerFirst, playerSpeed, enemySpeed }
}

/** 上一场战报修形:渲染层直接读 `result.win / log / rounds`,结果或日志坏则整份作废 */
function sanitizeLastBattle(raw: unknown): LastBattleView | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const b = raw as Partial<LastBattleView>
  if (typeof b.enemyName !== 'string' || typeof b.enemyIcon !== 'string') return null
  const r = b.result as Partial<CombatResult> | undefined
  if (!r || typeof r !== 'object' || typeof r.win !== 'boolean' || !Array.isArray(r.log)) return null
  const stats = r.stats
    ? { player: sanitizeSideStats(r.stats.player), enemy: sanitizeSideStats(r.stats.enemy) }
    : null
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
      playerHpPct: Math.min(1, asFiniteNumber(r.playerHpPct, 0, 0)),
      // 两侧都补得回来才留遥测:只有一侧可读是坏档,分析面板按「无遥测」不渲染更安全
      stats: stats && stats.player && stats.enemy ? { player: stats.player, enemy: stats.enemy } : undefined,
      foeOrigin: sanitizeFoeOrigin(r.foeOrigin),
      firstMove: sanitizeFirstMove(r.firstMove)
    },
    at: asFiniteNumber(b.at, 0),
    loot: b.loot === undefined ? undefined : asStringArray(b.loot),
    enemyPower: b.enemyPower === undefined ? undefined : gnStrict(b.enemyPower),
    playerPower: b.playerPower === undefined ? undefined : gnStrict(b.playerPower),
    foeKnown: typeof b.foeKnown === 'boolean' ? b.foeKnown : undefined
  }
}

export interface LastBattleView {
  enemyName: string
  enemyIcon: string
  /** 敌人定义 id(供适配度展示;旧存档可能缺失) */
  enemyId?: string
  isBoss: boolean
  /** 敌方战力:开打那一刻的快照(战斗卡片用;旧存档可能缺失) */
  enemyPower?: GNum
  /** 我方战力:战斗那一刻冻结,与敌方战力同刻比较,不取战后值 */
  playerPower?: GNum
  /** 开打那一刻是否已眼熟(战斗页特性 / 星级的门);旧存档可能缺失 */
  foeKnown?: boolean
  result: CombatResult
  at: number
  /** 本场战利品明细(含翻倍提示);旧存档无此栏,按空数组处理 */
  loot?: string[]
}

/** 战力栏修形:gn() 归一,归零视为缺失(卡片 v-if 只渲染有值的 GNum) */
function gnStrict(v: unknown): GNum | undefined {
  const g = gn(v as GNum)
  return g.m === 0 && g.e === 0 ? undefined : g
}

export const useAdventureStore = defineStore(
  'adventure',
  () => {
    const unlocked = ref<string[]>(['qingyun'])
    /**
     * 本世之界:mortalWorldGen 生成并过四门验收,转世重新生成。
     * 只承载展示;实际历练走 REGIONS,经 fromId 对应。
     */
    const mortalWorld = ref<import('@/core/mortalWorldGen').MortalWorld | null>(null)
    /** 本世已通的路线节点;与 cleared(REGIONS 通关记录)分开,换界时清空 */
    const mortalCleared = ref<string[]>([])
    const cleared = ref<string[]>([])
    /** 已靖起钟:妖气复聚(旧主归来)从这一刻算,见 core/regionRevival */
    const clearedAt = ref<Record<string, number>>({})
    /** 旧主已归来的地界(待再靖);与 cleared 互斥 */
    const revived = ref<string[]>([])
    const session = ref<AdventureSession | null>(null)
    const pendingEventId = ref<string | null>(null)
    const pendingEventSince = ref(0)
    const seenOnceEvents = ref<string[]>([])
    const lastBattle = ref<LastBattleView | null>(null)
    /** 世界记忆:已完成事件的结果记录 */
    const eventMemories = ref<Record<string, import('@/types').EventMemory>>({})

    /** 存档修复:历练会话/解锁表/事件记忆被写坏会让历练页在渲染期抛错 */
    function sanitize(): void {
      unlocked.value = asStringArray(unlocked.value)
      if (unlocked.value.length === 0) unlocked.value = ['qingyun']
      mortalCleared.value = [...new Set(asStringArray(mortalCleared.value))]
      cleared.value = [...new Set(asStringArray(cleared.value))]
      revived.value = asStringArray(revived.value).filter(id => !!regionDef(id) && !cleared.value.includes(id))
      clearedAt.value = Object.fromEntries(
        Object.entries(asNumberRecord(clearedAt.value, 0)).filter(([id, at]) => at > 0 && !!regionDef(id))
      )
      // 旧档补票「前置已靖 → 此地已开」:解锁只在击败时发生,数据表新增的下游区域旧档开不了。幂等。
      unlocked.value = unlockClosure(unlocked.value, cleared.value)
      session.value = asObjectOrNull<AdventureSession>(session.value)
      // 会话每 tick 都读:endsAt / nextBattleAt 为 NaN 会永不停或立刻结束;区域认不得则结束会话
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
            // 须经 gn() 归一:坏 GNum 会让 exploration 的 add() 每场胜利都抛,历练永久卡死
            stoneGain: gn(s.stoneGain),
            expGain: gn(s.expGain)
          }
        }
      }
      // 认不出的待处理事件 id 须清:EventDialog 打不开,历练却被堵到 120 秒超时
      const pendingId = typeof pendingEventId.value === 'string' ? pendingEventId.value : null
      pendingEventId.value = pendingId && eventDef(pendingId) ? pendingId : null
      pendingEventSince.value = pendingEventId.value ? asFiniteNumber(pendingEventSince.value, 0, 0) : 0
      // 事件记忆:times / lastAt 为 NaN 会让 LegacyView 乱序、写出「NaN 次际遇」。
      // 认不出的事件 id 不清:可能是改名 / 下线的旧档内容。
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
      // 离线斩首也走这里起钟
      clearedAt.value = { ...clearedAt.value, [regionId]: Date.now() }
      if (revived.value.includes(regionId)) revived.value = revived.value.filter(id => id !== regionId)
      return true
    }

    /**
     * 妖气复聚(见 core/regionRevival):只动「已靖」与起钟。
     * 镇压资格永久,松开镇压由 core 单独做。
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

    /** 暂停恢复:会话、已靖起钟、待处理事件超时都按墙钟,须顺延暂停时长 */
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
