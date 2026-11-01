/** 炼器服务:强化 / 分解 / 法宝升阶 */
import type { ArtifactDef, EquipmentInstance, GNum } from '@/types'
import { qualityDef } from '@/data/qualities'
import { equipmentTemplate } from '@/data/equipment'
import { artifactDef, ARTIFACT_MAX_LEVEL, ARTIFACT_UP_STONE_TIER, ARTIFACT_UP_WUDAO_BASE } from '@/data/artifacts'
import { EQUIP_MAX_LEVEL_BASE } from '@/data/constants'
import { stoneByTier, upgradeCost } from './formulas'
import { add, gnZero, isZero, subClamp } from '@/utils/gnum'
import { formatGN, formatGap } from '@/utils/format'
import {
  artifactBatchDoneToast,
  artifactBatchInterruptedToast,
  artifactCapToast,
  artifactDoneToast,
  artifactShortToast,
  batchDecomposeToast,
  decomposeToast,
  salvageYieldText,
  upgradeCapToast,
  upgradeDoneToast,
  upgradeShortToast,
  upgradeBatchDoneToast
} from '@/ui/forgeText'
import { salvageOf, salvageRefundPhrase } from './salvage'
import { playSfx } from './audio'
import { modOf } from './statsCalc'
import { track } from './progress'
import { noteSmithingUsed } from './loreService'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useLoreStore } from '@/stores/lore'
import { useDongfuStore } from '@/stores/dongfu'
import { useUiStore } from '@/stores/ui'

export function equipLevelCap(): number {
  return EQUIP_MAX_LEVEL_BASE + useDongfuStore().forgeCapBonus
}

export function equipUpgradeCost(uid: string): { dust: number; stone: GNum } | null {
  const inventory = useInventoryStore()
  const player = usePlayerStore()
  const inst = inventory.findItem(uid)
  if (!inst || inst.level >= equipLevelCap()) return null
  const q = qualityDef(inst.quality)
  return upgradeCost(inst.level, inst.tier, q.rank, modOf(player.finalStats.mods, 'forgeDiscount'))
}

/** 这次强化缺哪一样,付得起为 null;提示与结算共用 */
export function upgradeShort(cost: { dust: number; stone: GNum }): 'stone' | 'dust' | null {
  const resources = useResourcesStore()
  if (!resources.hasSmall('dust', cost.dust)) return 'dust'
  if (!resources.hasStone(cost.stone)) return 'stone'
  return null
}

/** 强化这一级两样各差多少;界面价签、置灰与提示共用 */
export function upgradeShortfall(cost: { dust: number; stone: GNum }): { dust: number; stone: GNum } {
  const resources = useResourcesStore()
  return {
    dust: Math.max(0, cost.dust - resources.dust),
    stone: subClamp(cost.stone, resources.spiritStone)
  }
}

export function upgradeEquipment(uid: string, opts: { quiet?: boolean } = {}): boolean {
  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  const inst = inventory.findItem(uid)
  const cost = equipUpgradeCost(uid)
  if (!inst || !cost) {
    if (!opts.quiet) {
      playSfx('warn')
      ui.toast(upgradeCapToast(), 'warn')
    }
    return false
  }
  const short = upgradeShort(cost)
  if (short) {
    if (!opts.quiet) {
      playSfx('warn')
      const gap = upgradeShortfall(cost)
      ui.toast(upgradeShortToast(short, { stone: formatGap(gap.stone), dust: gap.dust }), 'warn')
    }
    return false
  }
  resources.spendSmall('dust', cost.dust)
  resources.spendStone(cost.stone)
  // 记账实付强化成本(折扣按当时),分解返还按此账
  const invested = inst.invested ?? { dust: 0, stone: gnZero() }
  inventory.replaceItem({
    ...inst,
    level: inst.level + 1,
    invested: { dust: invested.dust + cost.dust, stone: add(invested.stone, cost.stone) }
  })
  track('upgrades')
  const t = equipmentTemplate(inst.templateId)
  // 强化也算图鉴「亲手用过」
  useLoreStore().noteEquipUsed(inst.templateId)
  // 矿材记「上手过」;矿石进通晓/锻造技艺的唯一来源
  noteSmithingUsed(inst.tier, true)
  if (!opts.quiet) {
    playSfx('success')
    ui.toast(upgradeDoneToast(t?.name ?? '此器', inst.level + 1), 'success')
  }
  return true
}

