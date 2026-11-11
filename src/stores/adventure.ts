/** 历练状态 —— 区域解锁 / 历练会话 / 待处理事件 / 最近战报 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AdventureSession, CombatResult, CombatSideStats, FoeOrigin, FoeOriginPart, GNum } from '@/types'
import { persistConfig } from '@/utils/storage'
import { regionDef, unlockClosure } from '@/data/regions'

/**
 * 一场历练里各项计数的读档上界。
 *
 * 四个计数只用于显示(「胜 N 场 · 际遇 M 次 · 拾获 K 件」)。
 * 一场历练的胜场不可能过亿 —— 上界宽到不误伤正常档,窄到拦得住 `1e300` 那种坏档。
 */
const SESSION_COUNT_MAX = 1e8

/**
 * 敌人加成来源的读档上界(三维倍率 / 增伤减伤)。
 *
 * 正常值都有硬顶:厚化受构筑软上限约束,增伤减伤由判定的两个常量管着
 * (`CELESTIAL_JUDGE_CAP` 0.35 与 `CELESTIAL_SUPPRESS_BONUS` 0.25)。
 * 上界取「远高于真实值」—— 倍率 1000、增减伤 10,越过的必定是坏档。
 */
const FOE_ORIGIN_RATIO_MAX = 1000
const FOE_ORIGIN_EXTRA_MAX = 10

