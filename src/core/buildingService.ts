/**
 * 洞府建筑服务 —— 升级
 */
import type { BuildingId, GNum } from '@/types'
import { buildingDef } from '@/data/buildings'
import { buildingCost } from './formulas'
import { track } from './progress'
import { add, gte, gnZero, subClamp } from '@/utils/gnum'
import { formatGN } from '@/utils/format'
import { playSfx } from './audio'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useDongfuStore } from '@/stores/dongfu'
import { useUiStore } from '@/stores/ui'
import {
  buildingBatchDoneToast,
  buildingDoneToast,
  buildingMansionGateToast,
  buildingGateRealmName,
  buildingPeakToast,
  buildingRealmGate,
  buildingShortToast
} from '@/ui/buildingText'

export interface BuildingUpgradeInfo {
  canUpgrade: boolean
  reason: string
  stone: GNum
  ore: number
  nextLevel: number
}

export function buildingUpgradeInfo(id: BuildingId): BuildingUpgradeInfo {
  const dongfu = useDongfuStore()
  const player = usePlayerStore()
  const def = buildingDef(id)!
  const lv = dongfu.levels[id] ?? 0
  const stone = buildingCost(def.costBase, lv)
  const ore = def.costOre * (lv + 1)
  let canUpgrade = true
  let reason = ''
  if (player.major < def.unlockRealm) {
    canUpgrade = false
    reason = buildingRealmGate(buildingGateRealmName(def.unlockRealm))
  } else if (lv >= def.maxLevel) {
    canUpgrade = false
    reason = buildingPeakToast()
  } else if (id !== 'mansion' && lv >= dongfu.buildingLevelCap) {
    canUpgrade = false
    reason = buildingMansionGateToast()
  } else {
    // 资源检查(xian 仓纪律:付不起要先置灰、把差多少列出来,别让玩家点了才被弹教训)。
    // 石头是 GNum 大数、玄铁是 number,分别算差;双缺合并成一句,每个「数+量词」粘着写。
    const resources = useResourcesStore()
    const stoneShort = gte(resources.spiritStone, stone) ? gnZero() : subClamp(stone, resources.spiritStone)
    const oreShort = Math.max(0, ore - resources.ore)
    if (stoneShort.m > 0 || oreShort > 0) {
      canUpgrade = false
      const parts: string[] = []
      if (stoneShort.m > 0) parts.push(`尚差 ${formatGN(stoneShort)} 石`)
      if (oreShort > 0) parts.push(`玄铁 ${oreShort} 块`)
      reason = parts.join(' · ')
    }
  }
  return { canUpgrade, reason, stone, ore, nextLevel: lv + 1 }
}

export function upgradeBuilding(id: BuildingId): boolean {
  const dongfu = useDongfuStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  const def = buildingDef(id)!
  const info = buildingUpgradeInfo(id)
  if (!info.canUpgrade) {
    ui.toast(info.reason, 'warn')
    return false
  }
  if (!resources.hasStone(info.stone) || !resources.hasSmall('ore', info.ore)) {
    ui.toast(buildingShortToast(), 'warn')
    return false
  }
  resources.spendStone(info.stone)
  resources.spendSmall('ore', info.ore)
  dongfu.setLevel(id, info.nextLevel)
  track('buildingUpgrades')
  ui.toast(buildingDoneToast(def.name, info.nextLevel), 'success')
  return true
}

export interface BuildingBatchPlan {
  /** 从当前级起能连升的级数(品类满级 / 洞府辖限 / 余额三者的最短) */
  levels: number
  /** 连升总耗的灵石 */
  stone: GNum
  /** 连升总耗的玄铁 */
  ore: number
  /** 停下时是不是撞了品类满级(而非辖限/资源) */
  atMax: boolean
  /** 0 级时的拒因(境界闸 / 圆满 / 辖限 / 资源不足) */
  blocked: string | null
}

/**
 * 建筑连升计划:只算不动手。逐级累加 buildingCost(每级随级数涨)与玄铁,
 * 到品类满级、洞府辖限或余额缺口即止 —— 判据与 buildingUpgradeInfo 同源
 * (改一处的门槛/上限,另一处别忘跟)。返回至少 1 级才可连;0 级带拒因。
 */
export function buildingBatchPlan(id: BuildingId): BuildingBatchPlan {
  const dongfu = useDongfuStore()
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const def = buildingDef(id)!
  const from = dongfu.levels[id] ?? 0
  const zero = (blocked: string | null, atMax = false): BuildingBatchPlan => ({
    levels: 0,
    stone: gnZero(),
    ore: 0,
    atMax,
    blocked
  })
  if (player.major < def.unlockRealm) return zero(buildingRealmGate(buildingGateRealmName(def.unlockRealm)))
  if (from >= def.maxLevel) return zero(buildingPeakToast(), true)
  if (id !== 'mansion' && from >= dongfu.buildingLevelCap) return zero(buildingMansionGateToast())

  let lv = from
  let stone = gnZero()
  let ore = 0
  // 洞府(自身抬辖限的那一栋)不受辖限约束,只被品类满级顶住
  while (lv < def.maxLevel && (id === 'mansion' || lv < dongfu.buildingLevelCap)) {
    const c = buildingCost(def.costBase, lv)
    const o = def.costOre * (lv + 1)
    if (!resources.hasStone(add(stone, c)) || !resources.hasSmall('ore', ore + o)) break
    stone = add(stone, c)
    ore += o
    lv += 1
  }
  const levels = lv - from
  if (levels === 0) return zero(buildingShortToast())
  return { levels, stone, ore, atMax: lv >= def.maxLevel, blocked: null }
}

/**
 * 建筑连升:按计划一次升到位 —— 一笔扣、一笔加,总账与界面预览分毫不差
 * (逐级累扣会有 GNum 尾差,账目对不齐)。返回实际升的级数;0 = 未升(toast 会说明)。
 */
export function upgradeBuildingBatch(id: BuildingId): number {
  const dongfu = useDongfuStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  const def = buildingDef(id)!
  const plan = buildingBatchPlan(id)
  if (plan.levels === 0) {
    playSfx('warn')
    ui.toast(plan.blocked ?? buildingShortToast(), 'warn')
    return 0
  }
  const from = dongfu.levels[id] ?? 0
  resources.spendStone(plan.stone)
  resources.spendSmall('ore', plan.ore)
  dongfu.setLevel(id, from + plan.levels)
  // 一次连升 = 升了 plan.levels 级,统计照实记(与逐级升级同源),否则「累计升级建筑 N 次」永远毕业不了
  track('buildingUpgrades', plan.levels)
  playSfx('success')
  ui.toast(buildingBatchDoneToast(def.name, plan.levels, from + plan.levels, formatGN(plan.stone), plan.ore), 'success')
  return plan.levels
}
