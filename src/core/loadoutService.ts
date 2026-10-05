/**
 * 构筑服务 —— 捕获当前整套 Build / 一键切换
 */
import type { EquipSlot } from '@/types'
import { uid } from '@/utils/id'
import { equipmentTemplate } from '@/data/equipment'
import { artifactSlotsFor } from '@/data/artifacts'
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
    name: name.trim().slice(0, 8) || detected?.style.name || '无名构筑',
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

  // 装备
  for (const slot of Object.keys(loadout.equipment) as EquipSlot[]) {
    const itemUid = loadout.equipment[slot]
    if (!itemUid) continue
    const item = inventory.findItem(itemUid)
    if (item && equipmentTemplate(item.templateId)?.slot === slot) {
      inventory.equip(itemUid, slot)
    } else {
      missing += 1
      inventory.unequip(slot)
    }
  }
  // 功法
  if (loadout.mainGongfa && cultivation.learned[loadout.mainGongfa] && gongfaDef(loadout.mainGongfa)) {
    cultivation.equipMain(loadout.mainGongfa)
  } else if (loadout.mainGongfa) {
    missing += 1
  }
  const subCap = dongfu.subGongfaSlots
  const validSubs = loadout.subGongfa.filter(g => cultivation.learned[g]).slice(0, subCap)
  missing += loadout.subGongfa.length - validSubs.length
  cultivation.subGongfa = validSubs
  // 法宝
  const artifactCap = artifactSlotsFor(player.major)
  const owned = new Set(inventory.artifacts.map(a => a.defId))
  const validArts = loadout.artifactIds.filter(a => owned.has(a)).slice(0, artifactCap)
  missing += loadout.artifactIds.length - validArts.length
  inventory.equippedArtifacts = validArts

  ui.toast(loadoutApplyToast(loadout.name, missing), 'success')
  return true
}

export function deleteLoadout(id: string): void {
  useLoadoutsStore().remove(id)
}

/**
 * 构筑改名:清首尾空白、收敛到 8 字(与保存同一套收敛);空名回落「无名构筑」。
 * 找不到该套则静默失败(改了不存在的 id 没什么可报的)。
 */
export function renameLoadout(id: string, name: string): boolean {
  const loadouts = useLoadoutsStore()
  const ui = useUiStore()
  if (!loadouts.list.some(l => l.id === id)) return false
  const next = name.trim().slice(0, 8) || '无名构筑'
  loadouts.rename(id, next)
  ui.toast(loadoutRenamedToast(next), 'success')
  return true
}
