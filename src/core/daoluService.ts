/**
 * 道侣服务。关系值只转化为事件概率与选项资格,不转化为任何数值;本文件不得出现:
 *   - StatMods / 任何属性键(45 个属性键全部可达 cultivationSpeed)
 *   - addDaoFruit / addInsight
 *   - 资源发放(灵石/丹药/材料)
 *   - cultivationSpeed 相关
 * spec 钉:daoluService.spec.ts 扫描本文件源码。
 */
import {
  DAOLU,
  type BondEnding,
  type BondStage,
  type DaoluDef,
  STAGE_GATES,
  STAGE_NAMES,
  bondText,
  daoluDef,
  stageIndex
} from '@/data/daolu'
import {
  BOND_EVENTS,
  type BondEventDef,
  bondEventDef,
  bondEventView,
  type BondTrigger,
  leanFromCounters,
  resolveChoice,
  sheDecidesNow
} from '@/data/bondEvents'
import type { DaoLean } from '@/data/daolu'
import {
  type BondIntent,
  INTENT_MIN_STAGE,
  type IntentAftermath,
  type IntentResponse,
  type IntentSpark,
  intentFor,
  respondTo,
  sparkDelta,
  willSpeak
} from '@/data/bondIntent'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { useUiStore } from '@/stores/ui'
import { rng, type RandomService } from '@/utils/random'

/** 本世关系(存档结构) */
export interface BondState {
  daoluId: string
  stage: BondStage
  /** 缘分 0~100 */
  fate: number
  /** 信任 0~100 */
  trust: number
  /** 道心契合 0~100 */
  accord: number
  /** 共历次数 */
  shared: number
  /** 初遇时刻 */
  metAt: number
  fallen: boolean
  /** 本世已经历的共同事件 */
  doneEvents: string[]
  /** 待决事件;由历练情境写入,不由打开界面触发 */
  pendingEventId?: string | null
  /** 已累积的机会点(每次历练情境 +1) */
  opportunities: number
  /** 下一次可提供事件的机会点门槛 */
  nextEventAt: number
  /** 上一次冲突的类型,避免连续同类 */
  lastKind?: string | null
  /** 已离开:关系冻结,履历仍记 */
  departed?: boolean
  /** 道侣自己的意图;由经历催生,与世界情境无关 */
  intent?: BondIntent | null
  /** 已开口,待回应 */
  intentPending?: boolean
}

/** 一世结束后的履历记录 */
export interface BondRecord {
  daoluId: string
  name: string
  stage: BondStage
  ending: BondEnding
  shared: number
}

const CAP = 100
/** 两件共同事件之间至少相隔的机会点数。按机会点而非时间计,挂机不刷事件 */
const EVENT_GAP = 6

function clamp(n: number): number {
  return Math.max(0, Math.min(CAP, Math.round(n)))
}

/** 本世的关系;未遇见任何人时为 null */
export function currentBond(): BondState | null {
  return usePlayerStore().bond
}

export function currentDaolu(): DaoluDef | null {
  const b = currentBond()
  return b ? (daoluDef(b.daoluId) ?? null) : null
}

// ============ 相遇 ============

/** 这一世可能遇见谁:按道侣偏好的地貌是否在本世路线上筛选 */
export function candidatesFor(terrains: readonly string[]): DaoluDef[] {
  const seen = new Set(terrains)
  return DAOLU.filter(d => d.terrains.length === 0 || d.terrains.some(t => seen.has(t)))
}

/** 宿缘:上一世走得深的人,这一世有概率再遇;不保证重逢 */
export function destinedCandidate(history: readonly BondRecord[], terrains: readonly string[]): DaoluDef | null {
  const deep = history.filter(r => stageIndex(r.stage) >= stageIndex('pledged'))
  if (deep.length === 0) return null
  const chance = Math.min(0.35, 0.08 * deep.length)
  if (!rng.chance(chance)) return null
  const pick = deep[rng.int(0, deep.length - 1)]!
  const def = daoluDef(pick.daoluId)
  if (!def) return null
  return candidatesFor(terrains).some(c => c.id === def.id) ? def : null
}

