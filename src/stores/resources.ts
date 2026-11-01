/** 资源:灵石(大数)与各类材料 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { GNum, SmallResourceId } from '@/types'
import { add, gn, gnZero, gte, subClamp } from '@/utils/gnum'
import { QI_BANK_MULT } from '@/data/constants'
import { FURNACE_HERB_MIN_GRADE } from '@/data/endgame'
import { HERB_GRADES, herbGradeOfMajor, isHerbGrade, type HerbGrade } from '@/data/herbGrades'
import { persistConfig } from '@/utils/storage'
import { asBoundedGNum } from '@/utils/saveShape'
import { usePlayerStore } from '@/stores/player'

/** 入账只认有限正数 */
function positiveAmount(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0) return null
  const amount = Math.floor(n)
  return amount > 0 ? amount : null
}

/** 扣款只认有限非负数;非整数按整数份额扣;0 成功且不动账 */
function spendAmount(n: number): number | null {
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

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

    // herb 另走品阶分账,不在 smallRefs 里
    const smallRefs: Record<Exclude<SmallResourceId, 'herb'>, { value: number }> = { wudao, ore, page, dust }

    /** 当前大境界的灵草品阶;无来源界域的普发/采集默认落这品 */
    function currentHerbGrade(): HerbGrade {
      return herbGradeOfMajor(usePlayerStore().major)
    }

    function smallRef(id: SmallResourceId): { value: number } | undefined {
      if (id === 'herb') return undefined
      if (id in smallRefs) return smallRefs[id as Exclude<SmallResourceId, 'herb'>]
      return undefined
    }

    function addStone(v: GNum): void {
      const amount = gn(v)
      if (amount.m <= 0) return
      spiritStone.value = add(spiritStone.value, amount)
    }

    function spendStone(v: GNum): boolean {
      // 负大数会被 subClamp 当成加法,余额反而上涨
      if (!v || !Number.isFinite(v.m) || !Number.isFinite(v.e) || v.m < 0) return false
      const amount = gn(v)
      if (amount.m === 0) return true
      if (!gte(spiritStone.value, amount)) return false
      spiritStone.value = subClamp(spiritStone.value, amount)
      return true
    }

    function hasStone(v: GNum): boolean {
      return gte(spiritStone.value, v)
    }

    function herbOf(grade: HerbGrade): number {
      return herbByGrade.value[grade] ?? 0
    }

    /** 全部品阶之和;界面总量展示读它 */
    const herb = computed(() => HERB_GRADES.reduce((sum, g) => sum + (herbByGrade.value[g] ?? 0), 0))

    /** 指定品阶入账(来源界域明确的采集走它) */
    function addHerb(grade: HerbGrade, n: number): void {
      const amount = positiveAmount(n)
      if (amount === null) return
      const g = isHerbGrade(grade) ? grade : currentHerbGrade()
      herbByGrade.value[g] = Math.max(0, Math.floor(herbByGrade.value[g] + amount))
    }

    function hasHerb(grade: HerbGrade, n: number): boolean {
      return herbByGrade.value[grade] >= n
    }

    function spendHerb(grade: HerbGrade, n: number): boolean {
      if (!isHerbGrade(grade)) return false
      const amount = spendAmount(n)
      if (amount === null) return false
      if (herbByGrade.value[grade] < amount) return false
      herbByGrade.value[grade] -= amount
      return true
    }

    /** 天道熔炉可熔的灵草总和(仙品起);凡/灵品草永不入炉 */
    const herbMeltable = computed(() =>
      HERB_GRADES.filter(g => g >= FURNACE_HERB_MIN_GRADE).reduce((sum, g) => sum + (herbByGrade.value[g] ?? 0), 0)
    )

    /** 跨品实扣仙品+灵草 n 株,自低品起扣;须与 herbMeltable 同判据 */
    function spendHerbMeltable(n: number): boolean {
      if (!Number.isFinite(n) || n < 1) return false
      const need = Math.floor(n)
      // 原子:不足则一枚不动,与其余 spend 同契约
      if (herbMeltable.value < need) return false
      const acc = herbByGrade.value
      let rest = need
      for (const g of HERB_GRADES) {
        if (g < FURNACE_HERB_MIN_GRADE) continue
        const take = Math.min(rest, acc[g] ?? 0)
        acc[g] = Math.max(0, (acc[g] ?? 0) - take)
        rest -= take
        if (rest <= 0) return true
      }
      return rest <= 0
    }

    /** 转世清零 */
    function resetHerbs(): void {
      herbByGrade.value = emptyHerbMap()
    }

    function addSmall(id: SmallResourceId, n: number): void {
      const amount = positiveAmount(n)
      if (amount === null) return
      if (id === 'herb') {
        addHerb(currentHerbGrade(), amount)
        return
      }
      const r = smallRef(id)
      if (!r) return
      r.value = Math.max(0, Math.floor(r.value + amount))
    }

    function spendSmall(id: SmallResourceId, n: number): boolean {
      const amount = spendAmount(n)
      if (amount === null) return false
      if (id === 'herb') return spendHerb(currentHerbGrade(), amount)
      const r = smallRef(id)
      if (!r || r.value < amount) return false
      r.value -= amount
      return true
    }

    function hasSmall(id: SmallResourceId, n: number): boolean {
      if (id === 'herb') return hasHerb(currentHerbGrade(), n)
      const r = smallRef(id)
      return !!r && r.value >= n
    }

    function setQi(v: number, cap: number): void {
      // 可积余到标称容量的 QI_BANK_MULT 倍;标称容量是灵气充盈加成、突破耗时的基准,不是硬顶
      qi.value = Math.max(0, Math.min(cap * QI_BANK_MULT, v))
    }

    /**
     * 存档修复:重建大数,负数/非有限值夹回 0(与 settings.sanitize 同判据)。
     *
     * 灵石必须经 asBoundedGNum 而不是 gn():gn 只规范化尾数、**不限指数**,
     * 坏档写 `{ m: 1, e: 1000000000 }` 会被原样收下,界面随即显示
     * 「1.00e1000000000」这种非法数字(saveShape 头注释点的就是这个坑)。
     */
    function sanitize(): void {
      const stone = asBoundedGNum(spiritStone.value)
      spiritStone.value = stone.m < 0 ? gnZero() : stone
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
