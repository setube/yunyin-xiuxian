/** 资源状态 —— 灵石(大数)与各类材料 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { GNum, SmallResourceId } from '@/types'
import { add, gn, gnZero, gte, subClamp } from '@/utils/gnum'
import { QI_BANK_MULT } from '@/data/constants'
import { persistConfig } from '@/utils/storage'

export const useResourcesStore = defineStore(
  'resources',
  () => {
    const spiritStone = ref<GNum>(gnZero())
    const qi = ref(0)
    const wudao = ref(0)
    const herb = ref(0)
    const ore = ref(0)
    const page = ref(0)
    const dust = ref(0)

    const smallRefs = { wudao, herb, ore, page, dust }

    function addStone(v: GNum): void {
      spiritStone.value = add(spiritStone.value, v)
    }

    function spendStone(v: GNum): boolean {
      if (!gte(spiritStone.value, v)) return false
      spiritStone.value = subClamp(spiritStone.value, v)
      return true
    }

    function hasStone(v: GNum): boolean {
      return gte(spiritStone.value, v)
    }

    function addSmall(id: SmallResourceId, n: number): void {
      const r = smallRefs[id]
      r.value = Math.max(0, Math.floor(r.value + n))
    }

    function spendSmall(id: SmallResourceId, n: number): boolean {
      const r = smallRefs[id]
      if (r.value < n) return false
      r.value -= n
      return true
    }

    function hasSmall(id: SmallResourceId, n: number): boolean {
      return smallRefs[id].value >= n
    }

    function setQi(v: number, cap: number): void {
      // 灵气可「积余」到标称容量的 QI_BANK_MULT 倍:标称容量只是"满"的界线
      // (灵气充盈加成、突破耗时皆以它为基准),不是硬顶 —— 卡境期间灵气继续累积
      qi.value = Math.max(0, Math.min(cap * QI_BANK_MULT, v))
    }

    /** 存档修复:重建大数字段,并把负数/非有限值一并夹回 0(与 settings.sanitize 同判据) */
    function sanitize(): void {
      spiritStone.value = gn(spiritStone.value)
      for (const key of Object.keys(smallRefs) as SmallResourceId[]) {
        const r = smallRefs[key]
        if (!Number.isFinite(r.value)) r.value = 0
        r.value = Math.max(0, r.value)
      }
      if (!Number.isFinite(qi.value)) qi.value = 0
      qi.value = Math.max(0, qi.value)
    }

    return {
      spiritStone,
      qi,
      wudao,
      herb,
      ore,
      page,
      dust,
      addStone,
      spendStone,
      hasStone,
      addSmall,
      spendSmall,
      hasSmall,
      setQi,
      sanitize
    }
  },
  { persist: persistConfig('resources') }
)
