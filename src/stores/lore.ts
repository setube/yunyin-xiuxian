/** 所知状态 —— 认知与技艺。认知度/熟练度为连续值,参与生产结算(见 core/craftability.ts) */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { LORE_MAX, materialDef } from '@/data/materials'
import { SKILL_IDS, skillLevelFromExp, type SkillId } from '@/data/crafting'
import { pillDef } from '@/data/pills'
import { enemyDef } from '@/data/enemies'
import { persistConfig } from '@/utils/storage'
import { QUALITIES } from '@/data/qualities'

/** 敌人认知层上限:0 未识 / 1 眼熟 / 2 知路数 / 3 洞悉 */
export const ENEMY_LORE_MAX = 3

// 从数据派生,勿写死
const MAX_QUALITY_RANK = Math.max(...QUALITIES.map(q => q.rank))

export const ENEMY_LORE_STAGE_NAMES = ['未识', '眼熟', '知其路数', '洞悉'] as const

function emptySkillExp(): Record<SkillId, number> {
  return Object.fromEntries(SKILL_IDS.map(id => [id, 0])) as Record<SkillId, number>
}

export const useLoreStore = defineStore(
  'lore',
  () => {
    /** 灵材认知层 0~3 */
    const materialLore = ref<Record<string, number>>({})
    /** 灵材照面次数 —— 认知推进的底料 */
    const materialSeen = ref<Record<string, number>>({})
    /** 丹方掌握度 0~1 */
    const recipeLore = ref<Record<string, number>>({})
    /** 图纸掌握度 0~1 —— 炼器道预留字段,尚无获取路径;读 blueprintMastery 须与 studyBlueprint 调用点一起接(contentReachabilityAudit.spec.ts 钉着) */
    const blueprintLore = ref<Record<string, number>>({})
    /** 技艺累积经验 */
    const skillExp = ref<Record<SkillId, number>>(emptySkillExp())
    /** 敌人认知层 0~3 */
    const enemyLore = ref<Record<string, number>>({})
    /** 与某敌交手的次数 */
    const enemySeen = ref<Record<string, number>>({})
    /** 藏经阁被动钻研的小数累积器 */
    const studyFrac = ref(0)
    /** 入门丹方是否已播种(旧存档首次进入本体系时补发,幂等) */
    const seeded = ref(false)
    /** 装备见闻:模板 id → 见过的最高品质 rank 与最高层级;化尘/分解/挤掉不清除 */
    const equipLore = ref<Record<string, { q: number; t: number; u: number }>>({})

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

    /** 该模板见过的最高成色;u = 是否亲手用过(强化或装备过) */
    function equipSeen(id: string): { q: number; t: number; u: number } | undefined {
      return equipLore.value[id]
    }

    /** 记下「亲手用过」:强化或装备过都算 */
    function noteEquipUsed(templateId: string): void {
      const cur = equipLore.value[templateId]
      if (cur?.u) return
      equipLore.value = {
        ...equipLore.value,
        [templateId]: { q: cur?.q ?? 0, t: cur?.t ?? 0, u: 1 }
      }
    }

    /** 记下一件装备的成色:品质、层级各取其高,各自刷新 */
    function noteEquipSeen(templateId: string, qualityRank: number, tier: number): void {
      const cur = equipLore.value[templateId]
      const q = Math.max(0, Math.min(MAX_QUALITY_RANK, Math.floor(qualityRank || 0)))
      const t = Math.max(0, Math.floor(tier || 0))
      if (cur && cur.q >= q && cur.t >= t) return
      equipLore.value = {
        ...equipLore.value,
        [templateId]: { q: Math.max(cur?.q ?? 0, q), t: Math.max(cur?.t ?? 0, t), u: cur?.u ?? 0 }
      }
    }

    function seenOf(id: string): number {
      return materialSeen.value[id] ?? 0
    }

    function markSeen(id: string, n = 1): void {
      if (!Number.isFinite(n) || n <= 0) return
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
      if (!Number.isFinite(delta) || delta <= 0) return recipeMastery(id)
      const next = Math.max(0, Math.min(1, recipeMastery(id) + delta))
      recipeLore.value = { ...recipeLore.value, [id]: next }
      return next
    }

    function blueprintMastery(id: string): number {
      return blueprintLore.value[id] ?? 0
    }

    function addBlueprintMastery(id: string, delta: number): number {
      if (!Number.isFinite(delta) || delta <= 0) return blueprintMastery(id)
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
      if (!Number.isFinite(n) || n <= 0) return
      skillExp.value = { ...skillExp.value, [id]: expOf(id) + n }
    }

    function enemyLoreOf(id: string): number {
      return enemyLore.value[id] ?? 0
    }

    function enemySeenOf(id: string): number {
      return enemySeen.value[id] ?? 0
    }

    function markEnemySeen(id: string, n = 1): void {
      if (!Number.isFinite(n) || n <= 0) return
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
      // 先补形再夹值:缺栏直接进 Object.entries,读档即白屏(storeResilience.spec 钉着)
      if (!skillExp.value || typeof skillExp.value !== 'object') skillExp.value = emptySkillExp()
      if (!materialLore.value || typeof materialLore.value !== 'object') materialLore.value = {}
      if (!materialSeen.value || typeof materialSeen.value !== 'object') materialSeen.value = {}
      if (!recipeLore.value || typeof recipeLore.value !== 'object') recipeLore.value = {}
      if (!blueprintLore.value || typeof blueprintLore.value !== 'object') blueprintLore.value = {}
      const fixedExp: Record<string, number> = {}
      for (const id of SKILL_IDS) {
        const v = skillExp.value[id]
        fixedExp[id] = Number.isFinite(v) ? Math.max(0, v as number) : 0
      }
      skillExp.value = fixedExp as Record<SkillId, number>
      // 按 id 认对象,认不出的清掉:图鉴「已识 N 味」与宿慧折算按 Object.values 数条目
      const clampMap = (
        src: Record<string, number>,
        lo: number,
        hi: number,
        known?: (id: string) => boolean
      ): Record<string, number> => {
        const out: Record<string, number> = {}
        for (const [k, v] of Object.entries(src)) {
          if (known && !known(k)) continue
          if (Number.isFinite(v)) out[k] = Math.max(lo, Math.min(hi, v))
        }
        return out
      }
      materialLore.value = clampMap(materialLore.value, 0, LORE_MAX, id => !!materialDef(id))
      // 照面次数不参与计数/展示,只夹值不认 id:旧档改名或版本回退时不抹掉进度
      materialSeen.value = clampMap(materialSeen.value, 0, Number.MAX_SAFE_INTEGER)
      recipeLore.value = clampMap(recipeLore.value, 0, 1, id => !!pillDef(id)?.recipe)
      blueprintLore.value = clampMap(blueprintLore.value, 0, 1)
      // 旧存档没有这两张表
      enemyLore.value = clampMap(enemyLore.value ?? {}, 0, ENEMY_LORE_MAX, id => !!enemyDef(id))
      enemySeen.value = clampMap(enemySeen.value ?? {}, 0, Number.MAX_SAFE_INTEGER)
      // 装备见闻:形状烂掉就整条丢掉
      const seenFixed: Record<string, { q: number; t: number; u: number }> = {}
      for (const [id, v] of Object.entries(equipLore.value ?? {})) {
        const q = (v as { q?: unknown })?.q
        const t = (v as { t?: unknown })?.t
        // 只认真正的数字:Number(null) 是 0、"9" 会转成 9,坏条目会冒充「见过一件凡品·0 阶」
        if (typeof q !== 'number' || typeof t !== 'number' || !Number.isFinite(q) || !Number.isFinite(t)) continue
        const u = (v as { u?: unknown })?.u
        seenFixed[id] = {
          q: Math.max(0, Math.min(MAX_QUALITY_RANK, Math.floor(q))),
          t: Math.max(0, Math.floor(t)),
          u: u === 1 ? 1 : 0
        }
      }
      equipLore.value = seenFixed
      /*
       * 研读进度是 [0,1) 的余数,上界同样要夹:MAX_VALUE 是有限数,过得了 isFinite,
       * 之后每拍只涨一点点,要读满那个值才研读完一条 —— 藏经阁从此不再出新方。
       */
      studyFrac.value = Number.isFinite(studyFrac.value) && studyFrac.value >= 0 && studyFrac.value < 1
        ? studyFrac.value
        : 0
      seeded.value = seeded.value === true
    }

    return {
      materialLore,
      materialSeen,
      recipeLore,
      blueprintLore,
      skillExp,
      enemyLore,
      enemySeen,
      equipLore,
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
      equipSeen,
      noteEquipSeen,
      noteEquipUsed,
      sanitize
    }
  },
  { persist: persistConfig('lore') }
)
