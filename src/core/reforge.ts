/**
 * 装备重铸与词条封存
 *
 * 灵石的长期 sink,直接连接 Build:
 * - **重铸**:把**未封存**的词条推倒重来 —— 条数按品质区间重掷(至少给一条新的),
 *   数值全部重掷;品质、阶数、强化等级都不动。**不限次数**。
 * - **封存**:付费永久锁定一个词条,重铸不会碰它;每一件至少留一个可重掷位。
 *
 * 成本只与**装备阶数**和**封存数**挂钩(见 data/constants 的注释):
 * 想保住好词条就得付溢价 —— 「洗得越多越贵」由「你保护了多少」表达,
 * 而不是由一个与装备无关的次数计数器表达。
 *
 * 原则:不为消耗而消耗——每一笔花销都在改变构筑,而非购买数值。
 */
import type { EquipmentInstance, GNum } from '@/types'
import { rng } from '@/utils/random'
import { AFFIXES, affixDef } from '@/data/affixes'
import { equipmentTemplate } from '@/data/equipment'
import { qualityDef } from '@/data/qualities'
import {
  REFORGE_DUST_BASE,
  REFORGE_SEAL_LOAD,
  REFORGE_STONE_BASE,
  SEAL_STONE_BASE
} from '@/data/constants'
import { stoneByTier } from './formulas'
import { track } from './progress'
import { noteSmithingUsed } from './loreService'
import { useInventoryStore } from '@/stores/inventory'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'
import {
  reforgeDoneToast,
  reforgeEmptyToast,
  reforgeSealedNote,
  reforgeShortToast,
  sealDoneToast,
  sealMustLeaveToast,
  sealShortToast
} from '@/ui/reforgeText'

export interface ReforgeCost {
  stone: GNum
  dust: number
}

/**
 * 重铸成本:灵石 = stoneByTier(阶数) × (1 + 封存数 × REFORGE_SEAL_LOAD);
 * 器灵尘 = REFORGE_DUST_BASE × (1 + 封存数)。
 *
 * 没有次数项,也没有上限:同一件、同一封存数,第一次与第两百次一个价。
 * 无可重铸余地(全封存)时返回 null —— 这是唯一的"不能再炼"。
 */
export function reforgeCost(inst: EquipmentInstance): ReforgeCost | null {
  if (reforgeableAffixIds(inst).length === 0) return null
  const sealed = (inst.sealedAffixIds ?? []).length
  const load = 1 + sealed * REFORGE_SEAL_LOAD
  return {
    stone: stoneByTier(inst.tier, REFORGE_STONE_BASE * load),
    dust: Math.round(REFORGE_DUST_BASE * load)
  }
}

/** 可被重铸(未封存)的词条 id 列表 */
export function reforgeableAffixIds(inst: EquipmentInstance): string[] {
  const sealed = new Set(inst.sealedAffixIds ?? [])
  return inst.affixes.map(a => a.id).filter(id => !sealed.has(id))
}

/**
 * 一件装备还能封存几个词条 —— 至少要留一个可重掷位。
 * 判据与界面共用这一处,免得两边各算一遍(封存上限变了,有一边忘了跟)。
 */
export function sealCapacity(inst: EquipmentInstance): number {
  return Math.max(0, inst.affixes.length - 1)
}

/**
 * 重铸:把未封存的词条全部推倒重来。
 *
 * 「重铸」此前是**换掉一条**词条,条数不动 —— 而一件 3 条的凡品与一件 6 条的神品,
 * 差的从来不只是数值,是**能凑出几种搭配**。所以重铸要连条数一起重掷:
 *   新条数 = 品质区间内随机,但不少于「封存数 + 1」(每次重铸都至少给你一条新的);
 *   封存的原样留着,其余全部换成新词条、新掷点。
 * 品质、阶数、强化等级一概不动 —— 重铸的是一件的「词条构成」,不是它的出身。
 */
export function reforgeEquipment(uid: string): boolean {
  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  const inst = inventory.findItem(uid)
  if (!inst) return false
  const cost = reforgeCost(inst)
  if (!cost) {
    ui.toast(reforgeEmptyToast(), 'warn')
    return false
  }
  if (!resources.hasStone(cost.stone) || !resources.hasSmall('dust', cost.dust)) {
    ui.toast(reforgeShortToast(), 'warn')
    return false
  }

  const template = equipmentTemplate(inst.templateId)
  const quality = qualityDef(inst.quality)
  const sealed = new Set(inst.sealedAffixIds ?? [])
  const kept = inst.affixes.filter(a => sealed.has(a.id))
  const [minCount, maxCount] = quality.affixes

  resources.spendStone(cost.stone)
  resources.spendSmall('dust', cost.dust)

  // 条数:品质区间内重掷,但不低于「封存数 + 1」(总得留一条新的给它重掷)
  const wantCount = Math.max(kept.length + 1, Math.min(maxCount, rng.int(minCount, maxCount)))
  const used = new Set([...kept.map(a => a.id)])
  const fresh: { id: string; roll: number }[] = []
  let guard = 0
  while (fresh.length < wantCount - kept.length && guard < 50) {
    guard += 1
    const pool = AFFIXES.filter(
      a =>
        !used.has(a.id) &&
        (a.minRank === undefined || quality.rank >= a.minRank) &&
        (a.slots === undefined || template === undefined || a.slots.includes(template.slot))
    )
    if (pool.length === 0) break
    const picked = rng.weighted(pool, a => a.weight)
    used.add(picked.id)
    fresh.push({ id: picked.id, roll: rng.next() })
  }
  const affixes = [...kept, ...fresh]
  const before = inst.affixes.length
  inventory.replaceItem({ ...inst, affixes, reforgeCount: (inst.reforgeCount ?? 0) + 1 })
  track('upgrades')
  // 重铸也是炼器:上头一味矿材作「上手过」(矿石通晓/锻造技艺的唯一活水)
  noteSmithingUsed(inst.tier, true)

  const sealedNote = reforgeSealedNote(kept.length)
  const countNote = before === affixes.length ? `${affixes.length} 条` : `${before} → ${affixes.length} 条`
  ui.toast(reforgeDoneToast(countNote, sealedNote), 'success')
  return true
}

/** 封存成本:第 n 次封存 = 基础 × n(灵石按装备层级换算) */
export function sealCost(inst: EquipmentInstance): GNum | null {
  const sealed = inst.sealedAffixIds ?? []
  // 至少留一个可随机位,封满则不可再封
  if (sealed.length >= sealCapacity(inst)) return null
  return stoneByTier(inst.tier, SEAL_STONE_BASE * (sealed.length + 1))
}

/** 封存一个词条:重铸永不替换之 */
export function sealAffix(uid: string, affixId: string): boolean {
  const inventory = useInventoryStore()
  const resources = useResourcesStore()
  const ui = useUiStore()
  const inst = inventory.findItem(uid)
  if (!inst) return false
  if (!inst.affixes.some(a => a.id === affixId)) return false
  if ((inst.sealedAffixIds ?? []).includes(affixId)) return false
  const cost = sealCost(inst)
  if (!cost) {
    ui.toast(sealMustLeaveToast(), 'warn')
    return false
  }
  if (!resources.hasStone(cost)) {
    ui.toast(sealShortToast(), 'warn')
    return false
  }
  resources.spendStone(cost)
  inventory.replaceItem({ ...inst, sealedAffixIds: [...(inst.sealedAffixIds ?? []), affixId] })
  const name = affixDef(affixId)?.name ?? '词条'
  ui.toast(sealDoneToast(name), 'success')
  return true
}
