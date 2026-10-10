/**
 * 灵脉服务 —— Phase 30.3
 * 投点规则:总容量 100;主脉独占 70;副脉各 ≤30。
 * 主脉可迁移(付费换向),已投点数不回收——方向选择有代价但不锁死。
 */
import type { GNum } from '@/types'
import type { VeinId } from '@/data/veins'
import { veinDef } from '@/data/veins'
import { VEIN_MAIN_CAPACITY, VEIN_POINT_STONE, VEIN_SIDE_CAP, VEIN_TOTAL_CAPACITY, VEIN_UNLOCK_MAJOR } from '@/data/constants'
import { stoneByTier } from './formulas'
import { playerTier } from './progress'
import { formatGN } from '@/utils/format'
import { gnZero, mulN, ratio } from '@/utils/gnum'
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
  return dongfu.veinMain === id ? VEIN_MAIN_CAPACITY : VEIN_SIDE_CAP
}

/** 单点投资成本(按玩家当前层级) */
export function veinPointCost(): GNum {
  return stoneByTier(playerTier(), VEIN_POINT_STONE)
}

/** 主脉迁移费 */
export function veinSwitchCost(): GNum {
  return stoneByTier(playerTier(), VEIN_POINT_STONE * 20)
}

/**
 * 向某条脉投一点。
 * 未定主脉时,首次投点的脉自动成为主脉。
 */
export function investVein(id: VeinId): boolean {
  const dongfu = useDongfuStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  if (!veinsUnlocked()) return false

  if (dongfu.veinTotal >= VEIN_TOTAL_CAPACITY) {
    ui.toast(veinFullToast(), 'warn')
    return false
  }
  if (dongfu.veinMain === null) dongfu.setVeinMain(id)
  const current = dongfu.veinPoints[id] ?? 0
  if (current >= veinCap(id)) {
    ui.toast(veinPeakToast(dongfu.veinMain === id), 'warn')
    return false
  }
  const cost = veinPointCost()
  if (!resources.hasStone(cost)) {
    ui.toast(veinShortToast(), 'warn')
    return false
  }
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

/**
 * 连投计划:只算不动手。单点成本恒定(veinPointCost 不随点数涨),总价 = 点数 × 单价;
 * 上限取「该脉余量」与「总容量余量」较小者,再被灵石余额封顶。
 * 未定主脉时首投即成主脉 —— 计划按主脉档算余量,免得一口气把第一条投进 30 点就不肯多要。
 */
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
  // ratio 在 veinPointCost 为 0/NaN 时回 Infinity/NaN —— 显式收束:灵石不构成限制时,点数由
  // 容量维度(maxByCap)唯一决定,绝不把 Infinity 写进 plan。
  const points = Math.min(maxByCap, Number.isFinite(byStone) ? byStone : maxByCap)
  if (points <= 0) return zero('short')
  return { points, stone: mulN(veinPointCost(), points), blocked: null }
}

/**
 * 连投:按计划一口气把这条脉注到「还能注的地方」(该脉上限 / 总容量 / 灵石三者的最短)。
 * 计划与执行同一时刻、无 await,故直接按总账一笔扣、一笔加 —— 逐点累加会有 GNum
 * 浮点尾差,账目与预览对不齐;总账则与界面上报的数分毫不差。返回实际投的点数;0 = 一注未成。
 */
export function investVeinBatch(veinId: VeinId): number {
  const dongfu = useDongfuStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  const plan = veinInvestPlan(veinId)
  if (plan.points === 0) {
    if (plan.blocked === 'full') ui.toast(veinFullToast(), 'warn')
    else if (plan.blocked === 'peak') ui.toast(veinPeakToast(dongfu.veinMain === veinId), 'warn')
    else ui.toast(veinShortToast(), 'warn')
    playSfx('warn')
    return 0
  }
  // 首投仍未定主:与单点同规矩,这一笔注定这条当主脉
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
  if (!resources.hasStone(cost)) {
    playSfx('warn')
    ui.toast(veinSwitchShortToast(), 'warn')
    return false
  }
  resources.spendStone(cost)
  dongfu.setVeinMain(id)
  playSfx('success')
  ui.toast(veinSwitchDoneToast(veinDef(id).name), 'success')
  return true
}
