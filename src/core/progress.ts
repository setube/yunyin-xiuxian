/** 进度服务:计数器 / 成就 / 主线任务 / 每日任务 / 奖励发放;各系统经 track() 上报行为。 */
import type { AchvCond, CounterKey, RewardBundle } from '@/types'
import { gte, sub, toNum } from '@/utils/gnum'
import { localDayNum, todayStr } from '@/utils/time'
import { ACHIEVEMENTS } from '@/data/achievements'
import { DAILY_TASKS, MAIN_QUESTS } from '@/data/quests'
import { LIFESPAN_CRITICAL_RATIO, QI_RICH_RATIO, CULT_SPEED_SOFT_CAP_T, CULT_SPEED_SOFT_CAP_DIMINISH } from '@/data/constants'
import { titleDef } from '@/data/titles'
import { pillDef } from '@/data/pills'
import { buffDef } from '@/data/buffs'
import { HERB_GRADE_SHORT, herbGradeOfMajor } from '@/data/herbGrades'
import { maxTierForMajor } from '@/data/regions'
import { baseCultPerSec, stoneByTier } from './formulas'
import { modOf } from './statsCalc'
import { formatGN } from '@/utils/format'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useUiStore } from '@/stores/ui'
import type { CollectionCategory } from '@/stores/quests'

/** 玩家当前的等效掉落层级,与坊市/悬赏/丹药/锻造同尺 */
export function playerTier(): number {
  return maxTierForMajor(usePlayerStore().major)
}

/** 资源行,预览与发放共用;灵石按当前层级折算 */
function resourceParts(bundle: RewardBundle): string[] {
  const lines: string[] = []
  if (bundle.stoneTier) lines.push(`灵石 +${formatGN(stoneByTier(playerTier(), bundle.stoneTier))}`)
  if (bundle.wudao) lines.push(`悟道点 +${bundle.wudao}`)
  if (bundle.herb) lines.push(`${HERB_GRADE_SHORT[herbGradeOfMajor(usePlayerStore().major)]}灵草 +${bundle.herb}`)
  if (bundle.ore) lines.push(`玄铁 +${bundle.ore}`)
  if (bundle.page) lines.push(`残页 +${bundle.page}`)
  if (bundle.dust) lines.push(`器灵尘 +${bundle.dust}`)
  if (bundle.pillId && pillDef(bundle.pillId)) lines.push(`丹药「${pillDef(bundle.pillId)!.name}」`)
  return lines
}

/** 领赏前的清单(含称号);数字与 grantReward 入账同一套折算 */
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

