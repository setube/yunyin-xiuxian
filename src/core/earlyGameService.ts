/**
 * 前期玩法服务:悟道顿悟/突破准备/闭关/连胜/洞府巡游
 * 冷却、到期与 buff 起点一律读游戏时钟 gameNow()(暂停时冻住),不写墙钟。
 */
import { usePlayerStore } from '@/stores/player'
import { useDongfuStore } from '@/stores/dongfu'
import { useCultivationStore } from '@/stores/cultivation'
import { useResourcesStore } from '@/stores/resources'
import { useAdventureStore } from '@/stores/adventure'
import { useUiStore } from '@/stores/ui'
import { usePacingTelemetry } from '@/stores/pacingTelemetry'
import type { EnlightenmentEvent, EnlightenmentOption, CaveEvent, BuildingId, GNum } from '@/types'
import {
  ENLIGHTENMENT_OPTIONS,
  CAVE_EVENT_POOL,
  WIN_STREAK_REWARDS,
  BREAKTHROUGH_PREP_OPTIONS,
  earlyEventDecay
} from '@/data/earlyGame'
import { gn, gnZero, gte, subClamp } from '@/utils/gnum'
import { BUSY_REASON } from './endgameActivity'
import { expFromSecs } from '@/core/formulas'
import { INSTANT_EXP_LAYER_CAP } from '@/data/constants'
import { enlightenmentOptionText } from '@/ui/enlightenmentText'
import { caveOptionText } from '@/ui/caveText'
import { streakRewardText } from '@/ui/streakText'
import { todayLocalNum } from '@/utils/time'
import { gameNow } from './enginePause'

function telemetry(): ReturnType<typeof usePacingTelemetry> {
  return usePacingTelemetry()
}

let enlightenmentEvent: EnlightenmentEvent | null = null
let caveEvent: CaveEvent | null = null

/** 巡游落点 → 洞府建筑;只落在已盖的建筑处,一处未盖回落灵田 */
const CAVE_LOCATION_BUILDING: Record<keyof typeof CAVE_EVENT_POOL, BuildingId> = {
  field: 'field',
  furnace: 'alchemy',
  library: 'library',
  array: 'array',
  garden: 'beast'
}

/** 获取当前悟道顿悟事件(60秒窗口) */
export function getCurrentEnlightenment(): EnlightenmentEvent | null {
  if (!enlightenmentEvent) return null
  const now = gameNow()
  if (now > enlightenmentEvent.expiresAt) {
    enlightenmentEvent = null
    return null
  }
  return enlightenmentEvent
}

/**
 * 触发悟道顿悟(修炼时低概率,每5分钟最多触发1次)。
 * 冷却存 player store(随档):挂模块会被刷新页面清掉。`enlightenmentAt` 由 `player.shiftTimedState` 顺延。
 */
export function mayTriggerEnlightenment(): void {
  const player = usePlayerStore()
  const now = gameNow()
  if (now - player.enlightenmentAt < 300000) return
  const presence = earlyEventDecay('enlightenment', player.major)
  if (presence <= 0) return
  if (Math.random() > 0.08 * presence) return

  const pool = [...ENLIGHTENMENT_OPTIONS]
  const options: EnlightenmentOption[] = []
  const usedTypes = new Set<string>()

  while (options.length < 3 && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length)
    const opt = pool[idx]!
    if (!usedTypes.has(opt.type)) {
      options.push(opt)
      usedTypes.add(opt.type)
    }
    pool.splice(idx, 1)
  }

  enlightenmentEvent = {
    id: `enlighten_${now}`,
    options,
    triggeredAt: now,
    expiresAt: now + 60000
  }
  player.setEnlightenmentAt(now)
  telemetry().record('enlightenment', 'modal', '悟道顿悟浮现')
}

/** 选择悟道顿悟选项 */
export function chooseEnlightenment(optionIndex: number): void {
  if (
    !enlightenmentEvent ||
    !Number.isInteger(optionIndex) ||
    optionIndex < 0 ||
    optionIndex >= enlightenmentEvent.options.length
  ) return
  const opt = enlightenmentEvent.options[optionIndex]!
  const cult = useCultivationStore()
  const ui = useUiStore()
  const now = gameNow()

  // buff 未注册时 addBuff 静默空转
  if (opt.reward) {
    useResourcesStore().addSmall('wudao', opt.reward.value)
    ui.toast(`悟道点 +${opt.reward.value}`, 'success')
  } else if (opt.buffId) {
    cult.addBuff(opt.buffId, now)
    ui.toast(enlightenmentOptionText(opt), 'success')
  }

  telemetry().record('enlightenment_choose', 'modal', `悟道:${opt.label}`)
  enlightenmentEvent = null
}

