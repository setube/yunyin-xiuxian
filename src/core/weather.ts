/**
 * 天时(Phase 31.0 A1)—— 游戏内每日环境
 *
 * 世界每天有一个轻微变化,影响环境而非玩家硬任务:
 *   灵雨:灵气恢复 +20%,修炼速度 +10%
 *   赤阳:火系伤害 +15%,火系词条效率提升
 *   月蚀:幽冥系效果增强,夜行事件 +20%
 *   雷鸣:突破危险提高(渡劫难度 +8%),雷系收益提高
 *   清和:无损益,风和日丽
 *
 * 关键:确定性(每游戏日固定,刷新不换),与"今日天道"同模式,
 * 由游戏总秒数派生,无现实时间依赖。
 */
import { useGameStore } from '@/stores/game'
import { mulberry32 } from '@/utils/random'
import type { StatMods } from '@/types'

export type WeatherId = 'lingyu' | 'chiyang' | 'yueshi' | 'leiming' | 'qinghe'

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
    desc: '赤阳高悬,火属之物更显威能。',
    mods: { attackPct: 0.05, damageBonus: 0.05 },
    tribulationMult: 1
  },
  {
    id: 'yueshi',
    name: '月蚀',
    desc: '月蚀之夜,幽冥之气弥漫。',
    mods: { luck: 0.05, dropRate: 0.05 },
    tribulationMult: 1
  },
  {
    id: 'leiming',
    name: '雷鸣',
    desc: '雷鸣阵阵,突破更险,雷属却更旺。',
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

const BY_ID = new Map(WEATHERS.map(w => [w.id, w]))

export function weatherDef(id: WeatherId): WeatherDef | undefined {
  return BY_ID.get(id)
}

/** 当天天时(确定性:游戏日 → 种子 → 天时,同一天内不换) */
export function todayWeather(): WeatherDef {
  const game = useGameStore()
  const day = Math.floor(game.totalPlaySec / 86400)
  const rng = mulberry32(day * 2654435761 + 0x9e3779b9)
  const roll = rng()
  // 权重:清和 30%,其余各 ~17.5%
  if (roll < 0.3) return WEATHERS[4]! // qinghe
  const idx = Math.floor(((roll - 0.3) / 0.7) * 4) // 0~3 对应前四种
  return WEATHERS[Math.min(3, idx)]!
}