export interface UpgradeBatchPlan {
  /** 能连升的级数(受上限与余额约束) */
  levels: number
  /** 总耗器灵尘 */
  dust: number
  /** 总耗灵石 */
  stone: GNum
  /** 因到上限而停(非缺料) */
  atCap: boolean
}

/** 强化连升计划(只算不扣):逐级累加到上限或余额不足;界面预览与批量执行共用 */
export function upgradeBatchPlan(uid: string): UpgradeBatchPlan {
  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  const player = usePlayerStore()
  const inst = inventory.findItem(uid)
  if (!inst) return { levels: 0, dust: 0, stone: gnZero(), atCap: false }
  const cap = equipLevelCap()
  if (inst.level >= cap) return { levels: 0, dust: 0, stone: gnZero(), atCap: true }
  const q = qualityDef(inst.quality)
  const discount = modOf(player.finalStats.mods, 'forgeDiscount')
  let lv = inst.level
  let dust = 0
  let stone = gnZero()
  while (lv < cap) {
    const c = upgradeCost(lv, inst.tier, q.rank, discount)
    if (!resources.hasSmall('dust', dust + c.dust) || !resources.hasStone(add(stone, c.stone))) break
    dust += c.dust
    stone = add(stone, c.stone)
    lv += 1
  }
  return { levels: lv - inst.level, dust, stone, atCap: lv >= cap }
}

/**
 * 强化连升:逐级走 upgradeEquipment quiet 版(记账/图鉴/炼器照常),只报一次提示。
 * 返回实际升的级数;0 = 未升。
 */
export function upgradeEquipmentBatch(uid: string): number {
  const plan = upgradeBatchPlan(uid)
  if (plan.levels === 0) {
    playSfx('warn')
    // 缺料判定看下一级报价:连一级都不够时计划金额为 0
    const next = equipUpgradeCost(uid)
    const short = next ? upgradeShort(next) : null
    const gap = next ? upgradeShortfall(next) : { dust: 0, stone: gnZero() }
    useUiStore().toast(
      plan.atCap ? upgradeCapToast() : upgradeShortToast(short ?? 'stone', { stone: formatGap(gap.stone), dust: gap.dust }),
      'warn'
    )
    return 0
  }
  for (let i = 0; i < plan.levels; i += 1) upgradeEquipment(uid, { quiet: true })
  const inst = useInventoryStore().findItem(uid)
  playSfx('success')
  useUiStore().toast(upgradeBatchDoneToast(plan.levels, inst?.level ?? 0, plan.dust, formatGN(plan.stone)), 'success')
  return plan.levels
}

export function decomposeEquipment(uid: string, opts: { quiet?: boolean } = {}): boolean {
  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  const inst = inventory.findItem(uid)
  if (!inst || inst.locked) return false
  const gain = salvageOf(inst)
  inventory.removeEquipment(uid)
  resources.addSmall('dust', gain.dust)
  resources.addStone(gain.stone)
  track('decomposed')
  if (!opts.quiet) {
    playSfx('success')
    ui.toast(
      isZero(gain.stone)
        ? decomposeToast(gain.dust)
        : decomposeToast(gain.dust, formatGN(gain.stone), salvageRefundPhrase()),
      'success'
    )
  }
  return true
}

export interface DecomposeBatch {
  count: number
  dust: number
  stone: GNum
}

/** 批量分解账目文案;批量路径唯一措辞 */
export function batchYieldText(b: DecomposeBatch): string {
  return salvageYieldText(b.dust, isZero(b.stone) ? undefined : formatGN(b.stone))
}

/** 批量分解:逐件结算不弹提示(提示窗只留 5 条,会顶掉总账);调用方按总量报一次 */
export function decomposeBatch(items: readonly EquipmentInstance[]): DecomposeBatch {
  const total: DecomposeBatch = { count: 0, dust: 0, stone: gnZero() }
  for (const it of items) {
    if (!decomposeEquipment(it.uid, { quiet: true })) continue
    const gain = salvageOf(it)
    total.count += 1
    total.dust += gain.dust
    total.stone = add(total.stone, gain.stone)
  }
  return total
}

