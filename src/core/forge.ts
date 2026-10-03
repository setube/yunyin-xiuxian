/**
 * 炼器服务 —— 强化 / 分解 / 法宝升阶
 */
import type { ArtifactDef, EquipmentInstance, GNum } from '@/types'
import { qualityDef } from '@/data/qualities'
import { equipmentTemplate } from '@/data/equipment'
import { artifactDef, ARTIFACT_MAX_LEVEL, ARTIFACT_UP_STONE_TIER, ARTIFACT_UP_WUDAO_BASE } from '@/data/artifacts'
import { EQUIP_MAX_LEVEL_BASE } from '@/data/constants'
import { stoneByTier, upgradeCost } from './formulas'
import { add, gnZero, isZero } from '@/utils/gnum'
import { formatGN } from '@/utils/format'
import {
  artifactBatchDoneToast,
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
  if (!resources.hasSmall('dust', cost.dust) || !resources.hasStone(cost.stone)) {
    if (!opts.quiet) {
      playSfx('warn')
      ui.toast(upgradeShortToast(), 'warn')
    }
    return false
  }
  resources.spendSmall('dust', cost.dust)
  resources.spendStone(cost.stone)
  // 记账:这件装备花掉的强化成本(分解时按八成返还)——折扣是当时的,只有账本记得住
  const invested = inst.invested ?? { dust: 0, stone: gnZero() }
  inventory.replaceItem({
    ...inst,
    level: inst.level + 1,
    invested: { dust: invested.dust + cost.dust, stone: add(invested.stone, cost.stone) }
  })
  track('upgrades')
  const t = equipmentTemplate(inst.templateId)
  // 强化过也算「亲手用过」——图鉴那一档由玩家自己推进,不看运气
  useLoreStore().noteEquipUsed(inst.templateId)
  // 强化即炼器:上头的一味矿材作「上手过」(矿石进通晓/锻造技艺的唯一活水)
  noteSmithingUsed(inst.tier, true)
  if (!opts.quiet) {
    playSfx('success')
    ui.toast(upgradeDoneToast(t?.name ?? '此器', inst.level + 1), 'success')
  }
  return true
}

export interface UpgradeBatchPlan {
  /** 从当前级起能连升的级数(上限与余额的共同约束) */
  levels: number
  /** 连升总花费的器灵尘 */
  dust: number
  /** 连升总花费的灵石 */
  stone: GNum
  /** 是否因已至强化上限而停(而非钱不够) */
  atCap: boolean
}

/**
 * 强化连升计划:只算不动手。逐级累加 upgradeCost,到上限或余额缺口为止;
 * 界面预览与批量执行共用这一份,所见即所得。折扣随当时玩家面板走。
 */
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
 * 强化连升:按计划一次升到位 —— 逐级走 upgradeEquipment 的 quiet 版,
 * 每一级各自的记账/图鉴/炼器投入都照常,仅合为一次提示。
 * 返回实际升的级数;0 = 未升(已到顶或钱不够,toast 会说明)。
 */
export function upgradeEquipmentBatch(uid: string): number {
  const plan = upgradeBatchPlan(uid)
  if (plan.levels === 0) {
    playSfx('warn')
    useUiStore().toast(plan.atCap ? upgradeCapToast() : upgradeShortToast(), 'warn')
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
    playSfx('success') // 批量分解走 quiet,这一声由一键分解的总账那一层发
    ui.toast(
      isZero(gain.stone)
        ? decomposeToast(gain.dust)
        : decomposeToast(gain.dust, formatGN(gain.stone), salvageRefundPhrase()),
      'info'
    )
  }
  return true
}

export interface DecomposeBatch {
  count: number
  dust: number
  stone: GNum
}

/** 批量分解的账目文案:批量路径只有这一处措辞,免得各写各的 */
export function batchYieldText(b: DecomposeBatch): string {
  return salvageYieldText(b.dust, isZero(b.stone) ? undefined : formatGN(b.stone))
}

/**
 * 批量分解:逐件结算、**不逐件弹提示** —— 提示窗只留最近 5 条,
 * 逐件弹会把「一共拆了多少、拿回多少」的总账顶掉。调用方自己按总量报一次。
 */
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

/** 行囊中勾选品质的未锁定装备(预告与下手用同一套筛选,所见即所得) */
function decomposeTargets(ranks: readonly number[]): EquipmentInstance[] {
  const wanted = new Set(ranks)
  return useInventoryStore().bagItems.filter(it => !it.locked && wanted.has(qualityDef(it.quality).rank))
}

