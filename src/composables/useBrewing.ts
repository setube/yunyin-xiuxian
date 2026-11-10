import { computed, ref } from 'vue'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useLoreStore } from '@/stores/lore'
import { useCultivationStore } from '@/stores/cultivation'
import { useNow } from '@/composables/useNow'
import { pillDef } from '@/data/pills'
import { herbGradeOfMajor, type HerbGrade } from '@/data/herbGrades'
import { DAO_NAMES, SKILLS, skillStageName } from '@/data/crafting'
import { craftGuaranteeRemaining } from '@/core/heritageEffects'
import { buffOverflowOf } from '@/core/buffCap'
import { availableRecipes, craftBatchPlan, craftPillBatch, pillCraftCost } from '@/core/pillService'
import { craftability, type Craftability } from '@/core/craftability'
import { studyEta } from '@/core/loreService'
import { formatDuration } from '@/utils/format'
import type { GNum, PillDef } from '@/types'

/** 开炉炼丹的共用账本:页面入口卡与开炉弹窗(BrewingDialog)同读,recipes 只算这一份 */
export function useBrewing() {
  const resources = useResourcesStore()
  const player = usePlayerStore()
  const inventory = useInventoryStore()
  const lore = useLoreStore()
  const cultivation = useCultivationStore()
  // 药力状态读游戏钟:到期自行复位,暂停时与结算一起冻住
  const now = useNow()

  const herbGrade = computed<HerbGrade>(() => herbGradeOfMajor(player.major))

  /**
   * 丹方账的**静态**部分:方子、价签、把握、批量计划、存量。
   *
   * 这一段不读时钟 —— 它由 lore / player / resources / inventory 决定,换一个字才该重算。
   * 从前它和 `overflow` 写在同一个 computed 里,而 `overflow` 读 `now.value`(每秒变),
   * 于是整条链每秒重跑一次:实测 52 方的 craftability + craftBatchPlan 合计 **3.74ms/秒**,
   * 而其中真正随时钟走的只有 `buffOverflowOf` 那一段,合计 **0.018ms/秒** —— 差 200 倍。
   * 背包页(装备/材料/法宝签不读丹方)也照付这笔钱。
   */
  const recipeBase = computed(() =>
    availableRecipes()
      .map(id => {
        const def = pillDef(id)
        const cost = pillCraftCost(id)
        const able = craftability(id)
        const plan = craftBatchPlan(id)
        if (!def || !cost || !able) return null
        return {
          def,
          cost,
          able,
          plan,
          /** 行囊里已存几枚;与丹匣同读 inventory.pills */
          stock: inventory.pills[id] ?? 0
        }
      })
      .filter(
        (
          x
        ): x is {
          def: PillDef
          cost: { herb: number; stone: GNum; grade: HerbGrade }
          able: Craftability
          plan: ReturnType<typeof craftBatchPlan>
          stock: number
        } => x !== null
      )
  )

  const recipes = computed(() =>
    recipeBase.value
      .map(row => ({
        ...row,
        // 判据与丹匣、修行速服同尺同钟:只有这一项随时钟走
        overflow:
          row.def.kind === 'buff' && row.def.buffId
            ? buffOverflowOf(cultivation.buffs, row.def.buffId, now.value)
            : null
      }))
      // 能开炉的置顶,其余按阶位
      .sort((a, b) => {
        const ca = a.plan.rounds > 0 ? 1 : 0
        const cb = b.plan.rounds > 0 ? 1 : 0
        return cb - ca || a.able.rank - b.able.rank
      })
  )

  /** 浴火丹心(宿命传承):本世前几炉必成(craftPill 强成 100%),把握栏须如实反映 */
  const craftGuarantee = computed(() =>
    craftGuaranteeRemaining(player.reincarnation.heritage, player.reincarnation.heritageUses)
  )

  const skillRows = computed(() =>
    SKILLS.map(s => {
      const lv = lore.skillLevel(s.id)
      return { id: s.id, daoName: DAO_NAMES[s.dao], name: s.name, stage: skillStageName(lv), desc: s.desc }
    })
  )

  /** 藏经阁翻检概况(开炉页顶部一行);读 core/loreService.studyEta,与 studyTick 同一优先序 */
  const studyLine = computed(() => {
    const eta = studyEta()
    if (!eta) return ''
    if (!eta.readingId && !eta.nextIsNew) return '藏经阁 · 暂无新方'
    if (eta.readingId) {
      const name = pillDef(eta.readingId)?.name ?? '某方'
      return `藏经阁 · 研读「${name}」· 约 ${formatDuration(eta.nextInSec)}`
    }
    return `藏经阁 · 翻检新方 · 约 ${formatDuration(eta.nextInSec)}`
  })

  /** 把握度配色;色名只能用主题里有的 token(palette.spec 守着) */
  function rateClass(rate: number): string {
    if (rate >= 0.7) return 'text-jade'
    if (rate >= 0.3) return 'text-gold-ink'
    return 'text-cinnabar'
  }

  /** 「炼满」二步确认态 */
  const pillFullId = ref<string | null>(null)
  function runCraftFull(id: string, rounds: number): void {
    pillFullId.value = null
    craftPillBatch(id, rounds)
  }

  /**
   * 丹药签的圆点:「有一味能开炉」。
   *
   * 它只读 `plan.rounds`(静态段),不读药力状态 —— 背包页的四个签都在挂载时算一次,
   * 走 `recipes` 会让装备/材料/法宝三个签也陪着时钟一起重算。
   */
  const anyCraftable = computed(() => recipeBase.value.some(r => r.plan.rounds > 0))

  return {
    resources,
    herbGrade,
    recipes,
    anyCraftable,
    craftGuarantee,
    skillRows,
    studyLine,
    rateClass,
    pillFullId,
    runCraftFull
  }
}
