/**
 * 进度服务 —— 计数器 / 成就 / 主线任务 / 每日任务 / 奖励发放
 * 所有系统通过 track() 汇报行为,由此统一驱动成就与任务
 */
import type { AchvCond, CounterKey, RewardBundle } from '@/types'
import { gte, sub, toNum } from '@/utils/gnum'
import { todayStr } from '@/utils/time'
import { ACHIEVEMENTS } from '@/data/achievements'
import { DAILY_TASKS, MAIN_QUESTS } from '@/data/quests'
import { LIFESPAN_CRITICAL_RATIO, QI_RICH_RATIO } from '@/data/constants'
import { titleDef } from '@/data/titles'
import { pillDef } from '@/data/pills'
import { buffDef } from '@/data/buffs'
import { baseCultPerSec, stoneByTier } from './formulas'
import { formatGN } from '@/utils/format'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useUiStore } from '@/stores/ui'
import type { CollectionCategory } from '@/stores/quests'

/** 玩家当前所处的等效掉落层级 */
export function playerTier(): number {
  const player = usePlayerStore()
  return Math.min(20, player.major * 2 + 1 + (player.sub >= 5 ? 1 : 0))
}

/** 资源行与发放共用。灵石按当前层级折算,不写死一个数。 */
function resourceParts(bundle: RewardBundle): string[] {
  const lines: string[] = []
  if (bundle.stoneTier) lines.push(`灵石 +${formatGN(stoneByTier(playerTier(), bundle.stoneTier))}`)
  if (bundle.wudao) lines.push(`悟道点 +${bundle.wudao}`)
  if (bundle.herb) lines.push(`灵草 +${bundle.herb}`)
  if (bundle.ore) lines.push(`玄铁 +${bundle.ore}`)
  if (bundle.page) lines.push(`残页 +${bundle.page}`)
  if (bundle.dust) lines.push(`器灵尘 +${bundle.dust}`)
  if (bundle.pillId && pillDef(bundle.pillId)) lines.push(`丹药「${pillDef(bundle.pillId)!.name}」`)
  return lines
}

/** 领赏前就能看见的清单(含称号)。数字与 grantReward 入账的是同一套折算。 */
export function rewardPreview(bundle: RewardBundle): string {
  const lines = resourceParts(bundle)
  if (bundle.titleId && titleDef(bundle.titleId)) lines.push(`称号「${titleDef(bundle.titleId)!.name}」`)
  return lines.join(' · ')
}

function withReward(prefix: string, lines: string[]): string {
  return lines.length ? `${prefix} · ${lines.join(' · ')}` : prefix
}

export function grantReward(bundle: RewardBundle, quiet = false): string[] {
  const resources = useResourcesStore()
  const quests = useQuestsStore()
  const inventory = useInventoryStore()
  const ui = useUiStore()
  if (bundle.stoneTier) resources.addStone(stoneByTier(playerTier(), bundle.stoneTier))
  if (bundle.wudao) resources.addSmall('wudao', bundle.wudao)
  if (bundle.herb) resources.addSmall('herb', bundle.herb)
  if (bundle.ore) resources.addSmall('ore', bundle.ore)
  if (bundle.page) resources.addSmall('page', bundle.page)
  if (bundle.dust) resources.addSmall('dust', bundle.dust)
  if (bundle.pillId && pillDef(bundle.pillId)) inventory.addPill(bundle.pillId, 1)
  const lines = resourceParts(bundle)
  if (bundle.titleId && titleDef(bundle.titleId) && quests.ownTitle(bundle.titleId)) {
    const title = `称号「${titleDef(bundle.titleId)!.name}」`
    lines.push(title)
    if (!quiet) ui.toast(`获得${title}`, 'rare')
  }
  return lines
}

function evalCond(cond: AchvCond): boolean {
  const quests = useQuestsStore()
  const player = usePlayerStore()
  switch (cond.type) {
    case 'counter':
      return quests.counter(cond.key) >= cond.value
    case 'realm':
      return player.major >= cond.major
    case 'quality':
      return false // 品质成就由 checkQuality 显式触发
    case 'custom': {
      const m = /^realm_(\d+)_(\d+)$/.exec(cond.key)
      if (m) {
        const major = Number(m[1])
        const sub = Number(m[2])
        return player.major > major || (player.major === major && player.sub >= sub)
      }
      return false
    }
  }
}

function unlockAchievement(id: string): void {
  const quests = useQuestsStore()
  const ui = useUiStore()
  const def = ACHIEVEMENTS.find(a => a.id === id)
  if (!def || !quests.unlockAchievement(id)) return
  const lines = def.reward ? grantReward(def.reward, true) : []
  ui.toast(withReward(`成就达成「${def.name}」`, lines), 'rare')
}

