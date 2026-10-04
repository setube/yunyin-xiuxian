/** 构筑快照 —— 保存/切换整套 Build(功法+法宝+装备) */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { EquipSlot } from '@/types'
import { persistConfig } from '@/utils/storage'
import { asArray } from '@/utils/saveShape'

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
      list.value = asArray<Loadout>(list.value).filter(l => l !== null && typeof l === 'object' && typeof l.id === 'string')
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
