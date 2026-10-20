/** 构筑快照 —— 保存/切换整套 Build(功法+法宝+装备) */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { EquipSlot } from '@/types'
import { persistConfig } from '@/utils/storage'
import { asArray, asFiniteNumber, asRecord, asStringArray } from '@/utils/saveShape'
import { uid } from '@/utils/id'
import { EQUIP_SLOTS } from '@/data/equipment'

export interface Loadout {
  id: string
  name: string
  /** 流派印章单字(保存时的识别结果) */
  seal: string
  mainGongfa: string | null
  subGongfa: string[]
  artifactIds: string[]
  /** 槽位 → 装备 uid */
  equipment: Partial<Record<EquipSlot, string>>
  savedAt: number
}

export const MAX_LOADOUTS = 6

export const useLoadoutsStore = defineStore(
  'loadouts',
  () => {
    const list = ref<Loadout[]>([])

    /** 存档修复:配装列表被写坏时,配装页会在渲染期抛错 */
    function sanitize(): void {
      // 条目 id 认不得就整条丢;认得的重建,逐个嵌套字段修平 ——
      // applyLoadout 会对 equipment 走 Object.keys、对 subGongfa/artifactIds 走 .filter,
      // 嵌套字段若被写坏(null / 非数组)一样会在切换时抛错,不能只保顶层 array。
      list.value = asArray<Loadout>(list.value)
        .filter(l => l !== null && typeof l === 'object' && typeof l.id === 'string')
        .map(l => {
          const equipment: Partial<Record<EquipSlot, string>> = {}
          for (const [slot, itemUid] of Object.entries(asRecord<string>(l.equipment))) {
            /**
             * 槽名必须是九个真部位之一。坏档写进 `artifact` 之类不存在的槽时,
             * `applyLoadout` 会照字面 `equip(u, 'artifact')`:该件随即被排除出行囊,
             * 却没有任何槽卡画它 —— 整套快照一切换,装备就凭空消失。
             */
            if (typeof itemUid === 'string' && itemUid && (EQUIP_SLOTS as string[]).includes(slot)) {
              equipment[slot as EquipSlot] = itemUid
            }
          }
          return {
            id: l.id,
            name: typeof l.name === 'string' ? l.name : '',
            seal: typeof l.seal === 'string' ? l.seal : '',
            mainGongfa: typeof l.mainGongfa === 'string' ? l.mainGongfa : null,
            // 快照里的辅修/法宝同样是集合:重复项被 applyLoadout 原样写回当前状态,
            // 同一门功法或同一件法宝就会被算两次(槽位也被白占)。
            subGongfa: [...new Set(asStringArray(l.subGongfa))],
            artifactIds: [...new Set(asStringArray(l.artifactIds))],
            equipment,
            savedAt: asFiniteNumber(l.savedAt, 0, 0)
          }
        })
      /**
       * 构筑 id 是 apply/rename/remove 的唯一凭据:坏档两套同号时,
       * `find` 只会切到第一套、`remove` 却把两套一起删、`rename` 把两套一起改名。
       * 构筑是玩家亲手存的不同快照,不能丢 —— 从第二套起换一个新 id。
       */
      const seen = new Set<string>()
      for (const l of list.value) {
        while (seen.has(l.id)) l.id = uid()
        seen.add(l.id)
      }
    }

    function add(loadout: Loadout): boolean {
      if (list.value.length >= MAX_LOADOUTS) return false
      list.value = [...list.value, loadout]
      return true
    }

    function remove(id: string): void {
      list.value = list.value.filter(l => l.id !== id)
    }

    function rename(id: string, name: string): void {
      list.value = list.value.map(l => (l.id === id ? { ...l, name } : l))
    }

    return { list, add, remove, rename, sanitize }
  },
  { persist: persistConfig('loadouts') }
)
