/** 洞府建筑 —— 7 座 */
import type { BuildingDef, BuildingId, StatMods } from '@/types'
import { EQUIP_MAX_LEVEL_BASE, FIELD_HERB_PER_HOUR, FIELD_ORE_PER_HOUR, FORGE_LEVEL_PER_CAP, LIBRARY_WUDAO_PER_HOUR, OFFLINE_CAP_HOURS } from './constants'
import { HERB_GRADE_SHORT, fieldGradeCap } from './herbGrades'

/** 聚灵阵每级抬高的灵气上限(乘在境界容量上,不进 StatMods);文案与 dongfu.qiCapMult 都读它 */
export const ARRAY_QI_CAP_PER_LEVEL = 0.08
/** 灵兽园每级放大灵兽词条;文案与 dongfu.beastMult 都读它 */
export const BEAST_EFFECT_PER_LEVEL = 0.1

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'mansion',
    name: '洞府',
    desc: '居所即道场。洞府等级决定离线收益上限,并影响其余建筑的等级上限',
    icon: 'home',
    maxLevel: 4,
    unlockRealm: 0,
    costBase: 200,
    costOre: 20,
    effectText: lv => `离线收益上限 ${OFFLINE_CAP_HOURS[Math.min(lv, OFFLINE_CAP_HOURS.length - 1)]} 小时;洞府每升一级其余建筑等级上限 +5`,
    mods: (lv): StatMods => ({ cultivationSpeed: lv * 0.04 })
  },
  {
    id: 'array',
    name: '聚灵阵',
    desc: '汇聚天地灵气,滋养洞府',
    icon: 'wind',
    maxLevel: 20,
    unlockRealm: 0,
    costBase: 60,
    costOre: 6,
    effectText: lv => `灵气上限 +${Math.round(lv * ARRAY_QI_CAP_PER_LEVEL * 100)}%`,
    mods: (lv): StatMods => ({ qiRegen: lv * 0.1, cultivationSpeed: lv * 0.03 })
  },
  {
    id: 'alchemy',
    name: '炼丹炉',
    desc: '开炉炼丹,以药辅道',
    icon: 'flame',
    maxLevel: 10,
    unlockRealm: 0,
    costBase: 100,
    costOre: 10,
    // 丹方不受丹炉等级门槛;丹炉只加 alchemyYield,成功率来自认知
    effectText: () => '只加双枚成丹概率',
    mods: (lv): StatMods => ({ alchemyYield: lv * 0.05 })
  },
  {
    id: 'forge',
    name: '炼器台',
    desc: '锻造强化,点石成金',
    icon: 'hammer',
    maxLevel: 10,
    unlockRealm: 1,
    costBase: 150,
    costOre: 15,
    effectText: lv => `强化上限 +${Math.floor(lv / FORGE_LEVEL_PER_CAP)}`,
    mods: (lv): StatMods => ({ forgeDiscount: lv * 0.04 })
  },
  {
    id: 'field',
    name: '灵田',
    desc: '春种一粒粟,秋收万颗灵',
    icon: 'sprout',
    maxLevel: 15,
    unlockRealm: 0,
    costBase: 80,
    costOre: 8,
    effectText: lv =>
      `每小时产灵草 ${(lv * FIELD_HERB_PER_HOUR).toFixed(0)} 株(当前境品或高一档,田满可种${HERB_GRADE_SHORT[fieldGradeCap(lv)]})、玄铁 ${(lv * FIELD_ORE_PER_HOUR).toFixed(1)} 块`
  },
  {
    id: 'library',
    name: '藏经阁',
    desc: '藏尽天下道藏,参悟其中真意',
    icon: 'book',
    maxLevel: 12,
    unlockRealm: 1,
    costBase: 120,
    costOre: 12,
    // 钻研丹方是藏经阁的第三桩职能(见 core/loreService.ts studyTick),须写进文案
    effectText: lv =>
      `每小时产悟道点 ${(lv * LIBRARY_WUDAO_PER_HOUR).toFixed(1)},辅修栏 ${1 + Math.floor(lv / 3)} 个;读熟丹方,翻出新方`,
    mods: (lv): StatMods => ({ expGain: lv * 0.03 })
  },
  {
    id: 'beast',
    name: '灵兽园',
    desc: '驯养灵兽,与道为伴',
    icon: 'paw',
    maxLevel: 8,
    unlockRealm: 2,
    costBase: 300,
    costOre: 30,
    effectText: lv => `可驯养灵兽,灵兽属性效果 +${Math.round(lv * BEAST_EFFECT_PER_LEVEL * 100)}%`
  }
]

const BY_ID = new Map(BUILDINGS.map(x => [x.id, x]))

export function buildingDef(id: BuildingId): BuildingDef | undefined {
  return BY_ID.get(id)
}

/**
 * 存档修形时装备等级的上界:基础上限 + 满级炼器台加成。
 * 与 core/forge.equipLevelCap 同一算式,但刻意不 import 它(core 会反向 import store);
 * 修形只求「比合法值宽、比坏值严」,实际执行侧仍以 equipLevelCap 为准。
 */
export const EQUIP_LEVEL_SANITIZE_CAP =
  EQUIP_MAX_LEVEL_BASE + Math.floor((BY_ID.get('forge')?.maxLevel ?? 0) / FORGE_LEVEL_PER_CAP)