/** 行囊中勾选品质的未锁定装备;预告与下手共用 */
function decomposeTargets(ranks: readonly number[]): EquipmentInstance[] {
  const wanted = new Set(ranks)
  return useInventoryStore().bagItems.filter(it => !it.locked && wanted.has(qualityDef(it.quality).rank))
}

/** 分解预告:会拆几件、拿回什么 */
export function decomposePreview(ranks: readonly number[]): DecomposeBatch {
  const total: DecomposeBatch = { count: 0, dust: 0, stone: gnZero() }
  for (const it of decomposeTargets(ranks)) {
    const gain = salvageOf(it)
    total.count += 1
    total.dust += gain.dust
    total.stone = add(total.stone, gain.stone)
  }
  return total
}

/** 一键分解:按一次总账报出,返回件数 */
export function decomposeByRanks(ranks: readonly number[]): number {
  const ui = useUiStore()
  const got = decomposeBatch(decomposeTargets(ranks))
  if (got.count > 0) {
    playSfx('success') // 逐件走 quiet,总账只发一声
    ui.toast(batchDecomposeToast(got.count, batchYieldText(got)), 'success')
  }
  return got.count
}

/**
 * 法宝某一重的单次炼化代价;level ≥ 满重 → null。
 * level 须收成有限整数:内存直塞、$patch 后立刻渲染不经 inventory.sanitize,
 * NaN 会让炼化不扣悟道点、重数涨到顶。
 */
export function artifactUpCostAt(def: ArtifactDef, level: number): { wudao: number; stone: GNum } | null {
  const lv = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0
  if (lv >= ARTIFACT_MAX_LEVEL) return null
  return {
    wudao: Math.ceil(ARTIFACT_UP_WUDAO_BASE * Math.pow(1.6, lv) * (1 + qualityDef(def.quality).rank * 0.3)),
    stone: stoneByTier(def.fromTier, ARTIFACT_UP_STONE_TIER * (1 + lv))
  }
}

export function artifactUpCost(defId: string): { wudao: number; stone: GNum } | null {
  const inventory = useInventoryStore()
  const owned = inventory.artifacts.find(a => a.defId === defId)
  const def = artifactDef(defId)
  if (!owned || !def) return null
  return artifactUpCostAt(def, owned.level)
}

export interface ArtifactShortfall {
  /** 提示报的那一样;都缺时报悟道点 */
  short: 'wudao' | 'stone' | null
  /** 悟道点缺口,够则 0 */
  wudao: number
  /** 灵石缺口,够则 0 */
  stone: GNum
}

/** 这一重两样各差多少;界面置灰、价签与提示共用 */
export function artifactShortfall(cost: { wudao: number; stone: GNum }): ArtifactShortfall {
  const resources = useResourcesStore()
  const wudao = resources.hasSmall('wudao', cost.wudao) ? 0 : Math.max(0, cost.wudao - resources.wudao)
  const stone = resources.hasStone(cost.stone) ? gnZero() : subClamp(cost.stone, resources.spiritStone)
  return {
    short: wudao > 0 ? 'wudao' : stone.m > 0 ? 'stone' : null,
    wudao,
    stone
  }
}

/** 这一重缺哪一样,付得起为 null;服务与界面共用 */
export function artifactShort(cost: { wudao: number; stone: GNum }): 'wudao' | 'stone' | null {
  return artifactShortfall(cost).short
}

export function upgradeArtifact(defId: string, opts: { quiet?: boolean } = {}): boolean {
  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  const cost = artifactUpCost(defId)
  const def = artifactDef(defId)
  if (!cost || !def) {
    if (!opts.quiet) {
      playSfx('warn')
      ui.toast(artifactCapToast(), 'warn')
    }
    return false
  }
  const short = artifactShort(cost)
  if (short) {
    if (!opts.quiet) {
      playSfx('warn')
      const gap = artifactShortfall(cost)
      ui.toast(artifactShortToast(short, { wudao: gap.wudao, stone: formatGap(gap.stone) }), 'warn')
    }
    return false
  }
  resources.spendSmall('wudao', cost.wudao)
  resources.spendStone(cost.stone)
  inventory.levelUpArtifact(defId)
  if (!opts.quiet) {
    playSfx('success')
    ui.toast(artifactDoneToast(def.name), 'success')
  }
  return true
}

