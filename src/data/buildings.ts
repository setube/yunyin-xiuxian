/** 洞府建筑 —— 7 座,长线成长 */
import type { BuildingDef, BuildingId, StatMods } from '@/types'
import { FIELD_HERB_PER_HOUR, FIELD_ORE_PER_HOUR, FORGE_LEVEL_PER_CAP, LIBRARY_WUDAO_PER_HOUR, OFFLINE_CAP_HOURS } from './constants'
import { HERB_GRADE_SHORT, fieldGradeCap } from './herbGrades'

/** 聚灵阵每级抬高的灵气上限(乘在境界容量上,不进 StatMods)。文案与 dongfu.qiCapMult 都读它。 */
export const ARRAY_QI_CAP_PER_LEVEL = 0.08
/** 灵兽园每级放大灵兽词条。文案与 dongfu.beastMult 都读它。 */
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
    effectText: lv => `离线收益上限 ${OFFLINE_CAP_HOURS[Math.min(lv, OFFLINE_CAP_HOURS.length - 1)]} 小时;洞府每升一级其余建筑等级上限 +5,各建筑另有品类上限`,
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
    // Phase 32.3: recipes are not gated by furnace level. The stove only
    // adds alchemyYield (second-pill chance); success still comes from lore.
    effectText: () => '只加双枚成丹的概率,成与不成看你懂多少',
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
    // 钻研丹方是藏经阁的第三桩职能(见 core/loreService.ts studyTick),不写出来玩家无从得知
    effectText: lv =>
      `每小时产悟道点 ${(lv * LIBRARY_WUDAO_PER_HOUR).toFixed(1)},辅修栏 ${1 + Math.floor(lv / 3)} 个;日夜翻检,读熟手上丹方,进而翻出新方`,
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