/** 忽略本次顿悟:须清模块级事件,否则 1s 轮询的 getCurrentEnlightenment 会把它弹回来 */
export function dismissEnlightenment(): void {
  if (enlightenmentEvent) telemetry().record('enlightenment_ignore', 'modal', '悟道顿悟忽略')
  enlightenmentEvent = null
}

/**
 * 开始闭关(5分钟,修炼+150%,禁止历练)。
 * 真相源是持久化的 retreat buff(时长由 buffs.ts 的 durationSec=300 承载);模块计时器刷新即失。
 * 与 startExploration 的闭关禁令互斥:历练途中不可闭关。
 */
export function startRetreat(): boolean {
  if (isRetreating()) return false // 幂等,不刷新时长

  const adventure = useAdventureStore()
  if (adventure.session) {
    // 与 startExploration 的拒因同词:取 BUSY_REASON,不另抄一份字面量
    useUiStore().toast(BUSY_REASON.exploration, 'warn')
    return false
  }

  const cult = useCultivationStore()
  cult.addBuff('retreat', gameNow())
  telemetry().record('retreat', 'modal', '开始闭关')
  return true
}

/** 是否闭关中(过期即假,与 prune 时机无关) */
export function isRetreating(): boolean {
  return getRetreatRemainingSec() > 0
}

/** 闭关剩余秒数(已过期或未闭关为 0) */
export function getRetreatRemainingSec(at: number = gameNow()): number {
  const inst = useCultivationStore().buffs.find(b => b.defId === 'retreat')
  if (!inst) return 0
  return Math.max(0, Math.ceil((inst.endsAt - at) / 1000))
}

/** 突破准备(静坐/服丹);数值与药价全部取自 BREAKTHROUGH_PREP_OPTIONS */
export function prepareBreakthrough(optionId: string): boolean {
  const opt = BREAKTHROUGH_PREP_OPTIONS.find(o => o.id === optionId)
  if (!opt || opt.bonusRate <= 0) return false // direct/未知项不是准备动作
  // 一次性:静坐未完或加成已就绪时再点,会白扣灵石并覆盖现有加成
  if (usePlayerStore().breakthroughPrep !== null) return false

  const resources = useResourcesStore()
  if (opt.cost?.stone && !resources.spendStone(gn(opt.cost.stone))) return false
  // duration 单位:秒,=0 表示支付即就绪(聚气丹)。`breakthroughPrep.readyAt` 由 `player.shiftTimedState` 顺延
  usePlayerStore().setBreakthroughPrep({
    bonus: opt.bonusRate,
    readyAt: gameNow() + Math.max(0, opt.duration) * 1000,
    kind: opt.id === 'pill' ? 'pill' : 'meditate'
  })
  telemetry().record('breakthrough_prep', 'modal', `突破准备:${opt.label}`)
  return true
}

/** 突破准备的灵石缺口(纯算,不消费)。null = 不是需要灵石的项;余额够返回 0。界面与失败回执都读这一份 */
export function breakthroughPrepShortfall(optionId: string): GNum | null {
  const opt = BREAKTHROUGH_PREP_OPTIONS.find(o => o.id === optionId)
  if (!opt || opt.bonusRate <= 0 || !opt.cost?.stone) return null
  const cost = gn(opt.cost.stone)
  const stone = useResourcesStore().spiritStone
  return gte(stone, cost) ? gnZero() : subClamp(cost, stone)
}

/** 存进档的准备态(见 player store 的注释) */
export interface BreakthroughPrepState {
  bonus: number
  readyAt: number
  kind: 'meditate' | 'pill'
}

export interface BreakthroughPrepView {
  /** 是否正在静坐调息(3 分钟未完) */
  sitting: boolean
  /** 调息剩余秒数 */
  remainingSec: number
  /** 加成是否已就绪可用(静坐 3 分钟完成 / 聚气丹支付即了) */
  ready: boolean
  /** 就绪加成:静坐 0.08 / 聚气丹 0.05 */
  bonus: number
  kind: 'meditate' | 'pill' | null
}