/** 检查所有可自动判定的成就 */
export function checkAchievements(): void {
  const quests = useQuestsStore()
  for (const def of ACHIEVEMENTS) {
    if (quests.hasAchieved(def.id)) continue
    if (def.cond.type === 'quality') continue
    /**
     * custom 分两种:
     * - `realm_<major>_<sub>`:状态可判,这里直接判(此前被一并跳过,于是这条分支成了死代码,
     *   「炼气圆满」那类成就根本无人解锁);
     * - 其余状态型键(lifespanLow / lifespan10k / stone1m):由 checkStateAchievements 显式触发。
     */
    if (def.cond.type === 'custom' && !/^realm_\d+_\d+$/.test(def.cond.key)) continue
    if (evalCond(def.cond)) unlockAchievement(def.id)
  }
}

/** 品质成就(获得装备时显式调用) */
export function checkQualityAchievement(rank: number): void {
  const quests = useQuestsStore()
  for (const def of ACHIEVEMENTS) {
    if (def.cond.type === 'quality' && !quests.hasAchieved(def.id) && rank >= def.cond.rank) {
      unlockAchievement(def.id)
    }
  }
}

/** 特判成就 */
export function checkCustomAchievement(key: string): void {
  const quests = useQuestsStore()
  for (const def of ACHIEVEMENTS) {
    if (def.cond.type === 'custom' && def.cond.key === key && !quests.hasAchieved(def.id)) {
      unlockAchievement(def.id)
    }
  }
}

/** 周期检查(寿元/灵石等状态型成就) */
export function checkStateAchievements(): void {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  if (player.lifespanRatio <= LIFESPAN_CRITICAL_RATIO && player.lifespanRatio > 0) checkCustomAchievement('lifespanLow')
  if (player.lifespanMax >= 10000) checkCustomAchievement('lifespan10k')
  if (gte(resources.spiritStone, { m: 1, e: 6 })) checkCustomAchievement('stone1m')
}

function checkMainQuest(): void {
  const quests = useQuestsStore()
  const ui = useUiStore()
  let guard = 0
  while (guard < 5) {
    guard += 1
    const current = MAIN_QUESTS[quests.mainIdx]
    if (!current || !evalCond(current.cond)) break
    const lines = grantReward(current.reward, true)
    ui.toast(withReward(`任务完成「${current.name}」`, lines), 'success')
    quests.advanceMain()
  }
}

function checkDaily(): void {
  const quests = useQuestsStore()
  const ui = useUiStore()
  for (const task of DAILY_TASKS) {
    if (quests.daily.done.includes(task.id)) continue
    if (quests.dailyDelta(task.counterKey) >= task.target) {
      quests.markDailyDone(task.id)
      const lines = grantReward(task.reward, true)
      ui.toast(withReward(`日课已成「${task.name}」`, lines), 'success')
    }
  }
}

/**
 * 修为圆满的估算时长(秒)—— 按现速。
 *
 * 现速即 player.cultPerSec(闭关/丹药/天时俱已在内),这里只做
 * 「缺口 ÷ 现速」这一道除法,不另造口径;已圆满或速率为 0 时返回 0。
 * 离线上限之外不再累积,故这只是「按现速」的估算,不是担保 ——
 * 与修炼页那句「按现速,修为圆满约……」的措辞是同一份承诺。
 */
export function expEtaSec(): number {
  const player = usePlayerStore()
  if (player.expFull) return 0
  // cultPerSec 本就是普通数(见 player store),别拿 toNum 去拧它
  const rate = player.cultPerSec
  if (!(rate > 0)) return 0
  const gap = toNum(sub(player.expReq, player.exp))
  // toNum 在指数 >308 时返回 Infinity(见 utils/gnum) —— Infinity > 0 恒真,
  // 若不排掉,Infinity/rate 会把「修为圆满估算」算成无穷时长的坏读数。
  if (!(gap > 0) || !Number.isFinite(gap)) return 0
  return gap / rate
}

/**
 * 灵气回满的估算时长(秒)—— 按现速。
 *
 * 与 expEtaSec 同法:缺口 = qiCapValue − 当前灵气,除以现速 qiRegenPerSec,
 * 只做这一道除法,与灵气条读的是同一份数;已满或零恢复时返回 0。
 * 灵气满后恢复不再累积(超出的部分那是积余容量),故这条只在未满时出现。
 */
export function qiEtaSec(): number {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const gap = player.qiCapValue - resources.qi
  if (!(gap > 0)) return 0
  const rate = player.qiRegenPerSec
  if (!(rate > 0)) return 0
  return gap / rate
}