/** 一场战斗的回合数上界:真实是两位到三位数,取一万已极宽 */
const BATTLE_ROUNDS_MAX = 10_000
import {
  asBoundedGNum,
  asCombatRules,
  asFiniteNumber,
  asNumberRecord,
  asObjectOrNull,
  asRecord,
  asStringArray,
  asTimestamp,
} from '@/utils/saveShape'
import { EVENTS, FORTUNE_EVENTS, eventDef } from '@/data/events'
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
  // 世界规则会原样进 resolveCombat(mortalWorldGen 第 357 行),须按字段修形:
  // playerStartHpPct 写 Infinity/NaN 会让玩家一进战斗即判负(详见 saveShape 的说明)
  const rules = asCombatRules(w.rules)
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
  // 读档的 GNum 一律走 asBoundedGNum:gn 不限 e,坏档会让战报印出「1.00e1000000000」
  for (const key of SIDE_GNUM_KEYS) out[key] = asBoundedGNum(r[key])
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
  /*
   * 三个倍率都要有上界 —— 它们进战报文案(「三维 ×1.90 · 增伤 +35%」)。
   *
   * 正常值都有硬顶:`厚化` 受构筑软上限约束(实测量级在个位到几十),
   * `增伤/减伤` 由 `celestialJudgement` 算:judge 有 `CELESTIAL_JUDGE_CAP`(0.35)、
   * suppress 只可能是 0 或 0.25。故上界按「远高于真实值」取:
   * 倍率 1000、增减伤 10 —— 越过的必定是坏档。
   *
   * 不封顶的后果:坏档写 1e300 时战报印出「三维 ×1e+300 · 增伤 +1e+302%」。
   */
  return {
    label: o.label,
    ratio: asFiniteNumber(o.ratio, 1, 1, FOE_ORIGIN_RATIO_MAX),
    damageBonus: asFiniteNumber(o.damageBonus, 0, 0, FOE_ORIGIN_EXTRA_MAX),
    damageReduction: asFiniteNumber(o.damageReduction, 0, 0, FOE_ORIGIN_EXTRA_MAX),
    /*
     * parts 的 ratio **不能设下限 1**。
     *
     * 这一层记录的是「各件事各乘了多少」——既有增益也有减益:
     * 「危地 ×0.98」「弱于本层 ×0.9」都小于 1,而 `foeOriginPartsText`
     * 靠 `filter(p => p.ratio !== 1)` 决定显示哪几项 —— 把 0.98 抬成 1
     * 会让那条减益整条消失,战报的账就成了错的(审查意见指出的)。
     * 只封上界:倍数再大也不该超过 1000,而小于 1 是正常业务值。
     */
    parts: parts.map(p => ({ label: p.label, ratio: asFiniteNumber(p.ratio, 1, 0.01, FOE_ORIGIN_RATIO_MAX) })),
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
    /*
     * enemyId 声明为 string?,但此前只有 `...b` 原样带过来 —— 坏档塞个数字进来,
     * 界面上 `b.enemyId ? enemyLoreView(b.enemyId) : null` 会拿非字符串去查表。
     * 查表本身安全(BY_ID.get 返回 undefined),但类型契约是假的:
     * 后面任何一处 `enemyId.startsWith(...)` 之类都会当场炸。故按 string 收一遍。
     */
    enemyId: typeof b.enemyId === 'string' && b.enemyId ? b.enemyId : undefined,
    result: {
      ...r,
      win: r.win,
      log: r.log.filter(x => !!x && typeof x === 'object' && typeof x.text === 'string'),
      // 战报会印「胜于第 N 回合」「鏖战 N 回合」;坏档写 1e300 会印出巨大数字
      rounds: Math.floor(asFiniteNumber(r.rounds, 0, 0, BATTLE_ROUNDS_MAX)),
      playerHpPct: asFiniteNumber(r.playerHpPct, 0, 0, 1),
      // 两侧都补得回来才留遥测:只有一侧可读是坏档,分析面板按「无遥测」不渲染更安全
      stats: stats && stats.player && stats.enemy ? { player: stats.player, enemy: stats.enemy } : undefined,
      foeOrigin: sanitizeFoeOrigin(r.foeOrigin),
      firstMove: sanitizeFirstMove(r.firstMove)
    },
    at: asTimestamp(b.at, 0),
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
  const g = asBoundedGNum(v)
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
      /*
       * unlocked / cleared 都要按区域目录过滤。
       *
       * 同函数里 revived 与 clearedAt 早就这么做了(`filter(id => !!regionDef(id))`),
       * 只有这两个只做了去重 —— 手改存档塞 10 万条 id 后 $state 到 1.98MB / 989KB。
       * 这里可以安全过滤(不像事件记忆要兼容下线内容):区域 id 认得才能用,
       * 认不得的既进不了 unlockClosure,也渲染不出卡片。
       */
      unlocked.value = [...new Set(asStringArray(unlocked.value))].filter(id => !!regionDef(id))
      if (unlocked.value.length === 0) unlocked.value = ['qingyun']
      mortalCleared.value = [...new Set(asStringArray(mortalCleared.value))]
      cleared.value = [...new Set(asStringArray(cleared.value))].filter(id => !!regionDef(id))
      revived.value = asStringArray(revived.value).filter(id => !!regionDef(id) && !cleared.value.includes(id))
      /*
       * 通关时刻要按**时间戳**修形,不能只保底。
       *
       * 它不只用来显示:`worldMemory.regionTouchedAt` 拿它当「妖气复聚钟」的候选,
       * 而 `isRegionRevived` 判的是 `(now - touchedAt) / 3600_000 > 72`。
       * 坏档写 `1e300` 时这个减法恒为极大负数 —— **该地界永不复苏**
       * (实测复聚钟停在 1e300,isRegionRevived 恒假)。
       * `asTimestamp` 把超出 Date 可表示范围的值回落到 0,复聚钟随之退回其余候选。
       */
      clearedAt.value = Object.fromEntries(
        Object.entries(asNumberRecord(clearedAt.value, 0))
          .map(([id, at]) => [id, asTimestamp(at, 0)] as const)
          .filter(([id, at]) => at > 0 && !!regionDef(id))
      )
      // 旧档补票「前置已靖 → 此地已开」:解锁只在击败时发生,数据表新增的下游区域旧档开不了。幂等。
      unlocked.value = unlockClosure(unlocked.value, cleared.value)
      session.value = asObjectOrNull<AdventureSession>(session.value)
      // 会话每 tick 都读:endsAt / nextBattleAt 为 NaN 会永不停或立刻结束;区域认不得则结束会话
      if (session.value) {
        const s = session.value
        const regionOk = !!regionDef(s.regionId)
        const endsAt = asTimestamp(s.endsAt, 0)
        if (!regionOk || endsAt <= 0) {
          session.value = null
        } else {
          session.value = {
            ...s,
            mode: exploreModeOf(s.mode),
            startedAt: asTimestamp(s.startedAt, 0),
            endsAt,
            nextBattleAt: asTimestamp(s.nextBattleAt, 0),
            /*
             * 四个计数都加上界。它们只用于显示(「胜 N 场 · 际遇 M 次 · 拾获 K 件」),
             * 而 `sessionRecordText` 虽已改走 formatNum,单位表之外仍会印成 `1.00e300`。
             * 一场历练的胜场不可能过亿 —— 上界按「宽到不误伤、窄到拦坏档」取。
             */
            wins: Math.min(SESSION_COUNT_MAX, Math.floor(asFiniteNumber(s.wins, 0, 0))),
            losses: Math.min(SESSION_COUNT_MAX, Math.floor(asFiniteNumber(s.losses, 0, 0))),
            events: Math.min(SESSION_COUNT_MAX, Math.floor(asFiniteNumber(s.events, 0, 0))),
            itemGain: Math.min(SESSION_COUNT_MAX, Math.floor(asFiniteNumber(s.itemGain, 0, 0))),
            // 须经 asBoundedGNum 归一:坏 GNum 会让 exploration 的 add() 每场胜利都抛,历练永久卡死;
            // 它同时带指数上界,裸 gn() 不设界会让本世收益印出「1.00e1000000000」
            stoneGain: asBoundedGNum(s.stoneGain),
            expGain: asBoundedGNum(s.expGain)
          }
        }
      }
      // 认不出的待处理事件 id 须清:EventDialog 打不开,历练却被堵到 120 秒超时
      const pendingId = typeof pendingEventId.value === 'string' ? pendingEventId.value : null
      pendingEventId.value = pendingId && eventDef(pendingId) ? pendingId : null
      /*
       * 起钟落在未来会让 `now - pendingEventSince > 超时` 恒假 ——
       * **事件永不超时,历练永久堵塞**(`exploration.ts` 的自动结算那条分支进不去)。
       * 夹到此刻:最坏是让玩家多等一个超时窗口,而不是整局卡死。
       * `asFiniteNumber` 只管下限,不管方向。
       */
      pendingEventSince.value = pendingEventId.value
        ? Math.min(asFiniteNumber(pendingEventSince.value, 0, 0), Date.now())
        : 0
      // 事件记忆:times / lastAt 为 NaN 会让 LegacyView 乱序、写出「NaN 次际遇」。
      // 认不出的事件 id 不清:可能是改名 / 下线的旧档内容。
      /*
       * 但长度要有上界。写入路径(markEventSeen)有 `eventDef(id)` 这道闸,
       * 读档路径原先只有去重 —— 手改存档能塞进任意多条,实测 10 万条后
       * $state 序列化出来 1.49MB,存档直接顶到配额上限。
       *
       * 上界取事件目录规模的两倍:够容纳「改名/下线旧档」的残留,
       * 又远小于恶意膨胀的量级。超出的部分保留靠前的(它们才是真实玩过的)。
       */
      const SEEN_ONCE_CAP = (EVENTS.length + FORTUNE_EVENTS.length) * 2
      seenOnceEvents.value = [...new Set(asStringArray(seenOnceEvents.value))].slice(0, SEEN_ONCE_CAP)
      const fixedMemories: Record<string, import('@/types').EventMemory> = {}
      for (const [id, raw] of Object.entries(asRecord<unknown>(eventMemories.value))) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
        const m = raw as Partial<import('@/types').EventMemory>
        const times = Math.floor(asFiniteNumber(m.times, 0, 0))
        if (times <= 0) continue
        const lastAt = asTimestamp(m.lastAt, 0)
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