/** 任务 / 成就条件的唯一判定;界面进度读数须与发赏判定同源,不另写比较 */
export function evalCond(cond: AchvCond): boolean {
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
    // custom 只在此判 realm_<major>_<sub>;其余状态型键(lifespanLow / lifespan10k / stone1m)由 checkStateAchievements 触发
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

/** 周期检查:寿元/灵石等状态型成就,并补扫全成就与主线(二者只在 track()/trackRealm() 求值,老档/导入档靠此自愈) */
export function checkStateAchievements(): void {
  checkAchievements()
  checkMainQuest()
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
    ui.toast(withReward(`主线已成「${current.name}」`, lines), 'success')
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

/** 修为圆满的估算秒数:缺口 ÷ player.cultPerSec(闭关/丹药/天时俱已在内);已圆满或速率为 0 返回 0 */
export function expEtaSec(): number {
  const player = usePlayerStore()
  if (player.expFull) return 0
  // cultPerSec 是普通数,不经 toNum
  const rate = player.cultPerSec
  if (!(rate > 0)) return 0
  const gap = toNum(sub(player.expReq, player.exp))
  // toNum 在指数 >308 时返回 Infinity,须排掉
  if (!(gap > 0) || !Number.isFinite(gap)) return 0
  return gap / rate
}

/** 灵气回满的估算秒数:缺口 ÷ qiRegenPerSec,与灵气条同源;已满或零恢复返回 0 */
export function qiEtaSec(): number {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const gap = player.qiCapValue - resources.qi
  if (!(gap > 0)) return 0
  const rate = player.qiRegenPerSec
  if (!(rate > 0)) return 0
  return gap / rate
}

/** 距「灵气充盈」的估算秒数;判据须与 player store 的 qiRich 同一道界。已充盈或零恢复返回 0 */
export function qiRichEtaSec(): number {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const gap = player.qiCapValue * QI_RICH_RATIO - resources.qi
  if (!(gap > 0)) return 0
  const rate = player.qiRegenPerSec
  if (!(rate > 0)) return 0
  return gap / rate
}

/**
 * 闭关的边际修炼速度(过软上限折算,见 statsCalc CULT_SPEED_SOFT_CAP)。
 * cappedTotal:修炼行当前已封顶的 cultivationSpeed;boost:闭关词条加成。
 * 返回封顶后的新 total − 封顶后的原 total;阈值以下恰为 boost。
 */
export function retreatMarginalSpeed(cappedTotal: number, boost: number): number {
  const U = cappedTotal > CULT_SPEED_SOFT_CAP_T ? CULT_SPEED_SOFT_CAP_T + (cappedTotal - CULT_SPEED_SOFT_CAP_T) / CULT_SPEED_SOFT_CAP_DIMINISH : cappedTotal
  const U2 = U + boost
  const C2 = U2 > CULT_SPEED_SOFT_CAP_T ? CULT_SPEED_SOFT_CAP_T + (U2 - CULT_SPEED_SOFT_CAP_T) * CULT_SPEED_SOFT_CAP_DIMINISH : U2
  return C2 - cappedTotal
}

/** 闭关「约多得修为」的每多得速率:只报加成部分;与修炼行同读 baseCultPerSec、同走一道 soft cap */
function retreatGainPerSec(): number {
  const player = usePlayerStore()
  const def = buffDef('retreat')
  if (!def) return 0
  const boost = def.mods.cultivationSpeed ?? 0
  if (!(boost > 0)) return 0
  const base = baseCultPerSec(player.major, player.sub)
  if (!(base > 0)) return 0
  return base * retreatMarginalSpeed(modOf(player.finalStats.mods, 'cultivationSpeed'), boost)
}

/**
 * 闭关「约多得」的修为预览,只报加成部分。速率与时长取自 buffs.ts 的 retreat 本体,不手抄 1.5 / 300。
 * 只在不闭关时出现:报「点了会多拿多少」。
 */
export function retreatGainText(): string {
  const def = buffDef('retreat')
  const perSec = retreatGainPerSec()
  if (!def || !(perSec > 0)) return ''
  const total = perSec * def.durationSec
  return total > 0 ? `约多得修为 ${formatGN(total)}` : ''
}

/** 闭关中「已多得」修为的活数,与预览同一速率;elapsedSec 由调用方按 buff 已走时长给 */
export function retreatGainedText(elapsedSec: number): string {
  const perSec = retreatGainPerSec()
  if (!(perSec > 0) || !(elapsedSec > 0)) return ''
  const gained = perSec * elapsedSec
  return gained > 0 ? `已多得修为 ${formatGN(gained)}` : ''
}

/**
 * 灵气积余蓄满的估算秒数。积余上限 = 标称容量 × QI_BANK_MULT(见 resources.setQi 与 player.qiBankCapValue);
 * 未进积余段(qi ≤ 标称容量)或零恢复返回 0。
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
  /*
   * 只允许**向前**翻日:日期不同不等于该重开日课。
   *
   * 系统时钟回拨时 `today` 会退到旧日期,`!==` 成立 → `rolloverDaily` 清空 `done`,
   * 玩家当日已完成的日课被重置、可以再做一遍(审查意见里那条「回拨会重置日课进度」)。
   * 这与第 54 轮洞府巡游那处同型:那里从 `===` 改成 `>=`,这里从 `!==` 改成「更大才翻」。
   *
   * 判据用日号(YYYYMMDD 整数)而非字符串:`2026-11-1` 与 `2026-11-10` 的字典序会出错。
   */
  const todayNum = localDayNum(Date.now())
  const storedNum = dayStrToNum(quests.daily.date)
  if (storedNum === null || todayNum > storedNum) {
    quests.rolloverDaily(today)
  }
}

/** 「YYYY-M-D」→ 日号整数;认不出返回 null(按「没有记录」处理,允许翻日) */
function dayStrToNum(s: string): number | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  return y * 10000 + mo * 100 + d
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
  // 小层也走这里:realm_<major>_<sub> 型成就修至该层即解锁
  checkAchievements()
  checkMainQuest()
}

export function collect(category: CollectionCategory, id: string): void {
  useQuestsStore().collect(category, id)
}
