/**
 * Phase 28 前期玩法服务 —— 悟道顿悟/突破准备/闭关/历练路线/连胜/洞府巡游/灵兽陪行
 */
import { usePlayerStore } from '@/stores/player'
import { useDongfuStore } from '@/stores/dongfu'
import { useGameStore } from '@/stores/game'
import { useCultivationStore } from '@/stores/cultivation'
import { useResourcesStore } from '@/stores/resources'
import { useAdventureStore } from '@/stores/adventure'
import { useUiStore } from '@/stores/ui'
import { usePacingTelemetry } from '@/stores/pacingTelemetry'
import type { EnlightenmentEvent, EnlightenmentOption, CaveEvent, BuildingId } from '@/types'
import {
  ENLIGHTENMENT_OPTIONS,
  CAVE_EVENT_POOL,
  WIN_STREAK_REWARDS,
  BREAKTHROUGH_PREP_OPTIONS,
  earlyEventDecay
} from '@/data/earlyGame'
import { gn } from '@/utils/gnum'
import { enlightenmentOptionText } from '@/ui/enlightenmentText'
import { caveOptionText } from '@/ui/caveText'
import { streakRewardText } from '@/ui/streakText'
import { todayLocalNum } from '@/utils/time'

function telemetry(): ReturnType<typeof usePacingTelemetry> {
  return usePacingTelemetry()
}

let enlightenmentEvent: EnlightenmentEvent | null = null
let caveEvent: CaveEvent | null = null

/** 巡游落点 → 对应洞府建筑:落点只发生在玩家盖了那座建筑的地方 */
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
  const now = Date.now()
  if (now > enlightenmentEvent.expiresAt) {
    enlightenmentEvent = null
    return null
  }
  return enlightenmentEvent
}

/**
 * 触发悟道顿悟(修炼时低概率,每5分钟最多触发1次)
 *
 * 冷却存在 player store(随档):顿悟给悟道点,闸门若挂模块,
 * 刷新一次页面就等于把 5 分钟冷却清掉 —— 那是「重开页面刷顿悟」。
 */
export function mayTriggerEnlightenment(): void {
  const player = usePlayerStore()
  const now = Date.now()
  if (now - player.enlightenmentAt < 300000) return // 5分钟冷却
  // EARLY_EVENT_DECAY:顿悟是"前期玩法",境界越高存在感越低,真仙后完全退出
  const presence = earlyEventDecay('enlightenment', player.major)
  if (presence <= 0) return
  if (Math.random() > 0.08 * presence) return // 8% × 当前境界存在感

  // 随机选3个不同类型的选项
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
    expiresAt: now + 60000 // 60秒窗口
  }
  player.setEnlightenmentAt(now)
  telemetry().record('enlightenment', 'modal', '悟道顿悟浮现')
}

/** 选择悟道顿悟选项 */
export function chooseEnlightenment(optionIndex: number): void {
  if (!enlightenmentEvent || optionIndex >= enlightenmentEvent.options.length) return
  const opt = enlightenmentEvent.options[optionIndex]!
  const cult = useCultivationStore()
  const ui = useUiStore()
  const now = Date.now()

  // 即时奖励(如灵机一动直接给悟道点)或挂 buff;buff 未注册时 addBuff 会静默……
  // 但那不再是"选项该有的样子"——守卫在这里兜住,让漏注册显式为错误而不是静默空转
  if (opt.reward) {
    useResourcesStore().addSmall('wudao', opt.reward.value)
    ui.toast(`灵机一动,悟道点 +${opt.reward.value}`, 'success')
  } else if (opt.buffId) {
    cult.addBuff(opt.buffId, now)
    ui.toast(enlightenmentOptionText(opt), 'success')
  }

  telemetry().record('enlightenment_choose', 'modal', `悟道:${opt.label}`)
  enlightenmentEvent = null
}

/**
 * 玩家忽略本次顿悟:清掉模块级事件,否则 1s 轮询的 getCurrentEnlightenment
 * 会把它原封不动弹回来,「忽略」等于没按
 */