/** 分解预告:会拆几件、拿回什么 —— 弹窗上写的数就是真下手的数 */
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

/** 一键分解:行囊中勾选品质 rank 的未锁定装备,按一次总账报出来,返回分解件数 */
export function decomposeByRanks(ranks: readonly number[]): number {
  const ui = useUiStore()
  const got = decomposeBatch(decomposeTargets(ranks))
  if (got.count > 0) {
    playSfx('success') // 逐件走的是 quiet,总账这一层只发一声
    ui.toast(batchDecomposeToast(got.count, batchYieldText(got)), 'info')
  }
  return got.count
}

/** 某法定某一重数的单次炼化代价(纯函数,不含上限;level ≥ 满重才算不出 → null) */
export function artifactUpCostAt(def: ArtifactDef, level: number): { wudao: number; stone: GNum } | null {
  if (level >= ARTIFACT_MAX_LEVEL) return null
  return {
    wudao: Math.ceil(ARTIFACT_UP_WUDAO_BASE * Math.pow(1.6, level) * (1 + qualityDef(def.quality).rank * 0.3)),
    stone: stoneByTier(def.fromTier, ARTIFACT_UP_STONE_TIER * (1 + level))
  }
}

export function artifactUpCost(defId: string): { wudao: number; stone: GNum } | null {
  const inventory = useInventoryStore()
  const owned = inventory.artifacts.find(a => a.defId === defId)
  const def = artifactDef(defId)
  if (!owned || !def) return null
  return artifactUpCostAt(def, owned.level)
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
  if (!resources.hasSmall('wudao', cost.wudao) || !resources.hasStone(cost.stone)) {
    if (!opts.quiet) {
      playSfx('warn')
      ui.toast(artifactShortToast(), 'warn')
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
  /** 从当前重数起能连炼的重数(满重与余额的共同约束) */
  levels: number
  /** 连炼总耗的悟道 */
  wudao: number
  /** 连炼总耗的灵石 */
  stone: GNum
  /** 是否因已至满重而停(而非悟道/灵石不够) */
  atCap: boolean
}

/**
 * 祭炼连升计划:只算不动手。逐重累加 artifactUpCostAt,到满重或余额缺口为止;
 * 界面预览与批量执行共用这一份,所见即所得。
 */
export function artifactBatchPlan(defId: string): ArtifactBatchPlan {
  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  const owned = inventory.artifacts.find(a => a.defId === defId)
  const def = artifactDef(defId)
  if (!owned || !def) return { levels: 0, wudao: 0, stone: gnZero(), atCap: false }
  if (owned.level >= ARTIFACT_MAX_LEVEL) return { levels: 0, wudao: 0, stone: gnZero(), atCap: true }
  let lv = owned.level
  let wudao = 0
  let stone = gnZero()
  // 循环上界已小于满重,artifactUpCostAt 必非 null —— 只需要判余额
  while (lv < ARTIFACT_MAX_LEVEL) {
    const c = artifactUpCostAt(def, lv)!
    if (!resources.hasSmall('wudao', wudao + c.wudao) || !resources.hasStone(add(stone, c.stone))) break
    wudao += c.wudao
    stone = add(stone, c.stone)
    lv += 1
  }
  return { levels: lv - owned.level, wudao, stone, atCap: lv >= ARTIFACT_MAX_LEVEL }
}

/**
 * 祭炼连升:按计划一次炼到位 —— 逐重走 upgradeArtifact 的 quiet 版,
 * 每重各自的扣费/等级照常,仅合为一次提示与一声响。返回实际炼的重数;
 * 0 = 未炼(已至满重或余额不够,toast 会说明)。
 */
export function upgradeArtifactBatch(defId: string): number {
  const plan = artifactBatchPlan(defId)
  if (plan.levels === 0) {
    playSfx('warn')
    useUiStore().toast(plan.atCap ? artifactCapToast() : artifactShortToast(), 'warn')
    return 0
  }
  // 当前流程里回合内不可能失败(计划刚验过账、同步无 await);防御性的断了就往回退一重照实报
  let done = 0
  for (let i = 0; i < plan.levels; i += 1) {
    if (!upgradeArtifact(defId, { quiet: true })) break
    done += 1
  }
  const owned = useInventoryStore().artifacts.find(a => a.defId === defId)
  playSfx('success')
  useUiStore().toast(artifactBatchDoneToast(done, owned?.level ?? 0, plan.wudao, formatGN(plan.stone)), 'success')
  return done
}
