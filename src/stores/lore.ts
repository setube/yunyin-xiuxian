/**
 * 所知状态(Phase 32.3)—— 认知与技艺
 *
 * 这个 store 存的不是"解锁了什么",而是"懂到什么程度"。
 * 认知度与熟练度都是连续值,直接参与生产结算(见 core/craftability.ts),
 * 而不是先攒够再一次性放开某个开关。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { LORE_MAX } from '@/data/materials'
import { SKILL_IDS, skillLevelFromExp, type SkillId } from '@/data/crafting'
import { persistConfig } from '@/utils/storage'

/** 敌人认知层上限:0 未识 / 1 眼熟 / 2 知路数 / 3 洞悉 */
export const ENEMY_LORE_MAX = 3

export const ENEMY_LORE_STAGE_NAMES = ['未识', '眼熟', '知其路数', '洞悉'] as const

function emptySkillExp(): Record<SkillId, number> {
  return Object.fromEntries(SKILL_IDS.map(id => [id, 0])) as Record<SkillId, number>
}

export const useLoreStore = defineStore(
  'lore',
  () => {
    /** 灵材认知层 0~3 */
    const materialLore = ref<Record<string, number>>({})
    /** 灵材照面次数 —— 认知推进的底料,见得多才可能认出来 */
    const materialSeen = ref<Record<string, number>>({})
    /** 丹方掌握度 0~1 */
    const recipeLore = ref<Record<string, number>>({})
    /** 图纸掌握度 0~1(炼器,Phase 32.6 接入打造) */
    const blueprintLore = ref<Record<string, number>>({})
    /** 技艺累积经验 */
    const skillExp = ref<Record<SkillId, number>>(emptySkillExp())
    /** 敌人认知层 0~3(Phase 32.5)—— 交过手才谈得上认识 */
    const enemyLore = ref<Record<string, number>>({})
    /** 与某敌交手的次数 */
    const enemySeen = ref<Record<string, number>>({})
    /** 藏经阁被动钻研的小数累积器 */
    const studyFrac = ref(0)
    /** 入门丹方是否已播种(旧存档首次进入本体系时补发,幂等) */
    const seeded = ref(false)

    /** 已辨识(认知层 ≥1)的灵材数 */
    const knownMaterialCount = computed(() => Object.values(materialLore.value).filter(v => v >= 1).length)
    /** 已通晓用法(认知层 = 上限)的灵材数 */
    const masteredMaterialCount = computed(() => Object.values(materialLore.value).filter(v => v >= LORE_MAX).length)
    /** 已知(掌握度 >0)的丹方数 */
    const knownRecipeCount = computed(() => Object.values(recipeLore.value).filter(v => v > 0).length)
    /** 已通晓(掌握度满)的丹方数 */
    const masteredRecipeCount = computed(() => Object.values(recipeLore.value).filter(v => v >= 1).length)
    /** 已洞悉(认知层 = 上限)的敌人种数 */
    const masteredEnemyCount = computed(() => Object.values(enemyLore.value).filter(v => v >= ENEMY_LORE_MAX).length)

    function loreOf(id: string): number {
      return materialLore.value[id] ?? 0
    }

    function seenOf(id: string): number {
      return materialSeen.value[id] ?? 0
    }

    function markSeen(id: string, n = 1): void {
      materialSeen.value = { ...materialSeen.value, [id]: seenOf(id) + n }
    }

    /** 推进灵材认知层;返回是否真的进了一层 */
    function advanceLore(id: string, to: number): boolean {
      const cur = loreOf(id)
      const next = Math.min(LORE_MAX, Math.max(cur, Math.floor(to)))
      if (next <= cur) return false
      materialLore.value = { ...materialLore.value, [id]: next }
      return true
    }

    function recipeMastery(id: string): number {
      return recipeLore.value[id] ?? 0
    }

    /** 增进丹方掌握度(上限 1);返回增进后的值 */
    function addRecipeMastery(id: string, delta: number): number {
      const next = Math.max(0, Math.min(1, recipeMastery(id) + delta))
      recipeLore.value = { ...recipeLore.value, [id]: next }
      return next
    }

    function blueprintMastery(id: string): number {
      return blueprintLore.value[id] ?? 0
    }

    function addBlueprintMastery(id: string, delta: number): number {
      const next = Math.max(0, Math.min(1, blueprintMastery(id) + delta))
      blueprintLore.value = { ...blueprintLore.value, [id]: next }
      return next
    }

    function expOf(id: SkillId): number {
      return skillExp.value[id] ?? 0
    }

    function skillLevel(id: SkillId): number {
      return skillLevelFromExp(expOf(id))
    }

    function addSkillExp(id: SkillId, n: number): void {
      if (n <= 0) return
      skillExp.value = { ...skillExp.value, [id]: expOf(id) + n }
    }

    function enemyLoreOf(id: string): number {
      return enemyLore.value[id] ?? 0
    }

    function enemySeenOf(id: string): number {
      return enemySeen.value[id] ?? 0
    }

    function markEnemySeen(id: string, n = 1): void {
      enemySeen.value = { ...enemySeen.value, [id]: enemySeenOf(id) + n }
    }

    /** 推进敌人认知层;返回是否真的进了一层 */
    function advanceEnemyLore(id: string, to: number): boolean {
      const cur = enemyLoreOf(id)
      const next = Math.min(ENEMY_LORE_MAX, Math.max(cur, Math.floor(to)))
      if (next <= cur) return false
      enemyLore.value = { ...enemyLore.value, [id]: next }
      return true
    }

    /** 存档修复:补齐新增技艺键、夹紧越界值 */
    function sanitize(): void {
      const fixedExp: Record<string, number> = {}
      for (const id of SKILL_IDS) {
        const v = skillExp.value[id]
        fixedExp[id] = Number.isFinite(v) ? Math.max(0, v as number) : 0
      }
      skillExp.value = fixedExp as Record<SkillId, number>
      const clampMap = (src: Record<string, number>, lo: number, hi: number): Record<string, number> => {
        const out: Record<string, number> = {}
        for (const [k, v] of Object.entries(src)) {
          if (Number.isFinite(v)) out[k] = Math.max(lo, Math.min(hi, v))
        }
        return out
      }
      materialLore.value = clampMap(materialLore.value, 0, LORE_MAX)
      materialSeen.value = clampMap(materialSeen.value, 0, Number.MAX_SAFE_INTEGER)
      recipeLore.value = clampMap(recipeLore.value, 0, 1)
      blueprintLore.value = clampMap(blueprintLore.value, 0, 1)
      // 旧存档没有这两张表,?? {} 保证补齐而非留 undefined
      enemyLore.value = clampMap(enemyLore.value ?? {}, 0, ENEMY_LORE_MAX)
      enemySeen.value = clampMap(enemySeen.value ?? {}, 0, Number.MAX_SAFE_INTEGER)
      if (!Number.isFinite(studyFrac.value)) studyFrac.value = 0
    }

    return {
      materialLore,
      materialSeen,
      recipeLore,
      blueprintLore,
      skillExp,
      enemyLore,
      enemySeen,
      studyFrac,
      seeded,
      knownMaterialCount,
      masteredMaterialCount,
      knownRecipeCount,
      masteredRecipeCount,
      masteredEnemyCount,
      loreOf,
      seenOf,
      markSeen,
      advanceLore,
      recipeMastery,
      addRecipeMastery,
      blueprintMastery,
      addBlueprintMastery,
      expOf,
      skillLevel,
      addSkillExp,
      enemyLoreOf,
      enemySeenOf,
      markEnemySeen,
      advanceEnemyLore,
      sanitize
    }
  },
  { persist: persistConfig('lore') }
)