export function dismissEnlightenment(): void {
  if (enlightenmentEvent) telemetry().record('enlightenment_ignore', 'modal', '悟道顿悟忽略')
  enlightenmentEvent = null
}

/**
 * 开始闭关(5分钟,修炼+150%,禁止历练)。
 *
 * 真相源是持久化的 retreat buff 本身(时长由 buffs.ts 的 durationSec=300 承载):
 * 模块计时器刷新即失,改成 buff 后闭关状态与剩余秒数在重载/离线后依旧可信。
 * 历练途中不可闭关 —— 与 startExploration 的闭关禁令互斥,避免 +150% 叠加在历练上
 */
export function startRetreat(): boolean {
  if (isRetreating()) return false // 已在闭关(幂等,不刷新时长)

  const adventure = useAdventureStore()
  if (adventure.session) {
    useUiStore().toast('你正在历练途中,先了结眼下这一程', 'warn')
    return false
  }

  const cult = useCultivationStore()
  cult.addBuff('retreat', Date.now())
  telemetry().record('retreat', 'modal', '开始闭关')
  return true
}

/** 当前是否在闭关中(以 buff 为真相源,过期即假,与 prune 时机无关) */
export function isRetreating(): boolean {
  return getRetreatRemainingSec() > 0
}

/** 闭关剩余秒数(已过期或未闭关为 0) */
export function getRetreatRemainingSec(at: number = Date.now()): number {
  const inst = useCultivationStore().buffs.find(b => b.defId === 'retreat')
  if (!inst) return 0
  return Math.max(0, Math.ceil((inst.endsAt - at) / 1000))
}

/** 突破准备(静坐/服丹)——数值与药价全部取自 BREAKTHROUGH_PREP_OPTIONS,逻辑不持有第二份魔法数 */
export function prepareBreakthrough(optionId: string): boolean {
  const opt = BREAKTHROUGH_PREP_OPTIONS.find(o => o.id === optionId)
  if (!opt || opt.bonusRate <= 0) return false // direct/未知项 = 不是准备动作,不产生加成

  const resources = useResourcesStore()
  if (opt.cost?.stone) {
    if (!resources.hasStone(gn(opt.cost.stone))) return false
    resources.spendStone(gn(opt.cost.stone))
  }
  // duration 单位为秒(meditate=180);=0 表示支付即了就绪(聚气丹)
  usePlayerStore().setBreakthroughPrep({
    bonus: opt.bonusRate,
    readyAt: Date.now() + Math.max(0, opt.duration) * 1000,
    kind: opt.id === 'pill' ? 'pill' : 'meditate'
  })
  telemetry().record('breakthrough_prep', 'modal', `突破准备:${opt.label}`)
  return true
}

/** 存进档的准备态:加成、就绪时刻、来源(见 player store 的注释) */
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
 * 突破准备当前状态(只读,不消费)。
 * 语义:静坐调息要坐满 3 分钟才转「就绪」;聚气丹支付即了就绪;
 * 两者都是一次性加成,突破时经 consumeBreakthroughPrep 取走后即空。
 *
 * 状态存在 player store(随档持久化):聚气丹是要花 80 灵石的,
 * 刷新一次就没了等于吞资源;顿悟/巡游那种免费提示才适合模块态。
 */
export function breakthroughPrepState(): BreakthroughPrepView {
  // 读一次心跳:倒计时与"坐满转就绪"要随时间被重新计算(见 divination 同款处理)
  void useGameStore().totalPlaySec
  const state = usePlayerStore().breakthroughPrep
  if (!state) return { sitting: false, remainingSec: 0, ready: false, bonus: 0, kind: null }
  const remainSec = Math.ceil((state.readyAt - Date.now()) / 1000)
  if (remainSec > 0) {
    return { sitting: true, remainingSec: remainSec, ready: false, bonus: 0, kind: state.kind }
  }
  return { sitting: false, remainingSec: 0, ready: true, bonus: state.bonus, kind: state.kind }
}

