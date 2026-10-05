/**
 * 一键换装 · 每槽换上当前最强的一件(玩家反馈:「一键装备最高阶级品质装备快捷键」)。
 *
 * 「最强」取**真实战斗价值**(equippablePower):基础攻/防/血平铺(层级曲线 × 品质 ×
 * 强化如前,resolveEquipStats 现算)+ 词条战力(权重与战力面板同源,见 powerRating)。
 * 旧口径按「品质 → 层级 → 强化 → 词条」粗排,把**强化满、阶数高**的装备压在高品位
 * 新鲜胚子之下 —— 玩家眼里最强的没上身(反馈:「一键装备没有将最强的装备装上」)。
 * 粗排降级为「同分平手」的稳定裁决(betterEquip),不再当主键。
 * 纯方便性功能:只改装配,不分解、不炼化、不卖任何一件;换下来的旧件自动回行囊。
 *
 * 同一件已经是该槽最强时,一键不做事(幂等,不会来回换)。
 */
import { useInventoryStore } from '@/stores/inventory'
import { qualityDef } from '@/data/qualities'
import { equipmentTemplate } from '@/data/equipment'
import { resolveEquipStats } from './equipGen'
import { POWER_STAT_WEIGHTS } from './powerRating'
import { toNum } from '@/utils/gnum'
import type { AnyStatKey, EquipmentInstance, EquipSlot } from '@/types'

/** 常驻九衣(InventoryView 的 SLOTS 同款;法宝/神器另有切面) */
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'head', 'body', 'wrist', 'belt', 'boots', 'necklace', 'ring', 'talisman']

function qualityRank(i: EquipmentInstance): number {
  return qualityDef(i.quality).rank
}

function rollSum(i: EquipmentInstance): number {
  return i.affixes.reduce((s, x) => s + x.roll, 0)
}

/** 血条平铺对攻/防当量的折算:战斗里伤害∝攻、承伤按 def/(def+k·atk) 减伤、血线性延命;一根血约值一轮续命 */
const HP_FLAT_WEIGHT = 1 / 6

/**
 * 一件装备的真实战斗价值(一键「最强」的口径)。
 * = 基础攻/防/血平铺(resolveEquipStats:层级曲线 × 品质^1.8 × (1+强化×0.12))
 *   + 词条战力:会心按「会心×(1+会心伤)」联乘,其余走战力面板同一张权重表;
 *   成长类词条(修炼/寿元/掉率等)不进战力,一键不因它们改变装配。
 */
export function equippablePower(i: EquipmentInstance): number {
  const r = resolveEquipStats(i)
  const f = r.flats
  let value = toNum(f.attack) + toNum(f.defense) + toNum(f.maxHp) * HP_FLAT_WEIGHT
  const critRate = r.mods.critRate ?? 0
  const critDamage = r.mods.critDamage ?? 0
  value += critRate * (1 + critDamage)
  for (const [k, raw] of Object.entries(r.mods)) {
    if (k === 'critRate' || k === 'critDamage') continue
    value += (POWER_STAT_WEIGHTS[k as AnyStatKey] ?? 0) * (raw ?? 0)
  }
  return value
}

/** a 是否严格强于 b(阶级 → 层级 → 强化 → 词条成色)。现作「同战力」的稳定裁决与列表排序 */
export function betterEquip(a: EquipmentInstance, b: EquipmentInstance): boolean {
  const qa = qualityRank(a)
  const qb = qualityRank(b)
  if (qa !== qb) return qa > qb
  if (a.tier !== b.tier) return a.tier > b.tier
  if (a.level !== b.level) return a.level > b.level
  return rollSum(a) > rollSum(b)
}

/** a 是否严格强于 b:真实战力为主,同分回退到粗排。一键换装与穿套共用同一把尺 */
function stronger(a: EquipmentInstance, b: EquipmentInstance): boolean {
  const pa = equippablePower(a)
  const pb = equippablePower(b)
  if (pa !== pb) return pa > pb
  return betterEquip(a, b)
}

/** 该槽该穿的最强一件(该槽无任何可穿戴时返回 null)。以真实战力为主,同分回退到粗排 */
export function bestEquipFor(slot: EquipSlot): EquipmentInstance | null {
  const inventory = useInventoryStore()
  const pool = inventory.items.filter(i => equipmentTemplate(i.templateId)?.slot === slot)
  if (pool.length === 0) return null
  return pool.reduce((a, b) => (stronger(b, a) ? b : a))
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
 * 空一身:卸下全部已佩戴的装备(回到行囊,不分解不炼化)。
 * 清理破烂得先「脱身」—— 已佩戴的件不参加分解/收纳,逐格手动卸太苦;
 * 一键换装只进不退,这枚是它成对的反向出口。返回卸了几件。
 */
export function unequipAllEquipped(): number {
  const inventory = useInventoryStore()
  let removed = 0
  for (const slot of EQUIP_SLOTS) {
    if (inventory.equipped[slot]) {
      inventory.unequip(slot)
      removed += 1
    }
  }
  return removed
}

/**
 * 一键穿齐某共鸣套(玩家反馈:「能不能装备按照套装排序,或者穿套装」)。
 * 每槽换上该套**已持有里最强**的一件(真实战力,同分回退到粗排,同 stronger);
 * 已穿的那件更强就不动 —— 穿套装绝不降级。返回换上几件。
 */
export function equipSetCombo(setId: string): number {
  const inventory = useInventoryStore()
  const bestPerSlot = new Map<EquipSlot, EquipmentInstance>()
  for (const it of inventory.items) {
    const tpl = equipmentTemplate(it.templateId)
    if (!tpl || tpl.set !== setId) continue
    const cur = bestPerSlot.get(tpl.slot)
    if (!cur || stronger(it, cur)) bestPerSlot.set(tpl.slot, it)
  }
  let changed = 0
  for (const [slot, piece] of bestPerSlot) {
    if (inventory.equipped[slot] === piece.uid) continue
    const occupant = inventory.equipped[slot] ? inventory.findItem(inventory.equipped[slot]!) : undefined
    if (occupant && stronger(occupant, piece)) continue
    inventory.equip(piece.uid, slot)
    changed += 1
  }
  return changed
}
