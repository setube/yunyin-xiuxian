/**
 * 星象值日(Phase 34.5)—— 二十八宿轮值,利一方界域
 *
 * 与天时的分工:
 * - 天时:今日天地之气(灵雨/赤阳/雷鸣……),影响**所有**地方的收益;
 * - 值日之宿:今日之星象,只利**一方界域**(四象配四界的游戏约定,见 data/xiangxiu)。
 *
 * 故它给的不是又一个全局加成,而是一个"今日该往哪里去"的提示:
 * 值日宿所属之象,所配界域的际遇更易遇上(见 exploration 的际遇判定)。
 *
 * 确定性:由游戏总秒数派生,同一游戏日固定,无现实时间依赖(与天时同法)。
 */
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { gameDay } from './formulas'
import { MANSIONS, imageDef, type MansionDef } from '@/data/xiangxiu'
import { regionDef } from '@/data/regions'
import { WORLDS, worldOf } from '@/data/realms'
import { MANSION_EVENT_LUCK } from '@/data/constants'
import type { WorldId } from '@/types'

/** 玩家把今日值日定向到某界的覆盖记录(存于 player store,见 stores/player) */
export interface MansionRedirect {
  /** 生效的游戏日 —— 不是今天就不算数(次日自动回落) */
  gameDay: number
  /** 玩家选中要利的界域 */
  worldId: WorldId
  /** 当日已定向了几次(限 MANSION_REDIRECT_MAX,达上限即回落天数派生) */
  count: number
}

/** 游戏日 → 值日之宿(28 日一轮) */
export function mansionOfDay(day: number): MansionDef {
  const idx = ((Math.floor(day) % MANSIONS.length) + MANSIONS.length) % MANSIONS.length
  return MANSIONS[idx]!
}

/** 今日值日之宿 */
export function todayMansion(): MansionDef {
  return mansionOfDay(currentGameDay())
}

/** 当前游戏日(秒 → 日),固定口径一处出 */
export function currentGameDay(): number {
  return gameDay(useGameStore().totalPlaySec)
}

/** 此宿所利之界域(四象配四界的游戏约定) */
export function favoredWorld(mansion: MansionDef): WorldId {
  return imageDef(mansion.image)?.world ?? 'mortal'
}

/**
 * 玩家把今日值日定向到某界的覆盖,是否今天生效。
 *
 * 只要这条覆盖是今天记下的、确认改向过(count≥1)、且界域 id 合法,就一直生效——
 * 每成功改向一次就换一次今日所利界域(最后一改为准);当日改满 MANSION_REDIRECT_MAX
 * 只是**不再允许继续改向**,并不会撤销已生效的定向(付费改向不白费)。
 * 任一条件不满足 → 返回 null,由调用方回落到天数派生 —— 默认行为与从前完全一致。
 */
export function activeRedirectWorld(day: number, redirect: MansionRedirect | null): WorldId | null {
  if (!redirect) return null
  if (redirect.gameDay !== day) return null
  if (redirect.count < 1) return null
  if (!WORLDS.some(w => w.id === redirect.worldId)) return null
  return redirect.worldId
}

/** 玩家当前记下的定向覆盖(读 player store) */
export function currentRedirect(): MansionRedirect | null {
  return usePlayerStore().mansionRedirect
}

/**
 * 今日所利界域(有效口径):有生效定向走定向,否则走天数派生。
 * 展示与判定共用这一枚,避免一处看定向、一处看天数而打架。
 */
export function effectiveFavoredWorld(): WorldId {
  return activeRedirectWorld(currentGameDay(), currentRedirect()) ?? favoredWorld(todayMansion())
}

/** 某地界今日是否得星象之利 */
export function isFavoredRegion(regionId: string): boolean {
  const region = regionDef(regionId)
  if (!region) return false
  return effectiveFavoredWorld() === worldOf(region.minRealm).id
}

/**
 * 星象给此地的际遇加成:值日宿所配界域之地 +10%,他处不加。
 * 值日之宿本身不加全局数值 —— 否则它就成了第二个天时。
 */
export function mansionEventLuck(regionId: string): number {
  return isFavoredRegion(regionId) ? MANSION_EVENT_LUCK : 0
}

/** 星象加成换算成展示用的百分数 —— 三处页面/文案共用一枚,不各算各的 */
export function mansionLuckPercent(): number {
  return Math.round(MANSION_EVENT_LUCK * 100)
}

/** 今日星象一句话(展示层直接用,不另写一份) */
export function todayMansionLine(): string {
  const m = todayMansion()
  const img = imageDef(m.image)
  return `${m.fullName}直日 · ${img?.name ?? ''}${img?.direction ?? ''}方 · 分野${m.domain} —— 宜${m.good}`
}
