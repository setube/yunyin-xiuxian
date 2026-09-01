/** 修行状态 —— 功法(习得/装配)与 Buff */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BuffInstance, CombatSkill, StatMods } from '@/types'
import { persistConfig } from '@/utils/storage'
import { gongfaDef } from '@/data/gongfa'
import { buffDef } from '@/data/buffs'
import { gongfaBranchDef } from '@/data/gongfaBranches'
import { mergeMods } from '@/core/statsCalc'

/** 功法在某等级下的属性 */
export function gongfaModsAt(id: string, level: number): StatMods {
  const def = gongfaDef(id)
  if (!def) return {}
  const out: StatMods = {}
  for (const k in def.baseMods) {
    const key = k as keyof StatMods
    out[key] = def.baseMods[key] ?? 0
  }
  for (const k in def.perLevelMods) {
    const key = k as keyof StatMods
    out[key] = (out[key] ?? 0) + (def.perLevelMods[key] ?? 0) * Math.max(0, level - 1)
  }
  return out
}

export const useCultivationStore = defineStore(
  'cultivation',
  () => {
    /** 已习得功法:id → 等级 */
    const learned = ref<Record<string, number>>({})
    const mainGongfa = ref<string | null>(null)
    const subGongfa = ref<string[]>([])
    const buffs = ref<BuffInstance[]>([])
    /** Phase 31 A3:功法悟道分支(gongfaId → branchId,满级后择一) */
    const gongfaBranch = ref<Record<string, string>>({})

    const gongfaMods = computed<StatMods>(() => {
      const sources: StatMods[] = []
      if (mainGongfa.value && learned.value[mainGongfa.value]) {
        sources.push(gongfaModsAt(mainGongfa.value, learned.value[mainGongfa.value]!))
      }
      for (const id of subGongfa.value) {
        if (learned.value[id]) sources.push(gongfaModsAt(id, learned.value[id]!))
      }
      // Phase 31 A3:悟道分支追加词条(选过的功法)
      for (const [gid, bid] of Object.entries(gongfaBranch.value)) {
        const def = gongfaBranchDef(bid)
        if (def?.gongfaId === gid) sources.push(def.mods)
      }
      return mergeMods(sources)
    })

    const buffMods = computed<StatMods>(() => {
      const sources: StatMods[] = []
      for (const b of buffs.value) {
        const def = buffDef(b.defId)
        if (def) sources.push(def.mods)
      }
      return mergeMods(sources)
    })

    /** 主修功法附带的战斗技能 */
    const mainSkill = computed<CombatSkill | null>(() => {
      if (!mainGongfa.value) return null
      const def = gongfaDef(mainGongfa.value)
      return def?.skill ? { ...def.skill } : null
    })

    function learn(id: string): boolean {
      if (learned.value[id]) return false
      learned.value = { ...learned.value, [id]: 1 }
      const def = gongfaDef(id)
      if (def?.type === 'main' && !mainGongfa.value) mainGongfa.value = id
      return true
    }

    function upgrade(id: string): void {
      const lv = learned.value[id]
      if (!lv) return
      learned.value = { ...learned.value, [id]: lv + 1 }
    }

    function equipMain(id: string): void {
      if (learned.value[id]) mainGongfa.value = id
    }

    function toggleSub(id: string, maxSlots: number): boolean {
      if (subGongfa.value.includes(id)) {
        subGongfa.value = subGongfa.value.filter(x => x !== id)
        return true
      }
      if (subGongfa.value.length >= maxSlots) return false
      if (!learned.value[id]) return false
      subGongfa.value = [...subGongfa.value, id]
      return true
    }

    function addBuff(defId: string, now: number): void {
      const def = buffDef(defId)
      if (!def) return
      const endsAt = now + def.durationSec * 1000
      const existing = buffs.value.find(b => b.defId === defId)
      if (existing) {
        buffs.value = buffs.value.map(b => (b.defId === defId ? { ...b, endsAt: Math.max(b.endsAt, endsAt) } : b))
      } else {
        buffs.value = [...buffs.value, { defId, endsAt }]
      }
    }

    function hasBuff(defId: string): boolean {
      return buffs.value.some(b => b.defId === defId)
    }

    /** 移除过期 Buff,返回是否有变化 */
    function pruneBuffs(now: number): boolean {
      const next = buffs.value.filter(b => b.endsAt > now)
      if (next.length !== buffs.value.length) {
        buffs.value = next
        return true
      }
      return false
    }

    function clearNegativeBuffs(): void {
      buffs.value = buffs.value.filter(b => buffDef(b.defId)?.kind !== 'injury')
    }

    // Phase 31 A3:选择功法悟道分支(满级后一次,不可改)
    function chooseBranch(gongfaId: string, branchId: string): boolean {
      const full = (learned.value[gongfaId] ?? 0) >= (gongfaDef(gongfaId)?.maxLevel ?? 9)
      const def = gongfaBranchDef(branchId)
      if (!full || !def || def.gongfaId !== gongfaId) return false
      if (gongfaBranch.value[gongfaId]) return false
      gongfaBranch.value = { ...gongfaBranch.value, [gongfaId]: branchId }
      return true
    }

    return {
      learned,
      mainGongfa,
      subGongfa,
      buffs,
      gongfaBranch,
      gongfaMods,
      buffMods,
      mainSkill,
      learn,
      upgrade,
      equipMain,
      toggleSub,
      addBuff,
      hasBuff,
      pruneBuffs,
      clearNegativeBuffs,
      chooseBranch
    }
  },
  { persist: persistConfig('cultivation') }
)