/**
 * 突破准备当前状态(只读,不消费)。一次性加成,突破时经 consumeBreakthroughPrep 取走后即空。
 * 状态存 player store(随档持久化):聚气丹要花灵石,挂模块刷新即失。
 */
export function breakthroughPrepState(at: number = gameNow()): BreakthroughPrepView {
  const state = usePlayerStore().breakthroughPrep
  if (!state) return { sitting: false, remainingSec: 0, ready: false, bonus: 0, kind: null }
  const remainSec = Math.ceil((state.readyAt - at) / 1000)
  if (remainSec > 0) {
    return { sitting: true, remainingSec: remainSec, ready: false, bonus: 0, kind: state.kind }
  }
  return { sitting: false, remainingSec: 0, ready: true, bonus: state.bonus, kind: state.kind }
}

/** 取走就绪的突破准备加成(一次性;未就绪返回 0 且不动状态) */
export function consumeBreakthroughPrep(at: number = gameNow()): number {
  const s = breakthroughPrepState(at)
  if (!s.ready) return 0
  usePlayerStore().setBreakthroughPrep(null)
  return s.bonus
}

/** 记录连胜 */
export function recordWin(): void {
  const player = usePlayerStore()
  player.incrementWinStreak()

  const streak = player.winStreak
  const reward = WIN_STREAK_REWARDS.find(r => r.streak === streak)
  if (reward) {
    const resources = useResourcesStore()
    resources.addStone(gn(reward.stone))
    resources.addSmall('wudao', reward.wudao)
    useUiStore().toast(streakRewardText(streak, reward.stone, reward.wudao), 'success')
    telemetry().record('win_streak', 'notify', `连胜 ${streak} 场奖励`)
  }
}

/** 记录失败(重置连胜) */
export function recordLoss(): void {
  const player = usePlayerStore()
  player.resetWinStreak()
}

/** 整批入账时发下的连胜赏格(与逐场 recordWin 同一张表) */
export interface StreakBatchReward {
  streak: number
  stone: number
  wudao: number
}

/**
 * 整批胜负的连胜结算(离线整段结算用)。
 * 顺序:先接 `wins` 场连胜、跨档即发,再以败场收尾(`losses > 0` 即归零);在线一败即中止历练,败后不会再赢。
 * 不发 toast(离线归来有卷轴);赏格数额与文案交给调用方(`streakRewardText`),只报发了哪几档。
 */
export function recordWinStreakBatch(wins: number, losses: number): StreakBatchReward[] {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const count = Math.max(0, Math.floor(wins))
  const start = Math.max(0, Math.floor(player.winStreak))
  const end = start + count
  const granted: StreakBatchReward[] = []
  // 门槛 ≤ start 的档已被上一批发过,不重发
  for (const reward of WIN_STREAK_REWARDS) {
    if (reward.streak <= start || reward.streak > end) continue
    resources.addStone(gn(reward.stone))
    resources.addSmall('wudao', reward.wudao)
    granted.push({ ...reward })
  }
  /*
   * 有败场就归零 —— 判「是否输过」不能看夹制后的值。
   *
   * 原先是 `Math.max(0, Math.floor(losses)) > 0`:负 losses 夹成 0 之后
   * 判假,连胜**当成没输过**继续往上加。生产路径是离线结算
   * `recordWinStreakBatch(wins, battles - wins)`,而 battles 与 wins 都是
   * 存档可写字段,坏档里 wins > battles 就得到负 losses ——
   * 实测 wins=3/losses=-5 时连胜从 7 涨到 10,玩家白拿连胜奖励。
   */
  player.winStreak = Number.isFinite(losses) && Math.floor(losses) !== 0 ? 0 : end
  return granted
}

