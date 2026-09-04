/**
 * 道侣服务(Phase 33.8)
 *
 * ## 本模块刻意不做的事 —— 这是判据,不是遗漏
 *
 * 道侣的关系值只转化为**事件概率与选项资格**,不转化为任何数值。
 * 故本文件不得出现:
 *
 *   - StatMods / 任何属性键         直接落在效率链上
 *   - addDaoFruit / addInsight      道果与宿慧都是永久资源
 *   - 资源发放(灵石/丹药/材料)      三跳之后仍回到战力与速度
 *   - cultivationSpeed 相关         最短的一条回路
 *
 * `daoluService.spec.ts` 扫描本文件源码强制这四条。
 * 前面的审计已经证明 45 个属性键**全部**可达 cultivationSpeed,
 * 所以这里不是「少给一点」,而是一个都不给。
 *
 * ## 跨轮回:历史留下,人不留下
 *
 * 转世时清空当前关系,只把结局写进履历。下一世可能遇见完全不同的人,
 * 也可能因宿缘再遇同一个人 —— 但那是概率,不是保证。
 */
import {
  DAOLU,
  type BondEnding,
  type BondStage,
  type DaoluDef,
  STAGE_GATES,
  daoluDef,
  gateOf,
  stageIndex
} from '@/data/daolu'
import {
  BOND_EVENTS,
  type BondEventDef,
  bondEventDef,
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
import { rng } from '@/utils/random'

/** 本世与某人的关系(存档结构) */
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
  /** 她是否已陨落 */
  fallen: boolean
  /** 本世已经历的共同事件 */
  doneEvents: string[]
  /** 当下待决的事件;由历练情境写入,不由打开界面触发 */
  pendingEventId?: string | null
  /** 已累积的机会点(每次历练情境 +1) */
  opportunities: number
  /** 下一次可提供事件的机会点门槛 —— 防止刷成 farming loop */
  nextEventAt: number
  /** 上一次冲突的类型,用于避免连续同类 */
  lastKind?: string | null
  /** 她是否已离开(关系冻结,履历仍记) */
  departed?: boolean
  /** 她自己的意图(Phase 34.1);由经历催生,与世界情境无关 */
  intent?: BondIntent | null
  /** 她已开口,正等你的回应 */
  intentPending?: boolean
}

/** 一世结束后留在履历里的那一笔 */
export interface BondRecord {
  daoluId: string
  name: string
  stage: BondStage
  ending: BondEnding
  shared: number
}

const CAP = 100
/**
 * 两件共同事件之间至少相隔多少个机会点。
 *
 * 用「机会点」而非时间:走得多才有更多机会,挂机久不会自动刷出一堆关系事件
 */
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

/**
 * 这一世可能遇见谁。
 *
 * 与本世之界挂钩:她偏好的地貌若在这一世的路线上,才更可能出现 ——
 * 世界不同 → 路径不同 → 遇见谁不同,轮回与世界生成由此连上
 */
export function candidatesFor(terrains: readonly string[]): DaoluDef[] {
  const seen = new Set(terrains)
  return DAOLU.filter(d => d.terrains.length === 0 || d.terrains.some(t => seen.has(t)))
}

/**
 * 宿缘:上一世走得深的人,这一世**有可能**再遇。
 *
 * 是概率不是按钮 —— 若能保证重逢,轮回就失去了分别的重量
 */
export function destinedCandidate(history: readonly BondRecord[], terrains: readonly string[]): DaoluDef | null {
  const deep = history.filter(r => stageIndex(r.stage) >= stageIndex('pledged'))
  if (deep.length === 0) return null
  // 走得越深,重逢的可能越大,但永远不满
  const chance = Math.min(0.35, 0.08 * deep.length)
  if (!rng.chance(chance)) return null
  const pick = deep[rng.int(0, deep.length - 1)]!
  const def = daoluDef(pick.daoluId)
  if (!def) return null
  // 仍要她愿意出现在这一世的地界上
  return candidatesFor(terrains).some(c => c.id === def.id) ? def : null
}

/** 初遇:记住这个人 */
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
    // 初遇之后要走一段路才会有第一件事
    nextEventAt: EVENT_GAP,
    lastKind: null
  })
  useUiStore().toast(`途中遇见一人——${def.name}`, 'info')
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

/**
 * 推进关系。
 *
 * 三维各自独立变化 —— 一次并肩作战可以让缘分与信任大涨而契合不动,
 * 一次道途分歧可以在缘分很深时让契合骤降
 */
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
    useUiStore().toast(`你与${def?.name ?? '她'}的关系更进一步`, 'rare')
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

