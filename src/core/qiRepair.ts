/**
 * 以灵气疗伤(修复):负伤、遭心魔时耗灵气立刻平复伤势。
 * 代价取标称容量的固定比例,随境界指数增长。
 */
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useCultivationStore } from '@/stores/cultivation'
import { useUiStore } from '@/stores/ui'
import { formatGap, formatNum } from '@/utils/format'
import {
  repairDoneToast,
  repairIdleToast,
  repairShortToast
} from '@/ui/cultivationText'

/** 一次修复耗去标称灵气容量的比例 */
export const QI_REPAIR_COST_RATIO = 0.35

/** 当前修复代价 */
export function qiRepairCost(): number {
  return Math.ceil(usePlayerStore().qiCapValue * QI_REPAIR_COST_RATIO)
}

/** 是否处于可修复状态(身负伤势/心魔) */
export function isInjured(): boolean {
  const cultivation = useCultivationStore()
  return cultivation.buffs.some(b => b.defId === 'injury' || b.defId === 'curse_xinmo')
}

export interface QiRepairView {
  injured: boolean
  cost: number
  affordable: boolean
  /** 灵气尚差;足够时为 0 */
  shortfall: number
}

export function qiRepairView(): QiRepairView {
  const resources = useResourcesStore()
  const cost = qiRepairCost()
  const shortfall = Math.max(0, cost - resources.qi)
  return { injured: isInjured(), cost, affordable: shortfall === 0, shortfall }
}

/** 以灵气疗伤:付得起且确有伤势才生效 */
export function repairWithQi(): boolean {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const cultivation = useCultivationStore()
  const ui = useUiStore()
  if (!isInjured()) {
    ui.toast(repairIdleToast(), 'warn')
    return false
  }
  const view = qiRepairView()
  if (!view.affordable) {
    // 差额用 formatGap:灵气按 dt 累积是小数,formatNum 四舍五入会少报(1.824 → 1.8,补足仍不够)
    ui.toast(repairShortToast(formatGap(view.shortfall), formatNum(view.cost)), 'warn')
    return false
  }
  resources.setQi(resources.qi - view.cost, player.qiCapValue)
  cultivation.clearNegativeBuffs()
  ui.toast(repairDoneToast(formatNum(view.cost)), 'success')
  return true
}
