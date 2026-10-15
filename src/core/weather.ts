/**
 * 天时(Phase 31.0 A1)—— 游戏内每日环境
 *
 * 世界每天有一个轻微变化,影响环境而非玩家硬任务。
 * 具体加减只写在各条 WeatherDef.mods / tribulationMult 里;
 * 界面用 ui/weatherText 现算,不要在这里再抄一份百分比。
 * 人间五日的实际含义(与数据表一致,不是属系专精):
 *   灵雨:灵气恢复、修炼速度
 *   赤阳:攻击、伤害增幅(不是火属)
 *   月蚀:气运、装备掉落率(不是幽冥 / 夜行事件,也不抬灵石草矿)
 *   雷鸣:攻击、御劫为负、渡劫难度升高(不是雷属)
 *   清和:无损益
 *
 * 飞升之后天象随界域而变(见 WORLD_WEATHERS):仙界·仙雨/紫气/仙劫日,
 * 神界·神辉/法则潮/神威日,混沌海·混沌潮/本源涌动/道音。
 *
 * 关键:确定性(每游戏日固定,刷新不换),与"今日天道"同模式,
 * 由游戏总秒数派生,无现实时间依赖。
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
}

export const WEATHERS: WeatherDef[] = [
  {
    id: 'lingyu',
    name: '灵雨',
    desc: '灵雨润泽,灵气恢复与修炼皆有裨益。',
    mods: { qiRegen: 0.2, cultivationSpeed: 0.1 },
    tribulationMult: 1
  },
  {
    id: 'chiyang',
    name: '赤阳',
    desc: '赤阳高悬,出手更烈。',
    mods: { attackPct: 0.05, damageBonus: 0.05 },
    tribulationMult: 1
  },
  {
    id: 'yueshi',
    name: '月蚀',
    desc: '月蚀之夜,气运更盛,法器更易现世。',
    mods: { luck: 0.05, dropRate: 0.05 },
    tribulationMult: 1
  },
  {
    id: 'leiming',
    name: '雷鸣',
    desc: '雷鸣阵阵,锋芒更利,渡劫却更险。',
    mods: { attackPct: 0.05, tribulationResist: -0.05 },
    tribulationMult: 1.08
  },
  {
    id: 'qinghe',
    name: '清和',
    desc: '风和日丽,四时清和。',
    mods: {},
    tribulationMult: 1
  }
]

/**
 * 界域专属天象。
 *
 * 人间界的五日天时是"看天吃饭"的俗世气象;飞升之后天象随界域而变——
 * 仙界是仙灵之气与仙劫,神界是神辉与法则潮,混沌海是本源涌动。
 * 它们不是新玩法,只是把每个界域写成能看见、也能吃到的东西,
 * 让 12 个新境界不至于同质成同一片天。
 *
 * 与人间界同构:纯确定性(游戏日 + 界域派生)、只并入 mods 的临时加成,
 * 不新开资源、不新开货币。
 */
export const WORLD_WEATHERS: Record<Exclude<WorldId, 'mortal'>, WeatherDef[]> = {
  immortal: [
    {
      id: 'xianyu',
      name: '仙雨',
      desc: '仙灵之气化雨而落,吐纳之间灵气自生。',
      mods: { qiRegen: 0.25, cultivationSpeed: 0.12 },
      tribulationMult: 1
    },
    {
      id: 'ziqi',
      name: '紫气东来',
      desc: '紫气自东而来,气运更盛,法器更易现世。',
      mods: { luck: 0.08, dropRate: 0.08 },
      tribulationMult: 1
    },
    {
      id: 'xianjie',
      name: '仙劫日',
      desc: '天门震动,仙劫将至——渡劫更险,锋芒却更利。',
      mods: { attackPct: 0.08, tribulationResist: -0.08 },
      tribulationMult: 1.1
    }
  ],
  god: [
    {
      id: 'shenhui',
      name: '神辉',
      desc: '神光普照,出手之间自有威势。',
      mods: { attackPct: 0.08, damageBonus: 0.08 },
      tribulationMult: 1
    },
    {
      id: 'faze',
      name: '法则潮',
      desc: '法则如潮涌动,周身受其护持。',
      mods: { defensePct: 0.08, damageReduction: 0.06 },
      tribulationMult: 1
    },
    {
      id: 'shenwei',
      name: '神威日',
      desc: '众神之威压下,神劫更烈,神躯亦更固。',
      mods: { maxHpPct: 0.1, tribulationResist: -0.1 },
      tribulationMult: 1.12
    }
  ],
  chaos: [
    {
      id: 'hundunchao',
      name: '混沌潮',
      desc: '混沌之气起落如潮,吞纳之间修为奔涌。',
      mods: { cultivationSpeed: 0.2, qiRegen: 0.3 },
      tribulationMult: 1
    },
    {
      id: 'benyuan',
      name: '本源涌动',
      desc: '本源翻涌,举手投足皆合大道。',
      mods: { attackPct: 0.1, damageBonus: 0.08 },
      tribulationMult: 1
    },
    {
      id: 'daoyin',
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

/**
 * 当天天时(确定性:游戏日 + 界域 → 种子 → 天时,同一天内不换)。
 * 人间界沿用五日天时;仙界及以上取该界域的专属天象池。
 */
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