/** 距离下一阶还差什么(供界面提示,不给数值奖励) */
export function nextGateHint(): { stage: BondStage; lacking: string[] } | null {
  const b = currentBond()
  if (!b) return null
  const i = stageIndex(b.stage)
  const next = STAGE_GATES.find(g => stageIndex(g.stage) === i + 1)
  if (!next) return null
  const lacking: string[] = []
  if (b.fate < next.fate) lacking.push('缘分尚浅')
  if (b.trust < next.trust) lacking.push('信任未足')
  if (b.accord < next.accord) lacking.push('道心未契')
  if (b.shared < next.shared) lacking.push('共历太少')
  return { stage: next.stage, lacking }
}

// ============ 分离与结局 ============

/** 她陨落于这一世 */
export function fall(): BondRecord | null {
  const player = usePlayerStore()
  const b = player.bond
  if (!b || b.fallen) return null
  const def = daoluDef(b.daoluId)
  player.setBond({ ...b, fallen: true })
  useUiStore().toast(`${def?.name ?? '她'}没能走完这一世`, 'warn')
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

/**
 * 一世走完,把关系归档。
 *
 * 由 confirmReincarnation 调用。**只产出一条记录,不产出任何资源**
 */
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

export { DAOLU, daoluDef, gateOf, stageIndex }

// ============ 共同事件(Phase 33.9) ============

/**
 * 玩家实际在走的道 —— 由行为计数推断,不是设定项。
 *
 * 这是 33.8 遗留缺口的正解:此前 accordShift 需要调用方把玩家道途
 * 传进来,而那个字段根本不存在,等于开发者在喂数据。
 * 现在契合终于是**行为的结果**
 */
export function playerLean(): DaoLean | null {
  const quests = useQuestsStore()
  return leanFromCounters(k => quests.counter(k))
}

/** 这一世还没经历过的共同事件 */
export function availableBondEvents(): BondEventDef[] {
  const player = usePlayerStore()
  const b = player.bond
  if (!b || b.fallen) return []
  const done = new Set(b.doneEvents)
  const si = stageIndex(b.stage)
  return BOND_EVENTS.filter(e => !done.has(e.id) && si >= e.minStageIndex)
}

/**
 * 关系缺什么,世界就更容易递上哪一类考验。
 *
 * 这不是给玩家发任务 —— 是关系本身有状态,故对应的问题更容易浮现。
 * 缘分浅时多来共历,信任低时多来风险与承担,契合低时多来道途与价值观
 */
function weightFor(ev: BondEventDef, b: BondState): number {
  let w = 1
  if (b.fate < 45 && (ev.kind === 'risk' || ev.kind === 'resource')) w += 1.2
  if (b.trust < 45 && (ev.kind === 'risk' || ev.kind === 'sacrifice')) w += 1.5
  if (b.accord < 45 && (ev.kind === 'path' || ev.kind === 'value')) w += 1.5
  // 同类冲突刚发生过则降权,避免连续两次同一种考验
  if (b.lastKind === ev.kind) w *= 0.35
  return w
}

/**
 * 在某个历练情境下,是否有一件共同事件该发生。
 *
 * **不是随机抽取,而是情境筛选** —— 事件必须声明它属于哪一刻,
 * 声明为空的事件永远不会被提供(见 bondEvents.spec 的故障注入)
 */
export function offerBondEvent(trigger: BondTrigger): BondEventDef | null {
  const player = usePlayerStore()
  const b = player.bond
  if (!b || b.fallen || b.departed) return null
  // 已有待决事件时不再叠加 —— 一次只面对一个问题
  if (b.pendingEventId) return null
  // 机会点冷却:走得多才有更多机会,但不能连着来
  if (b.opportunities < b.nextEventAt) {
    player.setBond({ ...b, opportunities: b.opportunities + 1 })
    return null
  }
  const pool = availableBondEvents().filter(e => e.triggers.includes(trigger))
  if (pool.length === 0) {
    player.setBond({ ...b, opportunities: b.opportunities + 1 })
    return null
  }
  const picked = rng.weighted(pool, e => weightFor(e, b))
  player.setBond({ ...b, opportunities: b.opportunities + 1, pendingEventId: picked.id })
  useUiStore().toast(`${currentDaolu()?.name ?? '她'}似乎有话要说`, 'info')
  return picked
}

/** 当下待决的共同事件(供界面读取,不再由打开弹窗触发) */
export function pendingBondEvent(): BondEventDef | null {
  const id = currentBond()?.pendingEventId
  return id ? (bondEventDef(id) ?? null) : null
}

/** 她此刻是否会先自己表态 */
export function herStance(ev: BondEventDef): string | null {
  const b = currentBond()
  const def = currentDaolu()
  if (!b || !def) return null
  return sheDecidesNow(ev, b, def.temper)
}

export interface ChoiceResult {
  text: string
  /** 她是否因此离开 */
  left: boolean
  /** 三维实际变化,供界面显示「她的反应」而非裸数字 */
  reaction: 'closer' | 'neutral' | 'strained' | 'broken'
}

/**
 * 玩家做出选择。
 *
 * **不产出任何 StatMods / 资源 / 道果 / 宿慧** —— 只改关系与叙事
 */
export function chooseBondEvent(eventId: string, choiceId: string): ChoiceResult | null {
  const player = usePlayerStore()
  const b = player.bond
  const def = currentDaolu()
  if (!b || !def || b.fallen) return null
  const ev = bondEventDef(eventId)
  const ch = ev?.choices.find(x => x.id === choiceId)
  if (!ev || !ch) return null
  // 一世一事:同一段经历不重复发生
  if (b.doneEvents.includes(ev.id)) return null

  const out = resolveChoice(def, ch, playerLean())
  // 记事件已历、清待决、记本次冲突类型,并把下一次机会点推远
  // —— 事件是人生节点,不是每日任务
  player.setBond({
    ...b,
    doneEvents: [...b.doneEvents, ev.id],
    pendingEventId: null,
    lastKind: ev.kind,
    nextEventAt: b.opportunities + EVENT_GAP
  })
  advanceBond({ fate: out.fate, trust: out.trust, accord: out.accord, shared: true })

  // 这次选择也是一段经历 —— 它会推动或压回她自己的那个念头
  if (ch.supportsHer) sparkIntent('supported')
  if (ch.crossesTaboo) sparkIntent('crossed')

  const after = player.bond!
  let left = false
  // 她离开:选项直接导致,或信任与契合双双崩塌
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
    useUiStore().toast(`${def.name}离你而去`, 'warn')
    player.setBond({ ...after, departed: true })
  }
  return { text: out.text, left, reaction }
}