export function meet(daoluId: string, now = Date.now()): boolean {
  const player = usePlayerStore()
  if (player.bond) return false
  const def = daoluDef(daoluId)
  if (!def) return false
  player.setBond({
    daoluId,
    stage: 'met',
    fate: 10,
    trust: 5,
    accord: 30,
    shared: 0,
    metAt: now,
    fallen: false,
    doneEvents: [],
    pendingEventId: null,
    opportunities: 0,
    nextEventAt: EVENT_GAP,
    lastKind: null
  })
  useUiStore().toast(`遇见${def.name}`, 'info')
  return true
}

// ============ 关系推进 ============

/** 一次互动对三维的影响 */
export interface BondDelta {
  fate?: number
  trust?: number
  accord?: number
  /** 是否记为一次共历 */
  shared?: boolean
}

/** 推进关系;三维各自独立变化 */
export function advanceBond(delta: BondDelta): BondState | null {
  const player = usePlayerStore()
  const b = player.bond
  if (!b || b.fallen || b.departed) return null
  const next: BondState = {
    ...b,
    fate: clamp(b.fate + (delta.fate ?? 0)),
    trust: clamp(b.trust + (delta.trust ?? 0)),
    accord: clamp(b.accord + (delta.accord ?? 0)),
    shared: b.shared + (delta.shared ? 1 : 0)
  }
  next.stage = highestReachable(next)
  player.setBond(next)
  if (stageIndex(next.stage) > stageIndex(b.stage)) {
    const def = daoluDef(b.daoluId)
    useUiStore().toast(`${def?.name ?? '道侣'}·${STAGE_NAMES[next.stage]}`, 'rare')
  }
  return next
}

/** 当前三维能支撑到哪一阶 */
export function highestReachable(b: BondState): BondStage {
  let out: BondStage = 'met'
  for (const g of STAGE_GATES) {
    if (b.fate >= g.fate && b.trust >= g.trust && b.accord >= g.accord && b.shared >= g.shared) out = g.stage
  }
  return out
}

/** 距离下一阶还差什么;仅供界面提示 */
export function nextGateHint(): { stage: BondStage; lacking: string[] } | null {
  const b = currentBond()
  if (!b) return null
  const i = stageIndex(b.stage)
  const next = STAGE_GATES.find(g => stageIndex(g.stage) === i + 1)
  if (!next) return null
  const lacking: string[] = []
  if (b.fate < next.fate) lacking.push('缘分尚浅')
  if (b.trust < next.trust) lacking.push('信任不足')
  if (b.accord < next.accord) lacking.push('道心未契')
  if (b.shared < next.shared) lacking.push('共历太少')
  return { stage: next.stage, lacking }
}

// ============ 分离与结局 ============

/** 道侣于本世陨落 */
export function fall(): BondRecord | null {
  const player = usePlayerStore()
  const b = player.bond
  if (!b || b.fallen) return null
  const def = daoluDef(b.daoluId)
  player.setBond({ ...b, fallen: true })
  useUiStore().toast(`${def?.name ?? '道侣'}已殁`, 'warn')
  return { daoluId: b.daoluId, name: def?.name ?? b.daoluId, stage: b.stage, ending: 'perished', shared: b.shared }
}

/** 主动分道 */
export function part(): BondRecord | null {
  const player = usePlayerStore()
  const b = player.bond
  if (!b) return null
  const def = daoluDef(b.daoluId)
  player.setBond(null)
  return { daoluId: b.daoluId, name: def?.name ?? b.daoluId, stage: b.stage, ending: 'parted', shared: b.shared }
}

/** 转世归档:由 confirmReincarnation 调用;清空当前关系,只产出一条履历记录,不产出任何资源 */
export function archiveBond(): BondRecord | null {
  const player = usePlayerStore()
  const b = player.bond
  if (!b) return null
  const def = daoluDef(b.daoluId)
  const ending: BondEnding = b.fallen
    ? 'perished'
    : b.departed
      ? 'parted'
      : stageIndex(b.stage) >= stageIndex('pledged')
        ? 'accompanied'
        : 'missed'
  player.setBond(null)
  return { daoluId: b.daoluId, name: def?.name ?? b.daoluId, stage: b.stage, ending, shared: b.shared }
}


// ============ 共同事件 ============

/** 玩家实际在走的道:由行为计数推断,不是设定项 */
export function playerLean(): DaoLean | null {
  const quests = useQuestsStore()
  return leanFromCounters(k => quests.counter(k))
}

/** 本世尚未经历的共同事件 */
export function availableBondEvents(): BondEventDef[] {
  const player = usePlayerStore()
  const b = player.bond
  if (!b || b.fallen) return []
  const done = new Set(b.doneEvents)
  const si = stageIndex(b.stage)
  return BOND_EVENTS.filter(e => !done.has(e.id) && si >= e.minStageIndex)
}

