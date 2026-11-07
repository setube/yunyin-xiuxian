/** 构筑服务:捕获当前整套 Build / 一键切换 */
import type { EquipSlot } from '@/types'
import { uid } from '@/utils/id'
import { truncateCodePoints } from '@/utils/saveShape'
import { NAME_MAX_LENGTH } from '@/data/constants'
import { EQUIP_SLOT_NAMES, EQUIP_SLOTS, equipmentTemplate } from '@/data/equipment'
import { artifactDef, artifactSlotsFor } from '@/data/artifacts'
import { gongfaDef } from '@/data/gongfa'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useCultivationStore } from '@/stores/cultivation'
import { useDongfuStore } from '@/stores/dongfu'
import { useLoadoutsStore, MAX_LOADOUTS, type Loadout } from '@/stores/loadouts'
import { useUiStore } from '@/stores/ui'
import {
  loadoutApplyToast,
  loadoutFullToast,
  loadoutRenamedToast,
  loadoutSavedToast
} from '@/ui/inventoryText'
import { detectBuild } from './buildDetect'

/** 保存当前构筑为快照 */
export function captureLoadout(name: string): Loadout | null {
  const inventory = useInventoryStore()
  const cultivation = useCultivationStore()
  const player = usePlayerStore()
  const loadouts = useLoadoutsStore()
  const ui = useUiStore()
  if (loadouts.list.length >= MAX_LOADOUTS) {
    ui.toast(loadoutFullToast(MAX_LOADOUTS), 'warn')
    return null
  }
  const detected = detectBuild(player.finalStats.mods)
  const loadout: Loadout = {
    id: uid(),
    // 按字素簇截:构筑名可能是 emoji,`.slice(0, 8)` 会劈开代理对或 ZWJ 序列
    name: truncateCodePoints(name.trim(), NAME_MAX_LENGTH) || detected?.style.name || '无名构筑',
    seal: detected?.style.seal ?? '道',
    mainGongfa: cultivation.mainGongfa,
    subGongfa: [...cultivation.subGongfa],
    artifactIds: [...inventory.equippedArtifacts],
    equipment: { ...inventory.equipped },
    savedAt: Date.now()
  }
  loadouts.add(loadout)
  ui.toast(loadoutSavedToast(loadout.name), 'success')
  return loadout
}

/** 一键切换构筑;缺失的部件跳过并汇报 */
export function applyLoadout(id: string): boolean {
  const inventory = useInventoryStore()
  const cultivation = useCultivationStore()
  const dongfu = useDongfuStore()
  const player = usePlayerStore()
  const loadouts = useLoadoutsStore()
  const ui = useUiStore()
  const loadout = loadouts.list.find(l => l.id === id)
  if (!loadout) return false
  let missing = 0
  /** 报得出来的缺件名:装备位缺了、功法没习、法宝没收藏 */
  const missingNames: string[] = []

  for (const slot of Object.keys(loadout.equipment) as EquipSlot[]) {
    // 执行路径也认槽名:未经 sanitize 的快照(旧档/内存直塞)不能把件穿进幽灵槽
    if (!EQUIP_SLOTS.includes(slot)) continue
    const itemUid = loadout.equipment[slot]
    if (!itemUid) continue
    const item = inventory.findItem(itemUid)
    if (item && equipmentTemplate(item.templateId)?.slot === slot) {
      inventory.equip(itemUid, slot)
    } else {
      missing += 1
      missingNames.push(EQUIP_SLOT_NAMES[slot] ?? slot)
      inventory.unequip(slot)
    }
  }
  // capture 只写了非空位:不在 equipment 里的位 = 存时空着,须卸掉,否则还原成 A(存)+B(现)的杂交构筑
  for (const slot of Object.keys(EQUIP_SLOT_NAMES) as EquipSlot[]) {
    if (!(slot in loadout.equipment)) inventory.unequip(slot)
  }
  if (
    loadout.mainGongfa &&
    cultivation.learned[loadout.mainGongfa] &&
    gongfaDef(loadout.mainGongfa)?.type === 'main'
  ) {
    cultivation.equipMain(loadout.mainGongfa)
  } else if (loadout.mainGongfa) {
    missing += 1
    missingNames.push(gongfaDef(loadout.mainGongfa)?.name ?? '主修功法')
  }
  const subCap = Math.max(0, Math.floor(dongfu.subGongfaSlots))
  // 快照里的重复项(sanitize 之前的旧档)不能占两次槽、也不能报两次缺件
  const snapshotSubs = [...new Set(loadout.subGongfa)]
  // 旧档/手改快照的辅修席可能混入主修门类:与 toggleSub 同一道门类闸
  const eligibleSubs = snapshotSubs.filter(g => {
    const def = gongfaDef(g)
    return !!cultivation.learned[g] && !!def && def.type !== 'main' && g !== cultivation.mainGongfa
  })
  const validSubs = eligibleSubs.slice(0, subCap)
  // 缺件分两种,都须点名:没学过(或不是辅修)的,与学过但槽位不够被砍的
  const unownedSubs = snapshotSubs.filter(g => !eligibleSubs.includes(g))
  const overflowSubs = eligibleSubs.slice(subCap)
  missing += unownedSubs.length + overflowSubs.length
  for (const g of [...unownedSubs, ...overflowSubs]) missingNames.push(gongfaDef(g)?.name ?? g)
  cultivation.subGongfa = validSubs
  const artifactCap = artifactSlotsFor(player.major)
  const owned = new Set(inventory.artifacts.map(a => a.defId))
  const snapshotArts = [...new Set(loadout.artifactIds)]
  const validArts = snapshotArts.filter(a => owned.has(a)).slice(0, artifactCap)
  const unownedArts = snapshotArts.filter(a => !owned.has(a))
  // 法宝位同理:收着但槽位不够的也要点名
  const overflowArts = snapshotArts.filter(a => owned.has(a)).slice(artifactCap)
  missing += unownedArts.length + overflowArts.length
  for (const a of [...unownedArts, ...overflowArts]) missingNames.push(artifactDef(a)?.name ?? a)
  inventory.equippedArtifacts = validArts

  // 槽位不够与「没学过/没收藏」解法不同,原因一并交给文案层
  const slotLimited = overflowSubs.length + overflowArts.length > 0
  ui.toast(loadoutApplyToast(loadout.name, missing, missingNames, slotLimited), 'success')
  return true
}

export function deleteLoadout(id: string): void {
  useLoadoutsStore().remove(id)
}

/** 构筑改名:清首尾空白、收敛到 8 字(与保存同一套收敛);空名回落「无名构筑」;找不到该套则静默失败 */
export function renameLoadout(id: string, name: string): boolean {
  const loadouts = useLoadoutsStore()
  const ui = useUiStore()
  if (!loadouts.list.some(l => l.id === id)) return false
  const next = truncateCodePoints(name.trim(), NAME_MAX_LENGTH) || '无名构筑'
  loadouts.rename(id, next)
  ui.toast(loadoutRenamedToast(next), 'success')
  return true
}
