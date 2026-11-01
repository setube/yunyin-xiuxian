/** 灵脉服务:总容量 100,主脉 ≤70,副脉各 ≤30;主脉可付费迁移,已投点数不回收 */
import type { GNum } from '@/types'
import type { VeinId } from '@/data/veins'
import { veinDef } from '@/data/veins'
import { VEIN_MAIN_CAPACITY, VEIN_POINT_STONE, VEIN_SIDE_CAP, VEIN_TOTAL_CAPACITY, VEIN_UNLOCK_MAJOR } from '@/data/constants'
import { stoneByTier } from './formulas'
import { playerTier } from './progress'
import { formatGN, formatGap } from '@/utils/format'
import { gnZero, mulN, ratio, subClamp } from '@/utils/gnum'
import { playSfx } from './audio'
import { usePlayerStore } from '@/stores/player'
import { useDongfuStore } from '@/stores/dongfu'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'
import {
  veinBatchDoneToast,
  veinFullToast,
  veinPeakToast,
  veinShortToast,
  veinSwitchDoneToast,
  veinSwitchShortToast
} from '@/ui/veinText'

/** 灵脉是否开放(金丹起) */
export function veinsUnlocked(): boolean {
  return usePlayerStore().major >= VEIN_UNLOCK_MAJOR
}

/** 某条脉当前可投上限 */
export function veinCap(id: VeinId): number {
  const dongfu = useDongfuStore()
  // 未定主脉时按主脉档,须与 veinInvestPlan 的 effectiveCap 同口径
  return dongfu.veinMain === null || dongfu.veinMain === id ? VEIN_MAIN_CAPACITY : VEIN_SIDE_CAP
}

/** 单点投资成本(按玩家当前层级) */
export function veinPointCost(): GNum {
  return stoneByTier(playerTier(), VEIN_POINT_STONE)
}

export function veinSwitchCost(): GNum {
  return stoneByTier(playerTier(), VEIN_POINT_STONE * 20)
}

/** 改立主脉还差多少灵石(付得起为 0);入口、确认钮与服务拒因同读此处 */
export function veinSwitchShortfall(): GNum {
  const cost = veinSwitchCost()
  const resources = useResourcesStore()
  return resources.hasStone(cost) ? gnZero() : subClamp(cost, resources.spiritStone)
}

/** 单点投脉还差多少灵石(付得起为 0);单点、连投与服务拒因同读此处 */
export function veinPointShortfall(): GNum {
  const cost = veinPointCost()
  const resources = useResourcesStore()
  return resources.hasStone(cost) ? gnZero() : subClamp(cost, resources.spiritStone)
}

/** 向某条脉投一点;未定主脉时首投之脉成为主脉 */
export function investVein(id: VeinId): boolean {
  const dongfu = useDongfuStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  if (!veinsUnlocked()) return false

  if (dongfu.veinTotal >= VEIN_TOTAL_CAPACITY) {
    ui.toast(veinFullToast(), 'warn')
    return false
  }
  const current = dongfu.veinPoints[id] ?? 0
  if (current >= veinCap(id)) {
    ui.toast(veinPeakToast(dongfu.veinMain === id), 'warn')
    return false
  }
  const cost = veinPointCost()
  if (!resources.hasStone(cost)) {
    ui.toast(veinShortToast(formatGap(veinPointShortfall())), 'warn')
    return false
  }
  // 立主须在全部守卫之后:被拒的点击不得占主脉
  if (dongfu.veinMain === null) dongfu.setVeinMain(id)
  resources.spendStone(cost)
  dongfu.addVeinPoint(id, 1)
  return true
}

export interface VeinInvestPlan {
  /** 还能一口气连投的点数(该脉上限、总容量与灵石三者取小) */
  points: number
  /** 连投总耗的灵石 */
  stone: GNum
  /** points=0 时的原因:满却 / 总容量尽 / 灵石不足 */
  blocked: 'peak' | 'full' | 'short' | null
}

/** 连投计划,只算不动手;单点成本不随点数涨,总价 = 点数 × 单价;未定主脉按主脉档算余量 */
export function veinInvestPlan(veinId: VeinId): VeinInvestPlan {
  const dongfu = useDongfuStore()
  const resources = useResourcesStore()
  const zero = (blocked: VeinInvestPlan['blocked']): VeinInvestPlan => ({ points: 0, stone: gnZero(), blocked })
  if (!veinsUnlocked()) return zero(null)
  const current = dongfu.veinPoints[veinId] ?? 0
  if (dongfu.veinTotal >= VEIN_TOTAL_CAPACITY) return zero('full')
  const effectiveCap = dongfu.veinMain === null || dongfu.veinMain === veinId ? VEIN_MAIN_CAPACITY : VEIN_SIDE_CAP
  if (current >= effectiveCap) return zero('peak')
  const maxByCap = Math.min(effectiveCap - current, VEIN_TOTAL_CAPACITY - dongfu.veinTotal)
  if (maxByCap <= 0) return zero('peak')
  const byStone = Math.floor(ratio(resources.spiritStone, veinPointCost()))
  // 单价为 0/NaN 时 ratio 回 Infinity/NaN:按 maxByCap 取,不让 Infinity 进 plan
  const points = Math.min(maxByCap, Number.isFinite(byStone) ? byStone : maxByCap)
  if (points <= 0) return zero('short')
  return { points, stone: mulN(veinPointCost(), points), blocked: null }
}

/**
 * 连投:按 veinInvestPlan 总账一笔扣、一笔加,计划与执行间无 await;逐点累加有 GNum 尾差,与预览对不齐。
 * 返回实际投的点数,0 = 一注未成。
 */
export function investVeinBatch(veinId: VeinId): number {
  const dongfu = useDongfuStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  const plan = veinInvestPlan(veinId)
  if (plan.points === 0) {
    if (plan.blocked === 'full') ui.toast(veinFullToast(), 'warn')
    else if (plan.blocked === 'peak') ui.toast(veinPeakToast(dongfu.veinMain === veinId), 'warn')
    else ui.toast(veinShortToast(formatGap(veinPointShortfall())), 'warn')
    playSfx('warn')
    return 0
  }
  // 未定主脉时与单点同规则立主
  if (dongfu.veinMain === null) dongfu.setVeinMain(veinId)
  resources.spendStone(plan.stone)
  dongfu.addVeinPoint(veinId, plan.points)
  playSfx('success')
  ui.toast(veinBatchDoneToast(veinDef(veinId).name, plan.points, formatGN(plan.stone)), 'success')
  return plan.points
}

/** 迁移主脉:付费换向;原主脉点数保留(超出副脉上限的部分不再可投,但效果不失) */
export function switchMainVein(id: VeinId): boolean {
  const dongfu = useDongfuStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  if (!veinsUnlocked() || dongfu.veinMain === id) return false
  const cost = veinSwitchCost()
  const gap = veinSwitchShortfall()
  if (gap.m > 0) {
    playSfx('warn')
    ui.toast(veinSwitchShortToast(formatGap(gap)), 'warn')
    return false
  }
  resources.spendStone(cost)
  dongfu.setVeinMain(id)
  playSfx('success')
  ui.toast(veinSwitchDoneToast(veinDef(id).name), 'success')
  return true
}
