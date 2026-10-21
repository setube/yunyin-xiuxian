import { computed, ref } from 'vue'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useLoreStore } from '@/stores/lore'
import { pillDef } from '@/data/pills'
import { herbGradeOfMajor, type HerbGrade } from '@/data/herbGrades'
import { DAO_NAMES, SKILLS, skillStageName } from '@/data/crafting'
import { craftGuaranteeRemaining } from '@/core/heritageEffects'
import { availableRecipes, craftBatchPlan, craftPillBatch, pillCraftCost } from '@/core/pillService'
import { craftability, type Craftability } from '@/core/craftability'
import { studyEta } from '@/core/loreService'
import { formatDuration } from '@/utils/format'
import type { GNum, PillDef } from '@/types'

/**
 * 开炉炼丹的共用账本 —— 页面入口卡与开炉弹窗(BrewingDialog)同源调用。
 *
 * 入口卡要报「已知丹方 N 种 · 当前品灵草×M」,弹窗要逐方列出代价、把握、可炼炉数,
 * 两处若各算一份 recipes,迟早一条改了一处没改(项目「不做两本账」纪律)。
 * 内部读 store 照视图层原样:pinia 单例,与各调用方拿到的是同一个账。
 */
export function useBrewing() {
  const resources = useResourcesStore()
  const player = usePlayerStore()
  const inventory = useInventoryStore()
  const lore = useLoreStore()

  const herbGrade = computed<HerbGrade>(() => herbGradeOfMajor(player.major))

  const recipes = computed(() =>
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
          /** 行囊里已存几枚 —— 与丹匣同一份账(inventory.pills),不另数一遍 */
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
        } =>
          x !== null
      )
      // 现在能开炉的置顶,其余再按阶位 —— 进弹窗一眼看见此刻哪味立刻可炼
      .sort((a, b) => {
        const ca = a.plan.rounds > 0 ? 1 : 0
        const cb = b.plan.rounds > 0 ? 1 : 0
        return cb - ca || a.able.rank - b.able.rank
      })
  )

  /** 浴火丹心(宿命传承):本世前几炉必成 —— 把握栏须如实反映(craftPill 真开炉强成 100%) */
  const craftGuarantee = computed(() =>
    craftGuaranteeRemaining(player.reincarnation.heritage, player.reincarnation.heritageUses)
  )

  /** 技艺一览:名(DAO_NAMES 的道名 + 技艺名)、境地(skillStageName)、这项技艺管什么 */
  const skillRows = computed(() =>
    SKILLS.map(s => {
      const lv = lore.skillLevel(s.id)
      return { id: s.id, daoName: DAO_NAMES[s.dao], name: s.name, stage: skillStageName(lv), desc: s.desc }
    })
  )

  /**
   * 藏经阁翻检的当刻概况(开炉页顶部一行)。
   * 读数在 core/loreService.studyEta —— 与 studyTick 同一优先序,界面不另算。
   */
  const studyLine = computed(() => {
    const eta = studyEta()
    if (!eta) return ''
    // 读通了又在手的两态;「够得着的都到手」与「正读某张」是两回事,措辞分开
    if (!eta.readingId && !eta.nextIsNew) return '藏经阁翻检中:够得着的方子都已到手'
    if (eta.readingId) {
      const name = pillDef(eta.readingId)?.name ?? '某方'
      return `藏经阁正研读「${name}」,约 ${formatDuration(eta.nextInSec)} 后读通`
    }
    return `藏经阁翻检中,约 ${formatDuration(eta.nextInSec)} 后翻出一张新方`
  })

  /**
   * 把握度配色:七成以上放心开炉,三成以下是在赌。
   * 色名只能用主题里有的 token —— 此前写的 jade-ink / crimson-ink 不存在,
   * 产物里不生成这两条类,高低两档一直没上色(palette.spec 现有判据守着)。
   */
  function rateClass(rate: number): string {
    if (rate >= 0.7) return 'text-jade'
    if (rate >= 0.3) return 'text-gold-ink'
    return 'text-cinnabar'
  }

  /** 「炼满」二步确认态:谁不按常量的炉数,一眼先交代总账 */
  const pillFullId = ref<string | null>(null)
  function runCraftFull(id: string, rounds: number): void {
    pillFullId.value = null
    craftPillBatch(id, rounds)
  }

  return { resources, herbGrade, recipes, craftGuarantee, skillRows, studyLine, rateClass, pillFullId, runCraftFull }
}
