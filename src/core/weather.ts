/**
 * 天时:游戏内每日环境。
 * 加减只写在各条 WeatherDef.mods / tribulationMult,界面用 ui/weatherText 现算,此处不抄百分比。
 * 人间五日不是属系专精:赤阳非火属,雷鸣非雷属,月蚀非幽冥 / 夜行事件、不抬灵石草矿。
 * 确定性:由游戏总秒数派生,同一游戏日不换,无现实时间依赖。
 */
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { gameDay } from './formulas'
import { worldOf } from '@/data/realms'
import { mulberry32, RandomService } from '@/utils/random'
import type { StatMods, WorldId } from '@/types'

export type WeatherId =
  // 人间界
  | 'lingyu'
  | 'chiyang'
  | 'yueshi'
  | 'leiming'
  | 'qinghe'
  // 仙界
  | 'xianyu'
  | 'ziqi'
  | 'xianjie'
  // 神界
  | 'shenhui'
  | 'faze'
  | 'shenwei'
  // 混沌海
  | 'hundunchao'
  | 'benyuan'
  | 'daoyin'

export interface WeatherDef {
  id: WeatherId
  name: string
  desc: string
  /** 环境系数(并入 mods 的临时加成) */
  mods: StatMods
  /** 渡劫难度倍率(>1 更险) */
  tribulationMult: number
  /**
   * 天时图标。此前十四种天时共用首页那枚固定的 sparkles ——
   * 名字与效果都不同,图形却一样,「今天是哪种天时」只能逐字读。
   * 取 ui/icons 里语义最贴的一枚(雨/日/月/雷/风…),不另造图形。
   */
  icon: string
}

export const WEATHERS: WeatherDef[] = [
  {
    id: 'lingyu',
    icon: 'droplets',
    name: '灵雨',
    desc: '灵雨润泽,灵气恢复与修炼皆有裨益。',
    mods: { qiRegen: 0.2, cultivationSpeed: 0.1 },
    tribulationMult: 1
  },
  {
    id: 'chiyang',
    icon: 'sun',
    name: '赤阳',
    desc: '赤阳高悬,出手更烈。',
    mods: { attackPct: 0.05, damageBonus: 0.05 },
    tribulationMult: 1
  },
  {
    id: 'yueshi',
    icon: 'moon',
    name: '月蚀',
    desc: '月蚀之夜,气运更盛,法器更易现世。',
    mods: { luck: 0.05, dropRate: 0.05 },
    tribulationMult: 1
  },
  {
    id: 'leiming',
    icon: 'zap',
    name: '雷鸣',
    desc: '雷鸣阵阵,锋芒更利,渡劫却更险。',
    mods: { attackPct: 0.05, tribulationResist: -0.05 },
    tribulationMult: 1.08
  },
  {
    id: 'qinghe',
    icon: 'wind',
    name: '清和',
    desc: '风和日丽。',
    mods: {},
    tribulationMult: 1
  }
]

/** 界域专属天象(仙界及以上);与人间同构:确定性派生,只并入 mods 的临时加成,不新开资源或货币 */
export const WORLD_WEATHERS: Record<Exclude<WorldId, 'mortal'>, WeatherDef[]> = {
  immortal: [
    {
      id: 'xianyu',
      icon: 'umbrella',
      name: '仙雨',
      desc: '仙灵之气化雨而落,吐纳之间灵气自生。',
      mods: { qiRegen: 0.25, cultivationSpeed: 0.12 },
      tribulationMult: 1
    },
    {
      id: 'ziqi',
      icon: 'star',
      name: '紫气东来',
      desc: '紫气自东而来,气运更盛,法器更易现世。',
      mods: { luck: 0.08, dropRate: 0.08 },
      tribulationMult: 1
    },
    {
      id: 'xianjie',
      icon: 'swords',
      name: '仙劫日',
      desc: '天门震动,仙劫将至。渡劫更险,锋芒却更利。',
      mods: { attackPct: 0.08, tribulationResist: -0.08 },
      tribulationMult: 1.1
    }
  ],
  god: [
    {
      id: 'shenhui',
      icon: 'flame',
      name: '神辉',
      desc: '神光普照,出手之间自有威势。',
      mods: { attackPct: 0.08, damageBonus: 0.08 },
      tribulationMult: 1
    },
    {
      id: 'faze',
      icon: 'waves',
      name: '法则潮',
      desc: '法则如潮涌动,周身受其护持。',
      mods: { defensePct: 0.08, damageReduction: 0.06 },
      tribulationMult: 1
    },
    {
      id: 'shenwei',
      icon: 'shield',
      name: '神威日',
      desc: '众神之威压下,神劫更烈,神躯亦更固。',
      mods: { maxHpPct: 0.1, tribulationResist: -0.1 },
      tribulationMult: 1.12
    }
  ],
  chaos: [
    {
      id: 'hundunchao',
      icon: 'orbit',
      name: '混沌潮',
      desc: '混沌之气起落如潮,吞纳之间修为奔涌。',
      mods: { cultivationSpeed: 0.2, qiRegen: 0.3 },
      tribulationMult: 1
    },
    {
      id: 'benyuan',
      icon: 'mountain',
      name: '本源涌动',
      desc: '本源翻涌,举手投足皆合大道。',
      mods: { attackPct: 0.1, damageBonus: 0.08 },
      tribulationMult: 1
    },
    {
      id: 'daoyin',
      icon: 'music',
      name: '道音',
      desc: '虚空之中道音不绝,福至心灵。',
      mods: { luck: 0.1, dropRate: 0.1, breakthroughRate: 0.03 },
      tribulationMult: 1
    }
  ]
}

const BY_ID = new Map([...WEATHERS, ...Object.values(WORLD_WEATHERS).flat()].map(w => [w.id, w]))

export function weatherDef(id: WeatherId): WeatherDef | undefined {
  return BY_ID.get(id)
}

/** 当天天时(游戏日 + 界域派生,同日不换);人间取五日天时,仙界及以上取本界天象池 */
export function todayWeather(): WeatherDef {
  const game = useGameStore()
  const world = worldOf(usePlayerStore().major)
  if (world.id !== 'mortal') {
    const pool = WORLD_WEATHERS[world.id as Exclude<WorldId, 'mortal'>]
    const day = gameDay(game.totalPlaySec)
    const rng = new RandomService(mulberry32(day * 2654435761 + world.start * 131 + 0x51ed))
    return pool[rng.int(0, pool.length - 1)]!
  }
  const day = gameDay(game.totalPlaySec)
  const rng = mulberry32(day * 2654435761 + 0x9e3779b9)
  const roll = rng()
  // 权重:清和 30%,其余各 ~17.5%
  if (roll < 0.3) return WEATHERS[4]! // qinghe
  const idx = Math.floor(((roll - 0.3) / 0.7) * 4) // 0~3 对应前四种
  return WEATHERS[Math.min(3, idx)]!
}