/** 取走就绪的突破准备加成(一次性;未就绪返回 0 且不动状态) */
export function consumeBreakthroughPrep(): number {
  const s = breakthroughPrepState()
  if (!s.ready) return 0
  usePlayerStore().setBreakthroughPrep(null)
  return s.bonus
}

/** 记录连胜 */
export function recordWin(): void {
  const player = usePlayerStore()
  player.incrementWinStreak()

  // 检查是否触发连胜奖励
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

/** 触发洞府巡游(每日一次) */
export function mayTriggerCaveEvent(): CaveEvent | null {
  if (caveEvent) return caveEvent // 已有未处理事件

  const player = usePlayerStore()
  const today = todayLocalNum()
  if (player.lastCaveEventDay === today) return null // 今日已触发

  // EARLY_EVENT_DECAY:巡游是"前期活跃",元婴后让位给更重要的系统(存在感归零完全退出)。
  // 掷签失败即视为今日让位,否则 30s 轮询会把"今日未出"变成反复重掷,存在感被稀释
  const presence = earlyEventDecay('cavePatrol', player.major)
  if (presence <= 0) return null
  if (Math.random() > presence) {
    player.markCaveEventToday(today)
    return null
  }

  // 随机选一个**盖了对应建筑**的落点:别让「丹炉余温」出现在你没炼丹炉的洞府里,
  // 或「安抚灵兽」在你没灵兽园时给一条空增益。一处都没盖(纯新人)回落灵田 ——
  // 它的收获(灵草)恒有意义,不制造空洞
  const dongfu = useDongfuStore()
  const locationKeys = Object.keys(CAVE_EVENT_POOL) as Array<keyof typeof CAVE_EVENT_POOL>
  const owned = locationKeys.filter(loc => (dongfu.levels[CAVE_LOCATION_BUILDING[loc]] ?? 0) > 0)
  const locations = (owned.length > 0 ? owned : ['field']) as Array<keyof typeof CAVE_EVENT_POOL>
  const location = locations[Math.floor(Math.random() * locations.length)]! 
  const pool = CAVE_EVENT_POOL[location]
  if (!pool || pool.length === 0) return null

  const event = pool[Math.floor(Math.random() * pool.length)]!
  const now = Date.now()

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
  const now = Date.now()
  if (now > caveEvent.expiresAt) {
    caveEvent = null
    // 过期同样是「今日已巡过」:不记这天的额度,30s 轮询就会天天反复重掷,
    // 「每日一巡」能被视而不见地无限刷(与掷签失败那条 invariant 同规)
    usePlayerStore().markCaveEventToday(todayLocalNum())
    return null
  }
  return caveEvent
}

/** 选择洞府巡游选项 */
export function chooseCaveOption(optionIndex: number): void {
  if (!caveEvent || optionIndex >= caveEvent.options.length) return
  const opt = caveEvent.options[optionIndex]!
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const cult = useCultivationStore()

  // 应用奖励
  const now = Date.now()
  if (opt.reward) {
    switch (opt.reward.type) {
      case 'exp':
        player.gainExp(gn(opt.reward.value as number))
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

  // 应用惩罚:按 penalty.type 映射已注册的惩罚 buff(如 cave_penalty_cultivationSpeed)。
  // 修的是"动态随机 id 永远查无此 buff"——惩罚名称就是 type,不该掺时间戳
  if (opt.penalty) {
    cult.addBuff(`cave_penalty_${opt.penalty.type}`, now)
  }

  const today = todayLocalNum()
  player.markCaveEventToday(today)
  // 选完给一句回执——此前选完弹窗直接关,拿到什么全凭感觉
  useUiStore().toast(`洞府巡游·${caveOptionText(opt)}`, 'success')
  telemetry().record('cave_choose', 'modal', `洞府选择:${opt.label}`)
  caveEvent = null
}

/**
 * 玩家离开本次洞府巡游 = 今日不赴巡游。
 * 只清模块级事件是不够的:mayTriggerCaveEvent 每 30s 轮询会重新掷一个新事件弹回来,
 * 「离开」就成了白按。离开与选择一样占用今日一次 —— 决定留给玩家,代价也明确
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