/** 事件权重:关系缺哪一维,对应类的考验更易出现 */
function weightFor(ev: BondEventDef, b: BondState): number {
  let w = 1
  if (b.fate < 45 && (ev.kind === 'risk' || ev.kind === 'resource')) w += 1.2
  if (b.trust < 45 && (ev.kind === 'risk' || ev.kind === 'sacrifice')) w += 1.5
  if (b.accord < 45 && (ev.kind === 'path' || ev.kind === 'value')) w += 1.5
  if (b.lastKind === ev.kind) w *= 0.35
  return w
}

/**
 * 某个历练情境下是否发生一件共同事件。
 * 情境筛选而非随机抽取:未声明所属情境的事件永不提供(见 bondEvents.spec 的故障注入)。
 * 随机源可注入:自检须能确定性钉住哪条路够得着。
 */
export function offerBondEvent(trigger: BondTrigger, rand: RandomService = rng): BondEventDef | null {
  const player = usePlayerStore()
  const b = player.bond
  if (!b || b.fallen || b.departed) return null
  if (b.pendingEventId) return null
  if (b.opportunities < b.nextEventAt) {
    player.setBond({ ...b, opportunities: b.opportunities + 1 })
    return null
  }
  const pool = availableBondEvents().filter(e => e.triggers.includes(trigger))
  if (pool.length === 0) {
    player.setBond({ ...b, opportunities: b.opportunities + 1 })
    return null
  }
  const picked = rand.weighted(pool, e => weightFor(e, b))
  player.setBond({ ...b, opportunities: b.opportunities + 1, pendingEventId: picked.id })
  useUiStore().toast(`${currentDaolu()?.name ?? '道侣'}有话说`, 'info')
  return picked
}

/** 当下待决的共同事件;供界面读取,打开弹窗不触发 */
export function pendingBondEvent(): BondEventDef | null {
  const id = currentBond()?.pendingEventId
  const ev = id ? bondEventDef(id) : undefined
  const def = currentDaolu()
  return ev && def ? bondEventView(ev, def.gender) : null
}

/** 离线用:只补记机会点;不抽事件、不设待决、不碰缘分/信任/契合 */
export function gainBondOpportunities(n: number): void {
  const player = usePlayerStore()
  const b = player.bond
  const add = Math.floor(n)
  if (!b || b.fallen || b.departed || add <= 0) return
  player.setBond({ ...b, opportunities: b.opportunities + add })
}

/** 道侣此刻是否会先自己表态 */
export function herStance(ev: BondEventDef): string | null {
  const b = currentBond()
  const def = currentDaolu()
  if (!b || !def) return null
  const line = sheDecidesNow(ev, b, def.temper)
  return line === null ? null : bondText(line, def.gender)
}

export interface ChoiceResult {
  text: string
  /** 道侣是否因此离开 */
  left: boolean
  /** 是否因此殒落(仅「共命之险」) */
  perished?: boolean
  /** 三维变化的定性反应;界面不显示裸数字 */
  reaction: 'closer' | 'neutral' | 'strained' | 'broken'
}

/**
 * 共命之险的门槛:信任与契合都够才同生,非随机判定。
 * 不可逆后果须由玩家自选且事先说清:选项 label 已写明「未必撑得住」,另有两条不会死人的路。
 */
export const PERIL_SAFE_TRUST = 55
export const PERIL_SAFE_ACCORD = 45

