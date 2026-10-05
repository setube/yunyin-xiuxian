/**
 * 进度服务 —— 计数器 / 成就 / 主线任务 / 每日任务 / 奖励发放
 * 所有系统通过 track() 汇报行为,由此统一驱动成就与任务
 */
import type { AchvCond, CounterKey, RewardBundle } from '@/types'
import { gte, sub, toNum } from '@/utils/gnum'
import { todayStr } from '@/utils/time'
import { ACHIEVEMENTS } from '@/data/achievements'
import { DAILY_TASKS, MAIN_QUESTS } from '@/data/quests'
import { LIFESPAN_CRITICAL_RATIO } from '@/data/constants'
import { titleDef } from '@/data/titles'
import { pillDef } from '@/data/pills'
import { stoneByTier } from './formulas'
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
  if (!(gap > 0)) return 0
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
