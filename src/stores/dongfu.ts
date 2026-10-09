/** 洞府状态 —— 建筑等级与产出 / 灵脉投资 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BuildingId, StatMods } from '@/types'
import type { VeinId } from '@/data/veins'
import { persistConfig } from '@/utils/storage'
import { BUILDINGS, buildingDef, ARRAY_QI_CAP_PER_LEVEL, BEAST_EFFECT_PER_LEVEL } from '@/data/buildings'
import { INSIGHT_DISCOUNT_PER_POINT, VEINS } from '@/data/veins'
import {
  FIELD_HERB_PER_HOUR,
  FIELD_ORE_PER_HOUR,
  FORGE_LEVEL_PER_CAP,
  LIBRARY_WUDAO_PER_HOUR,
  OFFLINE_CAP_HOURS
} from '@/data/constants'
import { mergeMods } from '@/core/statsCalc'
import { usePlayerStore } from '@/stores/player'
import { herbGradeOfMajor } from '@/data/herbGrades'
import { useResourcesStore } from './resources'

export const useDongfuStore = defineStore(
  'dongfu',
  () => {
    const levels = ref<Record<BuildingId, number>>({
      mansion: 0,
      array: 0,
      alchemy: 0,
      forge: 0,
      field: 0,
      library: 0,
      beast: 0
    })
    /** 产出小数累积器 */
    const frac = ref({ herb: 0, ore: 0, wudao: 0 })
    /** Phase 30.3 灵脉:主脉方向 + 各脉已投点数 */
    const veinMain = ref<VeinId | null>(null)
    const veinPoints = ref<Record<VeinId, number>>({ gather: 0, craft: 0, alchemy: 0, insight: 0 })

    const buildingMods = computed<StatMods>(() => {
      const sources: StatMods[] = []
      for (const def of BUILDINGS) {
        const lv = levels.value[def.id] ?? 0
        if (lv > 0 && def.mods) sources.push(def.mods(lv))
      }
      return mergeMods(sources)
    })

    /** 灵脉属性加成(悟道脉走参悟折扣,不入 mods) */
    const veinMods = computed<StatMods>(() => {
      const out: StatMods = {}
      for (const def of VEINS) {
        const pts = veinPoints.value[def.id] ?? 0
        if (pts <= 0) continue
        for (const k in def.perPoint) {
          const key = k as keyof StatMods
          out[key] = (out[key] ?? 0) + (def.perPoint[key] ?? 0) * pts
        }
      }
      return out
    })

    /** 悟道脉参悟折扣(0~) */
    const insightDiscount = computed(() => (veinPoints.value.insight ?? 0) * INSIGHT_DISCOUNT_PER_POINT)

    /** 灵脉已投总点数 */
    const veinTotal = computed(() => Object.values(veinPoints.value).reduce((a, b) => a + b, 0))

    const offlineCapHours = computed(() => OFFLINE_CAP_HOURS[Math.min(levels.value.mansion, OFFLINE_CAP_HOURS.length - 1)]!)
    /** 洞府等级限制其余建筑上限 */
    const buildingLevelCap = computed(() => (levels.value.mansion + 1) * 5)
    /** 建筑实际可达上限:洞府全局闸门与自身品类上限取小(洞府自身不受自己闸门所限) */
    function buildingCap(id: BuildingId): number {
      const def = buildingDef(id)
      if (id === 'mansion' || !def) return def?.maxLevel ?? 0
      return Math.min(def.maxLevel, buildingLevelCap.value)
    }
    const subGongfaSlots = computed(() => 1 + Math.floor(levels.value.library / 3))
    const alchemyLevel = computed(() => levels.value.alchemy)
    // 炼器台每 FORGE_LEVEL_PER_CAP 级提高强化上限 1(此前把 2 写死在业务代码里)
    const forgeCapBonus = computed(() => Math.floor(levels.value.forge / FORGE_LEVEL_PER_CAP))
    const qiCapMult = computed(() => 1 + levels.value.array * ARRAY_QI_CAP_PER_LEVEL)
    const beastMult = computed(() => 1 + levels.value.beast * BEAST_EFFECT_PER_LEVEL)

    function setLevel(id: BuildingId, lv: number): void {
      levels.value = { ...levels.value, [id]: lv }
    }

    /**
     * 存档修复:等级/产出小数/灵脉点数全部收敛为合法值。
     * 损坏的 levels.mansion 会让 offlineCapHours 变 NaN,离线收益全线 NaN,
     * 这是持久化收益来源里唯一没做 sanitize 的一处
     */
    function sanitize(): void {
      const nextLevels = { ...levels.value }
      for (const def of BUILDINGS) {
        const cur = nextLevels[def.id]
        if (cur === undefined || !Number.isFinite(cur) || cur < 0) nextLevels[def.id] = 0
        else nextLevels[def.id] = Math.min(Math.floor(cur), def.maxLevel)
      }
      levels.value = nextLevels
      const nextFrac = { ...frac.value }
      for (const key of Object.keys(nextFrac) as (keyof typeof frac.value)[]) {
        if (!Number.isFinite(nextFrac[key])) nextFrac[key] = 0
      }
      frac.value = nextFrac
      const nextVein = { ...veinPoints.value }
      for (const id of Object.keys(nextVein) as VeinId[]) {
        if (!Number.isFinite(nextVein[id]) || nextVein[id] < 0) nextVein[id] = 0
      }
      veinPoints.value = nextVein
    }

    /** 灵脉投点(校验由 veinService 负责) */
    function addVeinPoint(id: VeinId, n: number): void {
      veinPoints.value = { ...veinPoints.value, [id]: (veinPoints.value[id] ?? 0) + n }
    }

    function setVeinMain(id: VeinId): void {
      veinMain.value = id
    }

    /**
     * 转世:洞府与地脉都是「外物」,随皮囊一同散去 —— 建筑归零、灵脉清零。
     * 留下的只有认知与宿慧(见 core/reincarnation 的继承清单)。
     */
    function resetForRebirth(): void {
      const nextLevels = { ...levels.value }
      for (const def of BUILDINGS) nextLevels[def.id] = 0
      levels.value = nextLevels
      frac.value = { herb: 0, ore: 0, wudao: 0 }
      veinMain.value = null
      veinPoints.value = { gather: 0, craft: 0, alchemy: 0, insight: 0 }
    }

    /** 建筑产出(灵田/藏经阁),按秒推进 */
    function produce(dtSec: number): void {
      const resources = useResourcesStore()
      const player = usePlayerStore()
      const fieldLv = levels.value.field
      const libLv = levels.value.library
      if (fieldLv > 0) {
        frac.value.herb += (fieldLv * FIELD_HERB_PER_HOUR * dtSec) / 3600
        frac.value.ore += (fieldLv * FIELD_ORE_PER_HOUR * dtSec) / 3600
      }
      if (libLv > 0) {
        frac.value.wudao += (libLv * LIBRARY_WUDAO_PER_HOUR * dtSec) / 3600
      }
      for (const key of ['herb', 'ore', 'wudao'] as const) {
        const whole = Math.floor(frac.value[key])
        if (whole >= 1) {
          frac.value[key] -= whole
          /**
           * 灵田 = 当前品阶的稳定水龙头。区域采集按「地界」给品(回头刷低境只给低品),
           * 唯独灵田恒定喂「玩家当前大境界品阶」—— 保证升境后当前境界方子要的那一品
           * 永远有稳定来源、不至于断丹。与坊市买 / 道童采 / 事件普发(全走当前品)同口径,
           * 与区域按地界给品互补。ore/wudao 两行不涉品阶,维持原样。
           */
          if (key === 'herb') resources.addHerb(herbGradeOfMajor(player.major), whole)
          else resources.addSmall(key, whole)
        }
      }
    }

    return {
      levels,
      frac,
      veinMain,
      veinPoints,
      buildingMods,
      veinMods,
      insightDiscount,
      veinTotal,
      offlineCapHours,
      buildingLevelCap,
      buildingCap,
      subGongfaSlots,
      alchemyLevel,
      forgeCapBonus,
      qiCapMult,
      beastMult,
      setLevel,
      addVeinPoint,
      setVeinMain,
      resetForRebirth,
      produce,
      sanitize
    }
  },
  { persist: persistConfig('dongfu') }
)