/** 玩家做出选择;只改关系与叙事 */
export function chooseBondEvent(eventId: string, choiceId: string): ChoiceResult | null {
  const player = usePlayerStore()
  const b = player.bond
  const def = currentDaolu()
  if (!b || !def || b.fallen) return null
  const ev = bondEventDef(eventId)
  const ch = ev?.choices.find(x => x.id === choiceId)
  if (!ev || !ch) return null
  if (b.doneEvents.includes(ev.id)) return null

  // 共命之险按选择前的信任/契合判生死,不能被本次选择的 +trust/+accord 救回
  const beforeTrust = b.trust
  const beforeAccord = b.accord

  const out = resolveChoice(def, ch, playerLean())
  player.setBond({
    ...b,
    doneEvents: [...b.doneEvents, ev.id],
    pendingEventId: null,
    lastKind: ev.kind,
    nextEventAt: b.opportunities + EVENT_GAP
  })
  advanceBond({ fate: out.fate, trust: out.trust, accord: out.accord, shared: true })
  const text = bondText(out.text, def.gender)

  if (ch.supportsHer) sparkIntent('supported')
  if (ch.crossesTaboo) sparkIntent('crossed')

  const after = player.bond!
  if (ch.peril && !(beforeTrust >= PERIL_SAFE_TRUST && beforeAccord >= PERIL_SAFE_ACCORD)) {
    fall()
    return {
      text: `${text}走出来的只有你。`,
      left: false,
      perished: true,
      reaction: 'broken'
    }
  }
  let left = false
  if (out.leaves || (after.trust < 15 && after.accord < 20)) {
    left = true
  }
  const reaction: ChoiceResult['reaction'] = left
    ? 'broken'
    : out.trust + out.accord >= 10
      ? 'closer'
      : out.trust + out.accord <= -10
        ? 'strained'
        : 'neutral'

  if (left) {
    useUiStore().toast(`${def.name}已离去`, 'warn')
    player.setBond({ ...after, departed: true })
  }
  return { text, left, reaction }
}

// ============ 道侣自己的意图 ============

/** 一次经历推动道侣的意图;由具体发生的事调用,不看当前关系值 */
export function sparkIntent(spark: IntentSpark): BondIntent | null {
  const player = usePlayerStore()
  const b = player.bond
  const def = currentDaolu()
  if (!b || !def || b.fallen || b.departed) return null
  if (stageIndex(b.stage) < stageIndex(INTENT_MIN_STAGE)) return null

  const cur: BondIntent = b.intent ?? {
    daoluId: def.id,
    ...intentText(def),
    ripeness: 0,
    sparks: [],
    raised: 0,
    responses: [],
    settled: false
  }
  if (cur.settled) return cur
  const next: BondIntent = {
    ...cur,
    ripeness: Math.max(0, cur.ripeness + sparkDelta(spark, def.temper)),
    sparks: uniqueSparks(cur.sparks, spark)
  }
  player.setBond({ ...b, intent: next })
  return next
}

/** sparks 只记发生过哪些类型(去重,至多 4 种),防存档膨胀 */
function uniqueSparks(existing: IntentSpark[], spark: IntentSpark): IntentSpark[] {
  return existing.includes(spark) ? existing : [...existing, spark]
}

/** 道侣此刻是否开口。不接受任何情境参数(区别于 offerBondEvent(trigger)) */
export function speakIntent(): BondIntent | null {
  const player = usePlayerStore()
  const b = player.bond
  const def = currentDaolu()
  if (!b || !def || !b.intent) return null
  // 待回应时不重复开口:maybeEncounter 每场战斗都调用 speakIntent,缺此判断会反复 toast
  if (b.intentPending) return null
  if (!willSpeak(b.intent, def.temper)) return null
  const next: BondIntent = { ...b.intent, raised: b.intent.raised + 1 }
  player.setBond({ ...b, intent: next, intentPending: true })
  useUiStore().toast(next.line, 'rare')
  return next
}

/** 道侣是否正在等你的回应 */
export function pendingIntent(): BondIntent | null {
  const b = currentBond()
  return b?.intentPending ? (b.intent ?? null) : null
}

/** 回应道侣的提议。忽略不等于回绝:再三不作声,道侣会自己去 */
export function respondIntent(response: IntentResponse): IntentAftermath | null {
  const player = usePlayerStore()
  const b = player.bond
  const def = currentDaolu()
  if (!b || !def || !b.intent || !b.intentPending) return null
  const after = respondTo(def, b.intent, response)
  const next: BondIntent = {
    ...b.intent,
    responses: [...b.intent.responses, response],
    settled: after.settled,
    // 未了结的意图会再次浮上来
    ripeness: after.settled ? 0 : b.intent.ripeness * 0.4
  }
  player.setBond({ ...b, intent: next, intentPending: false })
  advanceBond({ fate: after.fate, trust: after.trust, accord: after.accord, shared: response === 'accept' })
  return { ...after, text: bondText(after.text, def.gender) }
}

/** 意图落档存换好代词的整句,开口提示与弹窗直接用 */
function intentText(def: DaoluDef): { wish: string; line: string } {
  const { wish, line } = intentFor(def)
  return { wish: bondText(wish, def.gender), line: bondText(line, def.gender) }
}
