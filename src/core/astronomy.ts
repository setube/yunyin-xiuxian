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
import { MANSIONS, imageDef, type MansionDef } from '@/data/xiangxiu'
import { regionDef } from '@/data/regions'
import { worldOf } from '@/data/realms'
import { MANSION_EVENT_LUCK } from '@/data/constants'
import type { WorldId } from '@/types'

/** 游戏日 → 值日之宿(28 日一轮) */
export function mansionOfDay(day: number): MansionDef {
  const idx = ((Math.floor(day) % MANSIONS.length) + MANSIONS.length) % MANSIONS.length
  return MANSIONS[idx]!
}

/** 今日值日之宿 */
export function todayMansion(): MansionDef {
  return mansionOfDay(Math.floor(useGameStore().totalPlaySec / 86400))
}

/** 此宿所利之界域(四象配四界的游戏约定) */
export function favoredWorld(mansion: MansionDef): WorldId {
  return imageDef(mansion.image)?.world ?? 'mortal'
}

/** 某地界今日是否得星象之利 */
export function isFavoredRegion(regionId: string): boolean {
  const region = regionDef(regionId)
  if (!region) return false
  return favoredWorld(todayMansion()) === worldOf(region.minRealm).id
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
