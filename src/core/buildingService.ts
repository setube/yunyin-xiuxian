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

export interface BuildingUpgradePreview {
  /** 预览指向的目标级(单步即下一级;连升即 level+steps) */
  nextLevel: number
  /**
   * 升级到 nextLevel 会变的那些效果行 —— 与卡面同读 effectText,只报会变的那部分,
   * 不抄第二份文案:字面不变的行走(如「炉子只管出丹多寡」)、尚未触发的档
   * (如每 3 级才涨的强化上限)都不该当成「增益」搬上来。
   */
  lines: string[]
  /** 首建(0→1):还没有当前效果,预览=整张下一级效果 */
  built: boolean
}

/**
 * 升级/建造的「升上去会怎样」预览。卡面已显当前效果与代价,这里只补赢得什么:
 * 取 effectText(toLevel) 与 effectText(level) 逐行比对,留下字面变掉的行 ——
 * 与 effectText 同一事实源,门槛、档位一致,不会出现「卡面印的出不去」。
 *
 * steps 缺省 1(单步);连升整段传实际步数 —— 连升买的是整段,玩家不该拿
 * 看不到的逐级增量自己加总(与 batch 的花费总账同摆:钱多少、得多少,一眼对上)。
 */
export function buildingUpgradePreview(
  id: BuildingId,
  level: number,
  /** 有效上限(洞府档闸门 < 品类上限时已到顶的卡不该再印「下一级」);缺省回退 def.maxLevel */
  cap?: number,
  /** 连升步数:从 level 直接 diff 到 level+steps(1 即单步) */
  steps = 1
): BuildingUpgradePreview {
  const def = buildingDef(id)!
  const toLevel = level + Math.max(1, steps)
  if (toLevel > (cap ?? def.maxLevel)) return { nextLevel: toLevel, lines: [], built: level === 0 }
  // 本仓 effectText 是整段散文,不是逐行数组:按句读切成行再 diff,
  // 与卡面展示口径一致,也避免把「离线收益上限 48 小时;洞府每升一级…」
  // 这样的两句当成一行而整句重复。
  const cur = level > 0 ? splitEffectLines(def.effectText(level)) : []
  const nxt = splitEffectLines(def.effectText(toLevel))
  const lines = nxt.filter((line, i) => line !== cur[i])
  return { nextLevel: toLevel, lines, built: level === 0 }
}

/** 建筑效果散文按分号拆行 —— 只拆给预览比对,不改数据层文案 */
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
