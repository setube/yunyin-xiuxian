/** 资源状态 —— 灵石(大数)与各类材料 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { GNum, SmallResourceId } from '@/types'
import { add, gn, gnZero, gte, subClamp } from '@/utils/gnum'
import { QI_BANK_MULT } from '@/data/constants'
import { FURNACE_HERB_MIN_GRADE } from '@/data/endgame'
import { HERB_GRADES, herbGradeOfMajor, isHerbGrade, type HerbGrade } from '@/data/herbGrades'
import { persistConfig } from '@/utils/storage'
import { usePlayerStore } from '@/stores/player'

/** 全新空灵草账:五品各 0 */
export function emptyHerbMap(): Record<HerbGrade, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
}

export const useResourcesStore = defineStore(
  'resources',
  () => {
    const spiritStone = ref<GNum>(gnZero())
    const qi = ref(0)
    const wudao = ref(0)
    /** 灵草按品阶分账:key = HerbGrade(1 凡品 → 5 道品) */
    const herbByGrade = ref<Record<HerbGrade, number>>(emptyHerbMap())
    const ore = ref(0)
    const page = ref(0)
    const dust = ref(0)

    // wudao/ore/page/dust 仍是单标量小资源;herb 另走 grade 分账,不在 smallRefs 里
    const smallRefs: Record<Exclude<SmallResourceId, 'herb'>, { value: number }> = { wudao, ore, page, dust }

    /** 玩家当前所在大境界应得的灵草品阶 —— 无来源界域的普发/采集默认落这品 */
    function currentHerbGrade(): HerbGrade {
      return herbGradeOfMajor(usePlayerStore().major)
    }

    /** 单标量小资源(herb 已分账,排除在外);取不到返回 undefined */
    function smallRef(id: SmallResourceId): { value: number } | undefined {
      if (id === 'herb') return undefined
      if (id in smallRefs) return smallRefs[id as Exclude<SmallResourceId, 'herb'>]
      return undefined
    }

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

    function herbOf(grade: HerbGrade): number {
      return herbByGrade.value[grade] ?? 0
    }

    /** 全部品阶之和 —— 界面「灵草 x」这类总量展示读它 */
    const herb = computed(() => HERB_GRADES.reduce((sum, g) => sum + (herbByGrade.value[g] ?? 0), 0))

    /** 指定品阶入账(来源界域明确的采集走它) */
    function addHerb(grade: HerbGrade, n: number): void {
      const g = isHerbGrade(grade) ? grade : currentHerbGrade()
      herbByGrade.value[g] = Math.max(0, Math.floor(herbByGrade.value[g] + n))
    }

    /** 指定品阶是否够 n 株 */
    function hasHerb(grade: HerbGrade, n: number): boolean {
      return herbByGrade.value[grade] >= n
    }

    /** 指定品阶扣 n 株;不够则不动、返回 false */
    function spendHerb(grade: HerbGrade, n: number): boolean {
      if (herbByGrade.value[grade] < n) return false
      herbByGrade.value[grade] -= n
      return true
    }

    /**
     * 天道熔炉可熔的灵草总和(仙品起,`FURNACE_HERB_MIN_GRADE`)。
     * 凡/灵品草只走坊市→灵石,永不入炉(道源是仙才有的货币)。
     */
    const herbMeltable = computed(() =>
      HERB_GRADES.filter(g => g >= FURNACE_HERB_MIN_GRADE).reduce((sum, g) => sum + (herbByGrade.value[g] ?? 0), 0)
    )

    /**
     * 跨品实扣仙品+灵草 n 株(自低品起扣,余数保留)。
     * 与 herbMeltable 同判据 —— 熔炉「按总和算、按这些品扣」,杜绝白拿道源。
     */
    function spendHerbMeltable(n: number): boolean {
      if (n < 1) return false
      let need = Math.floor(n)
      const acc = herbByGrade.value
      for (const g of HERB_GRADES) {
        if (g < FURNACE_HERB_MIN_GRADE) continue
        const take = Math.min(need, acc[g] ?? 0)
        acc[g] = Math.max(0, (acc[g] ?? 0) - take)
        need -= take
        if (need <= 0) return true
      }
      return need <= 0
    }

    /** 转世清零:五品一把清 */
    function resetHerbs(): void {
      herbByGrade.value = emptyHerbMap()
    }

    function addSmall(id: SmallResourceId, n: number): void {
      if (id === 'herb') {
        addHerb(currentHerbGrade(), n)
        return
      }
      const r = smallRef(id)
      if (!r) return
      r.value = Math.max(0, Math.floor(r.value + n))
    }

    function spendSmall(id: SmallResourceId, n: number): boolean {
      if (id === 'herb') return spendHerb(currentHerbGrade(), n)
      const r = smallRef(id)
      if (!r || r.value < n) return false
      r.value -= n
      return true
    }

    function hasSmall(id: SmallResourceId, n: number): boolean {
      if (id === 'herb') return hasHerb(currentHerbGrade(), n)
      const r = smallRef(id)
      return !!r && r.value >= n
    }

    function setQi(v: number, cap: number): void {
      // 灵气可「积余」到标称容量的 QI_BANK_MULT 倍:标称容量只是"满"的界线
      // (灵气充盈加成、突破耗时皆以它为基准),不是硬顶 —— 卡境期间灵气继续累积
      qi.value = Math.max(0, Math.min(cap * QI_BANK_MULT, v))
    }

    /** 存档修复:重建大数字段,并把负数/非有限值一并夹回 0(与 settings.sanitize 同判据) */
    function sanitize(): void {
      spiritStone.value = gn(spiritStone.value)
      // 灵草分账:逐品阶夹回非负有限整数,烂品清 0
      const raw = herbByGrade.value as unknown
      const clean: Record<HerbGrade, number> = emptyHerbMap()
      if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
          const grade = Number(k)
          if (!isHerbGrade(grade)) continue
          const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0
          clean[grade] = Math.max(0, n)
        }
      }
      herbByGrade.value = clean
      for (const key of Object.keys(smallRefs) as Exclude<SmallResourceId, 'herb'>[]) {
        const r = smallRef(key)
        if (!r) continue
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
      herbByGrade,
      ore,
      page,
      dust,
      herbOf,
      addHerb,
      hasHerb,
      spendHerb,
      herbMeltable,
      spendHerbMeltable,
      resetHerbs,
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
