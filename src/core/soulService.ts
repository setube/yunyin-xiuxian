/**
 * 器魂服务 —— 凝炼与装配的编排
 *
 * 凝炼要销毁原器且耗道源:两重代价让「凝哪件」成为真决策。
 * 天界只认器魂,人间只认法器——同一件东西不可能两头都占。
 */
import { refineSoul, previewSoul, canRefine } from './soulForge'
import { soulName, SOUL_SLOTS } from '@/data/souls'
import { equipmentTemplate } from '@/data/equipment'
import { track } from './progress'
import { useInventoryStore } from '@/stores/inventory'
import { useEndgameStore } from '@/stores/endgame'
import { useUiStore } from '@/stores/ui'

/** 凝炼一枚器魂需耗的道源 */
export const SOUL_REFINE_COST = 20

/**
 * 凝炼:销毁装备,得一枚器魂。
 * 已装备的、锁定的一律不可凝——避免手滑毁掉正在用的法器
 */
export function refineEquipment(uid: string): boolean {
  const inventory = useInventoryStore()
  const endgame = useEndgameStore()
  const ui = useUiStore()

  const inst = inventory.findItem(uid)
  if (!inst) return false
  if (inst.locked) {
    ui.toast('此器已锁,先解锁再凝', 'warn')
    return false
  }
  if (Object.values(inventory.equipped).includes(uid)) {
    ui.toast('身上之物无法入炉,先卸下', 'warn')
    return false
  }
  if (!canRefine(inst)) {
    ui.toast('此器平平无奇,无形意可存', 'warn')
    return false
  }
  if (!endgame.spendDaoSource(SOUL_REFINE_COST)) {
    ui.toast(`道源不足 ${SOUL_REFINE_COST}`, 'warn')
    return false
  }

  const soul = refineSoul(inst)
  if (!soul) {
    // 理论上 canRefine 已挡住,退款以防万一
    endgame.addDaoSource(SOUL_REFINE_COST)
    return false
  }
  inventory.removeEquipment(uid)
  endgame.addSoul(soul)
  track('soulsRefined')
  const t = equipmentTemplate(inst.templateId)
  ui.toast(`「${t?.name}」形销而意存,凝作${soulName(soul)}`, 'rare')
  return true
}

/** 装配器魂;槽位满时提示 */
export function wearSoul(uid: string): boolean {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  if (endgame.activeSouls.length >= SOUL_SLOTS && !endgame.activeSouls.some(s => s.uid === uid)) {
    ui.toast(`神魂只容得下 ${SOUL_SLOTS} 缕形意,先散去一缕`, 'warn')
    return false
  }
  return endgame.equipSoul(uid)
}

export function removeSoul(uid: string): void {
  useEndgameStore().unequipSoul(uid)
}

/** 散去器魂:不可逆,原器早已毁去 */
export function dissolveSoul(uid: string): void {
  const endgame = useEndgameStore()
  const ui = useUiStore()
  const soul = endgame.soulList.find(s => s.uid === uid)
  if (!soul) return
  endgame.dissolveSoul(uid)
  ui.toast(`${soulName(soul)}散入天地`, 'info')
}

export { previewSoul, canRefine }