/** 她是否已离开(离开后关系冻结,但履历仍记这一段) */
export function hasDeparted(): boolean {
  return currentBond()?.departed === true
}

// ============ 她自己的意图(Phase 34.1) ============

/**
 * 一次经历推动她的意图。
 *
 * 由具体发生的事调用,不看当前关系值 —— 这是「意图由经历催生」的落点。
 * 意图在关系够近之后自行形成,不需要世界安排
 */
export function sparkIntent(spark: IntentSpark): BondIntent | null {
  const player = usePlayerStore()
  const b = player.bond
  const def = currentDaolu()
  if (!b || !def || b.fallen || b.departed) return null
  if (stageIndex(b.stage) < stageIndex(INTENT_MIN_STAGE)) return null

  const cur: BondIntent = b.intent ?? {
    daoluId: def.id,
    ...intentFor(def),
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
    sparks: [...cur.sparks, spark]
  }
  player.setBond({ ...b, intent: next })
  return next
}

/**
 * 她此刻是否开口。
 *
 * **不接受任何情境参数** —— 她想说就说。这正是与 34.0 的
 * offerBondEvent(trigger) 的分野:那是世界安排,这是她自己
 */
export function speakIntent(): BondIntent | null {
  const player = usePlayerStore()
  const b = player.bond
  const def = currentDaolu()
  if (!b || !def || !b.intent) return null
  if (!willSpeak(b.intent, def.temper)) return null
  const next: BondIntent = { ...b.intent, raised: b.intent.raised + 1 }
  player.setBond({ ...b, intent: next, intentPending: true })
  useUiStore().toast(next.line, 'rare')
  return next
}

/** 她是否正在等你的回应 */
export function pendingIntent(): BondIntent | null {
  const b = currentBond()
  return b?.intentPending ? (b.intent ?? null) : null
}

/**
 * 回应她的提议。
 *
 * 三种回应各有不同后果,**忽略不等于回绝** ——
 * 再三不作声,她会自己去,然后不再指望你
 */
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
    // 回应过后重新酝酿:未了结的意图会再次浮上来
    ripeness: after.settled ? 0 : b.intent.ripeness * 0.4
  }
  player.setBond({ ...b, intent: next, intentPending: false })
  advanceBond({ fate: after.fate, trust: after.trust, accord: after.accord, shared: response === 'accept' })
  return after
}
