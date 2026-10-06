/**
 * 洞府营造提示 —— 起造与再进。
 *
 * 卡片上的拒绝原因与 toast 同源。写成「不足」「升至 N 级」太硬,
 * 但境界、层数、灵石玄铁仍得报清。
 */
import { REALMS } from '@/data/realms'

export function buildingRealmGate(realmName: string): string {
  return `未至${realmName}境,难营此筑`
}

/**
 * 建筑境界闸所对的境名 —— unlockRealm 就是 REALMS 的下标(与 player.major 同轴:
 * 判据是 player.major < def.unlockRealm),故直接读表取境名,不手抄「金丹」这类字
 * (三处调用曾各有一份 ['炼气','筑基','金丹'],门槛一改四处对对不上)。
 */
export function buildingGateRealmName(unlockRealm: number): string {
  return REALMS[unlockRealm]?.name ?? '更高'
}

export function buildingPeakToast(): string {
  return '此筑已至层巅'
}

export function buildingMansionGateToast(): string {
  return '洞府未广,此筑难再升'
}

export function buildingShortToast(): string {
  return '灵石或玄铁未足,难营此工'
}

export function buildingDoneToast(name: string, level: number): string {
  return `「${name}」营造再进,已至 ${level} 级`
}

/** 建筑连升的总结账:一级一级报太吵,连升只报一次总况(stoneText 由调用方 formatGN 好) */
export function buildingBatchDoneToast(name: string, levels: number, newLevel: number, stoneText: string, ore: number): string {
  return `「${name}」连升 ${levels} 级,今至 ${newLevel} 级,共耗灵石 ${stoneText} · 玄铁 ${ore} 块`
}

export function buildingActLabel(level: number): string {
  return level > 0 ? '再营' : '起造'
}
