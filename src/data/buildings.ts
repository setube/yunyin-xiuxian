/** 洞府建筑 —— 7 座,长线成长 */
import type { BuildingDef, BuildingId, StatMods } from '@/types'
import { FIELD_HERB_PER_HOUR, FIELD_ORE_PER_HOUR, LIBRARY_WUDAO_PER_HOUR, OFFLINE_CAP_HOURS } from './constants'

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
    effectText: lv => `离线收益上限 ${OFFLINE_CAP_HOURS[Math.min(lv, OFFLINE_CAP_HOURS.length - 1)]} 小时,建筑等级上限 ${(lv + 1) * 5}`,
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
    effectText: lv => `灵气恢复 +${lv * 10}%,灵气上限 +${lv * 8}%,修炼速度 +${lv * 3}%`,
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
    // Phase 32.3 之后丹方不再由炉火高低"解锁",炉子只管出丹多寡 —— 成与不成看所知与手上功夫
    effectText: lv => `炼丹产出 +${lv * 5}% —— 炉子只管出丹多寡,成与不成看你懂多少`,
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
    effectText: lv => `强化上限 +${Math.floor(lv / 2)},炼器消耗 -${lv * 4}%`,
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
    effectText: lv => `每小时产灵草 ${(lv * FIELD_HERB_PER_HOUR).toFixed(0)} 株、玄铁 ${(lv * FIELD_ORE_PER_HOUR).toFixed(1)} 块`
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
    effectText: lv => `可驯养灵兽,灵兽属性效果 +${lv * 10}%`
  }
]

const BY_ID = new Map(BUILDINGS.map(x => [x.id, x]))

export function buildingDef(id: BuildingId): BuildingDef | undefined {
  return BY_ID.get(id)
}
