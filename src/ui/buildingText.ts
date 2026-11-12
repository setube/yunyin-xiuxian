/**
 * 洞府营造提示(起造与再营)。卡片上的拒绝原因与 toast 同源。
 * 不写「升至 N 级」;境界、层数、灵石玄铁照实报。
 */
import { REALMS } from '@/data/realms'
import { peakLabel } from './peakLabel'

export function buildingRealmGate(realmName: string): string {
  return `需${realmName}境`
}

/** 建筑境界闸所对的境名:unlockRealm 即 REALMS 下标(与 player.major 同轴,判据 player.major < def.unlockRealm) */
export function buildingGateRealmName(unlockRealm: number): string {
  return REALMS[unlockRealm]?.name ?? '更高'
}

/**
 * 建筑满级。说法取 ui/peakLabel —— 与功法满级、功法行标签同一句,
 * 改词时只改那一处(AGENTS.md:一个状态只说一个事实)。
 */
export function buildingPeakToast(): string {
  return peakLabel()
}

export function buildingMansionGateToast(): string {
  return '辖于洞府'
}

/** 缺料侧别:单缺灵石 / 单缺玄铁 / 双缺 */
export type BuildingShortSide = 'stone' | 'ore' | 'both'

/** 卡面与 toast 共用的精确缺口句;调用方传 formatGN 后的石数 */
export function buildingShortReason(side: BuildingShortSide, stoneText: string, ore: number): string {
  if (side === 'stone') return `灵石尚差 ${stoneText}`
  if (side === 'ore') return `玄铁尚差 ${ore} 块`
  return `灵石尚差 ${stoneText} · 玄铁尚差 ${ore} 块`
}

/** 有精确缺口时须点名缺哪一样;无侧别回落泛称 */
export function buildingShortToast(side?: BuildingShortSide, stoneText = '', ore = 0): string {
  if (side) return buildingShortReason(side, stoneText, ore)
  return '灵石或玄铁不足'
}

export function buildingDoneToast(name: string, level: number): string {
  return `「${name}」已至 ${level} 级`
}

/**
 * 建筑连升只报一次总况(stoneText 由调用方 formatGN)。
 *
 * 原句「「X」连升 N 级至 M 级 · 共耗灵石 S · 玄铁 O 块」静态汉字 15 个,越过规范里
 * 「提示尽量 ≤ 12 字」那条;而单次完成那句只有 6 字,同族相差一倍多。
 * 现去掉「共耗」「块」「至」三处可省的词(「连升 3 级至 5 级」改成「连升 3 级 → 5 级」):
 * 最长建筑名(聚灵阵,3 字)下静态 11 字,数值与单位照旧一个不少。
 */
export function buildingBatchDoneToast(name: string, levels: number, newLevel: number, stoneText: string, ore: number): string {
  return `「${name}」连升 ${levels} 级 → ${newLevel} 级 · 灵石 ${stoneText} · 玄铁 ${ore}`
}

export function buildingActLabel(level: number): string {
  return level > 0 ? '再营' : '起造'
}
