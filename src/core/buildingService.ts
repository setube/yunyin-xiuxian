/**
 * 洞府建筑服务 —— 升级
 */
import type { BuildingId, GNum } from '@/types'
import { buildingDef } from '@/data/buildings'
import { buildingCost } from './formulas'
import { track } from './progress'
import { gte, gnZero, subClamp } from '@/utils/gnum'
import { formatGN } from '@/utils/format'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useDongfuStore } from '@/stores/dongfu'
import { useUiStore } from '@/stores/ui'
import {
  buildingDoneToast,
  buildingMansionGateToast,
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
    reason = buildingRealmGate(['炼气', '筑基', '金丹'][def.unlockRealm] ?? '更高')
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
