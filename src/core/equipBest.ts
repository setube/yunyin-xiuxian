/**
 * 一键换装 · 每槽换上当前最强的一件(玩家反馈:「一键装备最高阶级品质装备快捷键」)。
 *
 * 「最强」取玩家口中的关键词:阶级 + 品质 ——
 * 品质 rank(凡→神) → 层级 → 强化等级 → 词条成色。纯方便性功能:
 * 只改装配,不分解、不炼化、不卖任何一件;换下来的旧件自动回行囊。
 *
 * 同一件已经是该槽最强时,一键不做事(幂等,不会来回换)。
 */
import { useInventoryStore } from '@/stores/inventory'
import { qualityDef } from '@/data/qualities'
import { equipmentTemplate } from '@/data/equipment'
import type { EquipmentInstance, EquipSlot } from '@/types'

/** 常驻九衣(InventoryView 的 SLOTS 同款;法宝/神器另有切面) */
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'head', 'body', 'wrist', 'belt', 'boots', 'necklace', 'ring', 'talisman']

function qualityRank(i: EquipmentInstance): number {
  return qualityDef(i.quality).rank
}

function rollSum(i: EquipmentInstance): number {
  return i.affixes.reduce((s, x) => s + x.roll, 0)
}

/** a 是否严格强于 b(阶级 → 层级 → 强化 → 词条成色) */
export function betterEquip(a: EquipmentInstance, b: EquipmentInstance): boolean {
  const qa = qualityRank(a)
  const qb = qualityRank(b)
  if (qa !== qb) return qa > qb
  if (a.tier !== b.tier) return a.tier > b.tier
  if (a.level !== b.level) return a.level > b.level
  return rollSum(a) > rollSum(b)
}

/** 该槽该穿的最强一件(该槽无任何可穿戴时返回 null) */
export function bestEquipFor(slot: EquipSlot): EquipmentInstance | null {
  const inventory = useInventoryStore()
  const pool = inventory.items.filter(i => equipmentTemplate(i.templateId)?.slot === slot)
  if (pool.length === 0) return null
  return pool.reduce((a, b) => (betterEquip(b, a) ? b : a))
}

/** 一键换装单槽:换上最强一件,已是则不动。返回是否真的换了 */
export function equipBestFor(slot: EquipSlot): boolean {
  const inventory = useInventoryStore()
  const best = bestEquipFor(slot)
  if (!best) return false
  if (inventory.equipped[slot] === best.uid) return false
  inventory.equip(best.uid, slot)
  return true
}

/** 一键换装全部九槽:返回换了几件 */
export function equipAllBest(): number {
  let changed = 0
  for (const slot of EQUIP_SLOTS) {
    if (equipBestFor(slot)) changed += 1
  }
  return changed
}

/**
 * 一键穿齐某共鸣套(玩家反馈:「能不能装备按照套装排序,或者穿套装」)。
 * 每槽换上该套**已持有里最强**的一件(品质→层级→强化,同 betterEquip);
 * 已穿的那件更强就不动 —— 穿套装绝不降级。返回换上几件。
 */
export function equipSetCombo(setId: string): number {
  const inventory = useInventoryStore()
  const bestPerSlot = new Map<EquipSlot, EquipmentInstance>()
  for (const it of inventory.items) {
    const tpl = equipmentTemplate(it.templateId)
    if (!tpl || tpl.set !== setId) continue
    const cur = bestPerSlot.get(tpl.slot)
    if (!cur || betterEquip(it, cur)) bestPerSlot.set(tpl.slot, it)
  }
  let changed = 0
  for (const [slot, piece] of bestPerSlot) {
    if (inventory.equipped[slot] === piece.uid) continue
    const occupant = inventory.equipped[slot] ? inventory.findItem(inventory.equipped[slot]!) : undefined
    if (occupant && betterEquip(occupant, piece)) continue
    inventory.equip(piece.uid, slot)
    changed += 1
  }
  return changed
}
