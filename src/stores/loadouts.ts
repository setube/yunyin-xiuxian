/** 构筑快照 —— 保存/切换整套 Build(功法+法宝+装备) */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { EquipSlot } from '@/types'
import { persistConfig } from '@/utils/storage'
import { asArray, asFiniteNumber, asRecord, asStringArray } from '@/utils/saveShape'
import { uid } from '@/utils/id'
import { EQUIP_SLOTS } from '@/data/equipment'
import { NAME_MAX_LENGTH, SUB_GONGFA_SLOT_HARD_CAP } from '@/data/constants'
import { ARTIFACT_MAX_SLOTS } from '@/data/artifacts'

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
      // 嵌套字段也须修平:applyLoadout 对 equipment 走 Object.keys、对 subGongfa/artifactIds 走 .filter
      list.value = asArray<Loadout>(list.value)
        .filter(l => l !== null && typeof l === 'object' && typeof l.id === 'string')
        .map(l => {
          const equipment: Partial<Record<EquipSlot, string>> = {}
          for (const [slot, itemUid] of Object.entries(asRecord<string>(l.equipment))) {
            // 槽名须是九个真部位之一:野槽名会被 applyLoadout 照字面 equip,该件从行囊消失且无槽卡显示
            if (typeof itemUid === 'string' && itemUid && (EQUIP_SLOTS as string[]).includes(slot)) {
              equipment[slot as EquipSlot] = itemUid
            }
          }
          return {
            id: l.id,
            // 与输入侧同界:构筑名在 loadoutService 里截到 NAME_MAX_LENGTH,读档侧也要截
            name: typeof l.name === 'string' ? l.name.trim().slice(0, NAME_MAX_LENGTH) : '',
            seal: typeof l.seal === 'string' ? l.seal : '',
            mainGongfa: typeof l.mainGongfa === 'string' ? l.mainGongfa : null,
            // 辅修/法宝是集合:重复项会被 applyLoadout 原样写回,算两次
            // 条数设界:应用侧 artifactIds/subGongfa 都会按动态槽位再截一次,
            // 但存档里留下的冗余数据会一直躺着 —— 手改快照能塞进几千个 id。
            subGongfa: [...new Set(asStringArray(l.subGongfa))].slice(0, SUB_GONGFA_SLOT_HARD_CAP),
            artifactIds: [...new Set(asStringArray(l.artifactIds))].slice(0, ARTIFACT_MAX_SLOTS),
            equipment,
            savedAt: asFiniteNumber(l.savedAt, 0, 0)
          }
        })
      // id 是 apply/rename/remove 的唯一凭据:同号时从第二套起换新 id,不丢弃
      const seen = new Set<string>()
      for (const l of list.value) {
        while (seen.has(l.id)) l.id = uid()
        seen.add(l.id)
      }
      /*
       * 超上限截断。
       *
       * add() 的判据是 `list.length >= MAX_LOADOUTS`,而 sanitize 原先不截断:
       * 把 list 撑到几十套的坏档会被原样吃下,add 从此恒返 false ——
       * 玩家再也存不了新构筑(与「行囊已满」「灵脉容量已尽」「收徒恒 full」同构)。
       * 只留前 MAX_LOADOUTS 套,顺序即存档顺序。
       */
      if (list.value.length > MAX_LOADOUTS) list.value = list.value.slice(0, MAX_LOADOUTS)
    }

    function add(loadout: Loadout): boolean {
      if (!loadout || typeof loadout !== 'object' || typeof loadout.id !== 'string' || !loadout.id) return false
      if (list.value.length >= MAX_LOADOUTS) return false
      if (list.value.some(l => l.id === loadout.id)) return false
      list.value = [...list.value, loadout]
      return true
    }

    function remove(id: string): void {
      if (typeof id !== 'string' || !id) return
      list.value = list.value.filter(l => l.id !== id)
    }

    function rename(id: string, name: string): void {
      if (typeof id !== 'string' || !id || typeof name !== 'string') return
      list.value = list.value.map(l => (l.id === id ? { ...l, name } : l))
    }

    return { list, add, remove, rename, sanitize }
  },
  { persist: persistConfig('loadouts') }
)
