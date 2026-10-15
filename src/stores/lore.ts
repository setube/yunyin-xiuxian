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
import { QUALITIES } from '@/data/qualities'

/** 敌人认知层上限:0 未识 / 1 眼熟 / 2 知路数 / 3 洞悉 */
export const ENEMY_LORE_MAX = 3

/** 品质阶上限:从数据派生的真实最大值(别写死 8,哪天加了高阶会自动跟上) */
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
    /** 灵材照面次数 —— 认知推进的底料,见得多才可能认出来 */
    const materialSeen = ref<Record<string, number>>({})
    /** 丹方掌握度 0~1 */
    const recipeLore = ref<Record<string, number>>({})
    /**
     * 图纸掌握度 0~1 —— 炼器道的预留字段,眼下尚无内容也无获取路径。
     *
     * 别照着丹方的样子给它加消费点:一旦有代码开始读 blueprintMastery,
     * 而 studyBlueprint 仍无调用点,就又是一条"看得见拿不到"的死内容。
     * contentReachabilityAudit.spec.ts 钉着这一条,两头要接一起接。
     */
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
    /**
     * 装备见闻:模板 id → 生平见过的最好一件(最高品质 rank 与最高层级)。
     *
     * 图鉴此前只有「收没收录」两态,而装备的深度本来就存在别处 —— 只是没人记。
     * 记的是**见过的最好一件**,不是当前行囊:化尘了、分解了、被挤掉了,
     * 见过就是见过(与灵材的「照面次数」同一性质,故也放在这个 store 里)。
     */
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

    /** 该模板见过的最高成色(没见过返回 undefined);u = 是否亲手用过(强化或装备过) */
    function equipSeen(id: string): { q: number; t: number; u: number } | undefined {
      return equipLore.value[id]
    }

    /**
     * 记下「亲手用过这一件」——强化过或装备过都算。
     *
     * 与「见过什么成色」分开记:成色靠运气(要撞上天品),而用不用它由玩家自己决定。
     * 图鉴的收录深度因此多了一档**可推进**的台阶(见 ui/codex 的装备梯子)。
     */
    function noteEquipUsed(templateId: string): void {
      const cur = equipLore.value[templateId]
      if (cur?.u) return
      equipLore.value = {
        ...equipLore.value,
        [templateId]: { q: cur?.q ?? 0, t: cur?.t ?? 0, u: 1 }
      }
    }

    /**
     * 记下一件装备的成色:品质取其高,层级取其高,各记各的。
     *
     * 不分先后地一起比(「这一件整体更好」)是没有定义的 —— 15 阶天品与 20 阶良品
     * 谁更「好」要看用途。故两个维度各自刷新,谁也不冒充谁。
     */
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
      /**
       * 先补形再夹值:存档可能缺栏(旧版本)或被写坏。
       * 此前只有 enemyLore/enemySeen 用了 `?? {}`,其余几张表直接进 Object.entries ——
       * 一旦缺栏就是 "Cannot convert undefined or null to object",读档即白屏。
       * (见 storeResilience.spec:逐个字段灌 undefined 的坏档韧性红线)
       */
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
      // 装备见闻:每个条目是 { q, t } 两个数,形状烂掉就整条丢掉
      const seenFixed: Record<string, { q: number; t: number; u: number }> = {}
      for (const [id, v] of Object.entries(equipLore.value ?? {})) {
        const q = (v as { q?: unknown })?.q
        const t = (v as { t?: unknown })?.t
        // 只认真正的数字:Number(null) 是 0、"9" 会悄悄转成 9 —— 那会让坏条目冒充「见过一件凡品·0 阶」
        if (typeof q !== 'number' || typeof t !== 'number' || !Number.isFinite(q) || !Number.isFinite(t)) continue
        const u = (v as { u?: unknown })?.u
        seenFixed[id] = {
          q: Math.max(0, Math.min(MAX_QUALITY_RANK, Math.floor(q))),
          t: Math.max(0, Math.floor(t)),
          u: u === 1 ? 1 : 0
        }
      }
      equipLore.value = seenFixed
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