/**
 * 距「灵气充盈」的估算时长(秒)—— 按现速。
 *
 * 灵气过半即滋养修为(见 player store 的 qiRich / statsCalc 的 QI_RICH_BONUS),
 * 这条答的是「修为还有多久要往上跳一档」。判据与 qiRich 同一道界:
 * 缺口 = qiCapValue × QI_RICH_RATIO − 当前灵气,除以现速;
 * 已在充盈线以上或零恢复时返回 0。
 */
export function qiRichEtaSec(): number {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const gap = player.qiCapValue * QI_RICH_RATIO - resources.qi
  if (!(gap > 0)) return 0
  const rate = player.qiRegenPerSec
  if (!(rate > 0)) return 0
  return gap / rate
}

/** 闭关「每多得修为/秒」—— 预览与闭关中活数共用同一份 base 与加成,不各算一遍 */
function retreatGainPerSec(): number {
  const player = usePlayerStore()
  const def = buffDef('retreat')
  if (!def) return 0
  const boost = def.mods.cultivationSpeed ?? 0
  if (!(boost > 0)) return 0
  const base = baseCultPerSec(player.major, player.sub)
  return base > 0 ? base * boost : 0
}

/**
 * 闭关一炷香「约多得」的修为预览 —— 只报加成那部分,不是闭关期间全部产出。
 *
 * 速率与时长都从 buffs.ts 的 retreat 本体取,不手抄 1.5 / 300 两处:
 * 增量 = baseCultPerSec(境界) × 词条加成 × 时长(秒),与修炼行读的
 * baseCultPerSec 是同一份数(玩家现有其他修为词条与闭关增量互不影响,
 * 闭关只在这之上再加 1.5 倍 base)。闭关中 buff 已落在 cultPerSec 上,
 * 这条只在不闭关时出现,报的是「点了会多拿多少」而不是「正在拿多少」。
 */
export function retreatGainText(): string {
  const def = buffDef('retreat')
  const perSec = retreatGainPerSec()
  if (!def || !(perSec > 0)) return ''
  const total = perSec * def.durationSec
  return total > 0 ? `此行约多得修为 ${formatGN(total)}` : ''
}

/**
 * 闭关已过 elapsed 秒「已多得/多得的」修为 —— 与预览行同一份每多得速率,
 * 闭关中的活数(elapsed 由调用方按 buff 已走时长给,不在此手抄 300)。
 */
export function retreatGainedText(elapsedSec: number): string {
  const perSec = retreatGainPerSec()
  if (!(perSec > 0) || !(elapsedSec > 0)) return ''
  const gained = perSec * elapsedSec
  return gained > 0 ? `此行已多得修为 ${formatGN(gained)}` : ''
}

/**
 * 灵气积余蓄满的估算时长(秒)—— 按现速。
 *
 * 灵气越过标称容量后进入「积余」段(上限 = 标称容量 × QI_BANK_MULT,见
 * resources.setQi 与 player.qiBankCapValue),恢复仍照常累积、不因「满了」就收手。
 * 这条答的是积余阶段的「蓄满还差多久」:缺口 = qiBankCapValue − 当前灵气,除以现速,
 * 与灵气条读同一份数;未积余(qi ≤ 标称容量)或零恢复时返回 0 —— 非积余阶段不报这事。
 */
export function qiBankEtaSec(): number {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  if (!(resources.qi > player.qiCapValue)) return 0
  const gap = player.qiBankCapValue - resources.qi
  if (!(gap > 0)) return 0
  const rate = player.qiRegenPerSec
  if (!(rate > 0)) return 0
  return gap / rate
}

/** 每日重置(引擎在日期变化时调用) */
export function rolloverDailyIfNeeded(): void {
  const quests = useQuestsStore()
  const today = todayStr()
  if (quests.daily.date !== today) {
    quests.rolloverDaily(today)
  }
}

/** 统一行为汇报入口 */
export function track(key: CounterKey, n = 1): void {
  const quests = useQuestsStore()
  quests.inc(key, n)
  checkAchievements()
  checkMainQuest()
  checkDaily()
}

/** 境界成就(突破后调用) */
export function trackRealm(): void {
  const player = usePlayerStore()
  const quests = useQuestsStore()
  for (const def of ACHIEVEMENTS) {
    if (def.cond.type === 'realm' && !quests.hasAchieved(def.id) && player.major >= def.cond.major) {
      unlockAchievement(def.id)
    }
  }
  // 小层也走这里:realm_<major>_<sub> 型成就要在「修至本境圆满」那一刻就解锁
  checkAchievements()
  checkMainQuest()
}

export function collect(category: CollectionCategory, id: string): void {
  useQuestsStore().collect(category, id)
}