export interface ArtifactBatchPlan {
  /** 能连炼的重数(受满重与余额约束) */
  levels: number
  /** 总耗悟道 */
  wudao: number
  /** 总耗灵石 */
  stone: GNum
  /** 因满重而停(非缺料) */
  atCap: boolean
}

/** 祭炼连升计划(只算不扣):逐重累加到满重或余额不足;界面预览与批量执行共用 */
export function artifactBatchPlan(defId: string): ArtifactBatchPlan {
  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  const owned = inventory.artifacts.find(a => a.defId === defId)
  const def = artifactDef(defId)
  if (!owned || !def) return { levels: 0, wudao: 0, stone: gnZero(), atCap: false }
  // 起手重数收成有限整数:NaN/小数会画出「第 NaN 重」「第 2.7 重」(直塞与 $patch 不经 sanitize)
  const from = Number.isFinite(owned.level) ? Math.max(0, Math.floor(owned.level)) : 0
  if (from >= ARTIFACT_MAX_LEVEL) return { levels: 0, wudao: 0, stone: gnZero(), atCap: true }
  let lv = from
  let wudao = 0
  let stone = gnZero()
  // lv < 满重,artifactUpCostAt 必非 null
  while (lv < ARTIFACT_MAX_LEVEL) {
    const c = artifactUpCostAt(def, lv)!
    if (!resources.hasSmall('wudao', wudao + c.wudao) || !resources.hasStone(add(stone, c.stone))) break
    wudao += c.wudao
    stone = add(stone, c.stone)
    lv += 1
  }
  return { levels: lv - from, wudao, stone, atCap: lv >= ARTIFACT_MAX_LEVEL }
}

/**
 * 祭炼连升:逐重走 upgradeArtifact quiet 版,只报一次提示与一声响。
 * 返回实际炼的重数;0 = 未炼。
 */
export function upgradeArtifactBatch(defId: string): number {
  const plan = artifactBatchPlan(defId)
  if (plan.levels === 0) {
    playSfx('warn')
    const next = artifactUpCost(defId)
    const short = next ? artifactShort(next) : null
    // 计划 0 而仍有下一重即卡在余额,short 必非 null;兜底退回通用句,报「悟道点」会指错
    const gap = next ? artifactShortfall(next) : null
    const text = plan.atCap
      ? artifactCapToast()
      : short && gap
        ? artifactShortToast(short, { wudao: gap.wudao, stone: formatGap(gap.stone) })
        : '祭炼未成'
    useUiStore().toast(text, 'warn')
    return 0
  }
  // 同步执行且刚验过账,不应中断;中断则照实报
  let done = 0
  let spentWudao = 0
  let spentStone = gnZero()
  const startLevel = useInventoryStore().artifacts.find(a => a.defId === defId)?.level ?? 0
  const def = artifactDef(defId)
  for (let i = 0; i < plan.levels; i += 1) {
    const stepCost = def ? artifactUpCostAt(def, startLevel + i) : null
    if (!upgradeArtifact(defId, { quiet: true })) break
    done += 1
    if (stepCost) {
      spentWudao += stepCost.wudao
      spentStone = add(spentStone, stepCost.stone)
    }
  }
  const owned = useInventoryStore().artifacts.find(a => a.defId === defId)
  const complete = done === plan.levels
  playSfx(complete ? 'success' : 'warn')
  useUiStore().toast(
    complete
      ? artifactBatchDoneToast(done, owned?.level ?? 0, spentWudao, formatGN(spentStone))
      : artifactBatchInterruptedToast(done, owned?.level ?? 0, spentWudao, formatGN(spentStone)),
    complete ? 'success' : 'warn'
  )
  return done
}