/** 触发洞府巡游(每日一次) */
export function mayTriggerCaveEvent(): CaveEvent | null {
  if (caveEvent) return caveEvent

  const player = usePlayerStore()
  const today = todayLocalNum()
  if (player.lastCaveEventDay === today) return null

  // 掷签失败也记今日,否则 30s 轮询会反复重掷
  const presence = earlyEventDecay('cavePatrol', player.major)
  if (presence <= 0) return null
  if (Math.random() > presence) {
    player.markCaveEventToday(today)
    return null
  }

  const dongfu = useDongfuStore()
  const locationKeys = Object.keys(CAVE_EVENT_POOL) as Array<keyof typeof CAVE_EVENT_POOL>
  const owned = locationKeys.filter(loc => (dongfu.levels[CAVE_LOCATION_BUILDING[loc]] ?? 0) > 0)
  const locations = (owned.length > 0 ? owned : ['field']) as Array<keyof typeof CAVE_EVENT_POOL>
  const location = locations[Math.floor(Math.random() * locations.length)]! 
  const pool = CAVE_EVENT_POOL[location]
  if (!pool || pool.length === 0) return null

  const event = pool[Math.floor(Math.random() * pool.length)]!
  const now = gameNow()

  caveEvent = {
    ...event,
    location,
    triggeredAt: now,
    expiresAt: now + 120000 // 2分钟窗口
  }
  telemetry().record('cave_event', 'modal', `洞府:${event.title}`)

  return caveEvent
}

/** 获取当前洞府巡游事件 */
export function getCurrentCaveEvent(): CaveEvent | null {
  if (!caveEvent) return null
  const now = gameNow()
  if (now > caveEvent.expiresAt) {
    caveEvent = null
    // 过期也记今日,否则 30s 轮询会反复重掷(与掷签失败同规)
    usePlayerStore().markCaveEventToday(todayLocalNum())
    return null
  }
  return caveEvent
}

/** 暂停恢复:机缘 / 巡游窗口的到期时刻顺延暂停时长;与 `enginePause.gameNow()` 的冻结语义配套 */
export function shiftEarlyGameWindows(pausedMs: number): void {
  if (pausedMs <= 0) return
  if (enlightenmentEvent) {
    enlightenmentEvent = { ...enlightenmentEvent, expiresAt: enlightenmentEvent.expiresAt + pausedMs }
  }
  if (caveEvent) {
    caveEvent = { ...caveEvent, expiresAt: caveEvent.expiresAt + pausedMs }
  }
}

/** 选择洞府巡游选项 */
export function chooseCaveOption(optionIndex: number): void {
  if (
    !caveEvent ||
    !Number.isInteger(optionIndex) ||
    optionIndex < 0 ||
    optionIndex >= caveEvent.options.length
  ) return
  const opt = caveEvent.options[optionIndex]!
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const cult = useCultivationStore()

  const now = gameNow()
  if (opt.reward) {
    switch (opt.reward.type) {
      case 'exp':
        player.gainExp(
          expFromSecs(player.expReq, opt.reward.secs, player.cultPerSec, INSTANT_EXP_LAYER_CAP)
        )
        break
      case 'stone':
        resources.addStone(gn(opt.reward.value as number))
        break
      case 'herb':
        resources.addSmall('herb', opt.reward.value as number)
        break
      case 'wudao':
        resources.addSmall('wudao', opt.reward.value as number)
        break
      case 'buff':
        applyCaveBuff(opt.reward.value as string, cult, now)
        break
    }
  }

  // 惩罚 buff 按 penalty.type 映射已注册 id(如 cave_penalty_cultivationSpeed),不掺时间戳
  if (opt.penalty) {
    cult.addBuff(`cave_penalty_${opt.penalty.type}`, now)
  }

  const today = todayLocalNum()
  player.markCaveEventToday(today)
  useUiStore().toast(`洞府巡游·${caveOptionText(opt)}`, 'success')
  telemetry().record('cave_choose', 'modal', `洞府选择:${opt.label}`)
  caveEvent = null
}

/**
 * 离开本次洞府巡游,与选择一样占用今日一次。
 * 只清模块级事件不够:mayTriggerCaveEvent 每 30s 轮询会重掷一个新事件弹回来。
 */
export function dismissCaveEvent(): void {
  if (!caveEvent) return
  telemetry().record('cave_ignore', 'modal', '洞府巡游离开')
  const today = todayLocalNum()
  usePlayerStore().markCaveEventToday(today)
  caveEvent = null
}

function applyCaveBuff(buffId: string, cult: ReturnType<typeof useCultivationStore>, now: number) {
  cult.addBuff(buffId, now)
}
