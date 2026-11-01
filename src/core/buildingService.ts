/** 洞府建筑服务:升级 */
import type { BuildingId, GNum } from '@/types'
import { buildingDef } from '@/data/buildings'
import { buildingCost } from './formulas'
import { track } from './progress'
import { add, gte, gnZero, subClamp } from '@/utils/gnum'
import { formatGN, formatGap } from '@/utils/format'
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
  buildingShortReason,
  buildingShortToast
} from '@/ui/buildingText'
import type { BuildingShortSide } from '@/ui/buildingText'

export interface BuildingUpgradePreview {
  /** 预览指向的目标级(单步即下一级;连升即 level+steps) */
  nextLevel: number
  /** 升到 nextLevel 会变的效果行 */
  lines: string[]
  /** 首建(0→1):还没有当前效果,预览=整张下一级效果 */
  built: boolean
}

/** 升级/建造预览:effectText(toLevel) 与 effectText(level) 逐行比对,留下字面变掉的行;与卡面同读 effectText */
export function buildingUpgradePreview(
  id: BuildingId,
  level: number,
  /** 有效上限(洞府档闸门 < 品类上限时,到顶的卡不再印「下一级」);缺省 def.maxLevel */
  cap?: number,
  /** 连升步数:从 level 直接 diff 到 level+steps(1 即单步) */
  steps = 1
): BuildingUpgradePreview {
  const def = buildingDef(id)!
  const toLevel = level + Math.max(1, steps)
  if (toLevel > (cap ?? def.maxLevel)) return { nextLevel: toLevel, lines: [], built: level === 0 }
  // effectText 是整段散文,切行再 diff
  const cur = level > 0 ? splitEffectLines(def.effectText(level)) : []
  const nxt = splitEffectLines(def.effectText(toLevel))
  const lines = nxt.filter((line, i) => line !== cur[i])
  return { nextLevel: toLevel, lines, built: level === 0 }
}

/** 按分号拆行,只供预览比对 */
function splitEffectLines(text: string): string[] {
  return text
    .split(/[;；]/)
    .map(line => line.trim())
    .filter(Boolean)
}

export interface BuildingUpgradeInfo {
  canUpgrade: boolean
  reason: string
  stone: GNum
  ore: number
  nextLevel: number
}

export interface BuildingShortfall {
  /** 缺哪一样;两样都够时为 null */
  side: BuildingShortSide | null
  /** 灵石尚差(足够时为 0) */
  stone: GNum
  /** 玄铁尚差(足够时为 0) */
  ore: number
  /** 卡面直接展示的精确缺口;两样都够时为空串 */
  reason: string
}

/** 建筑升级的资源缺口:卡片、单升二次校验与连升 0 级拒因共用;只缺一样只报那一样 */
export function buildingShortfall(stone: GNum, ore: number): BuildingShortfall {
  const resources = useResourcesStore()
  const stoneShort = gte(resources.spiritStone, stone) ? gnZero() : subClamp(stone, resources.spiritStone)
  const oreShort = Math.max(0, ore - resources.ore)
  const stoneMissing = stoneShort.m > 0
  const oreMissing = oreShort > 0
  const side: BuildingShortSide | null =
    stoneMissing && oreMissing ? 'both' : stoneMissing ? 'stone' : oreMissing ? 'ore' : null
  return {
    side,
    stone: stoneShort,
    ore: oreShort,
    reason: side ? buildingShortReason(side, formatGap(stoneShort), oreShort) : ''
  }
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
    // 资源不足即置灰并列差
    const shortfall = buildingShortfall(stone, ore)
    if (shortfall.side) {
      canUpgrade = false
      reason = shortfall.reason
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
    const shortfall = buildingShortfall(info.stone, info.ore)
    const text = shortfall.side
      ? buildingShortToast(shortfall.side, formatGap(shortfall.stone), shortfall.ore)
      : buildingShortToast()
    ui.toast(text, 'warn')
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
 * 建筑连升计划:只算不动手,逐级累加至品类满级、洞府辖限或余额缺口即止;0 级带拒因。
 * 门槛/上限须与 buildingUpgradeInfo 同步。
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
  // 洞府自身不受辖限约束
  while (lv < def.maxLevel && (id === 'mansion' || lv < dongfu.buildingLevelCap)) {
    const c = buildingCost(def.costBase, lv)
    const o = def.costOre * (lv + 1)
    if (!resources.hasStone(add(stone, c)) || !resources.hasSmall('ore', ore + o)) break
    stone = add(stone, c)
    ore += o
    lv += 1
  }
  const levels = lv - from
  if (levels === 0) {
    const shortfall = buildingShortfall(buildingCost(def.costBase, from), def.costOre * (from + 1))
    return zero(
      shortfall.side
        ? buildingShortToast(shortfall.side, formatGap(shortfall.stone), shortfall.ore)
        : buildingShortToast()
    )
  }
  return { levels, stone, ore, atMax: lv >= def.maxLevel, blocked: null }
}

/** 建筑连升:按计划一笔扣、一笔加(逐级累扣有 GNum 尾差);返回实际升的级数,0 = 未升 */
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
  // 按实际级数计,与逐级升级同源
  track('buildingUpgrades', plan.levels)
  playSfx('success')
  ui.toast(buildingBatchDoneToast(def.name, plan.levels, from + plan.levels, formatGN(plan.stone), plan.ore), 'success')
  return plan.levels
}
