/**
 * 以灵气疗伤(修复)
 *
 * 灵气既是突破的门槛,也是「修复」的本钱:负伤、遭心魔时,可耗灵气静养,
 * 立刻平复伤势,而不必干等 buff 自然过期。
 *
 * 代价取标称容量的固定比例 —— 于是它随境界指数增长(容量 ×4/境),
 * 与「上界的灵气/修复是指数级难度」这条设计一致:越往上,一次修复越贵,
 * 而积余机制保证你存得起。
 */
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useCultivationStore } from '@/stores/cultivation'
import { useUiStore } from '@/stores/ui'
import { formatNum } from '@/utils/format'
import {
  repairDoneToast,
  repairIdleToast,
  repairShortToast
} from '@/ui/cultivationText'

/** 一次修复耗去标称灵气容量的比例 */
export const QI_REPAIR_COST_RATIO = 0.35

/** 当前修复代价(随灵气容量指数增长) */
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
    ui.toast(repairShortToast(formatNum(view.shortfall), formatNum(view.cost)), 'warn')
    return false
  }
  resources.setQi(resources.qi - view.cost, player.qiCapValue)
  cultivation.clearNegativeBuffs()
  ui.toast(repairDoneToast(formatNum(view.cost)), 'success')
  return true
}
