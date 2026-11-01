/**
 * 修为收入结构 —— 三条渠道的倍率与打平关系
 *
 * 计价单位:等效闭关时长;基线:挂机修炼(修速/秒)。设计记录:docs/superpowers/specs/2026-09-17-*
 *   挂机修炼      1.0×
 *   历练(+挂机)  ≈2.5×  遭遇自动,与挂机并行
 *   闭关          2.5×   期间不能历练
 * 闭关须与「挂机 + 历练」打平。历练修为不得按「当前一层需求的百分比」给:会随境界指数膨胀。
 * spec 钉:expIncome.spec(三条渠道的倍率关系)。
 */
import { BATTLE_EXP_SECS, EXPLORE_BATTLE_INTERVAL, EXPLORE_EVENT_CHANCE } from '@/data/constants'
import { buffDef } from '@/data/buffs'
import { MAX_MAJOR } from '@/data/realms'

/** 典型胜率,与 core/economySim 的行为假设同一份 */
export const TYPICAL_WIN_RATE = 0.85

/**
 * 一次际遇的典型等效闭关秒,取事件数据 30~120 秒的中位。
 * 具体值见 data/events 与 data/chains 的 secs,expIncome.spec 钉区间。
 */
export const TYPICAL_EVENT_EXP_SECS = 60

/** 每小时遭遇数(战斗 + 际遇),离线照算 */
export function encountersPerHour(): number {
  return 3600 / EXPLORE_BATTLE_INTERVAL
}

/** 每小时战斗次数(际遇不算战斗) */
export function battlesPerHour(): number {
  return encountersPerHour() * (1 - EXPLORE_EVENT_CHANCE)
}

/** 每小时胜场 —— 修为按胜场结算 */
export function winsPerHour(): number {
  return battlesPerHour() * TYPICAL_WIN_RATE
}

export function eventsPerHour(): number {
  return encountersPerHour() * EXPLORE_EVENT_CHANCE
}

/** 历练部分:每小时等效闭关秒 */
export function tripExpSecsPerHour(): number {
  return winsPerHour() * BATTLE_EXP_SECS + eventsPerHour() * TYPICAL_EVENT_EXP_SECS
}

/** 挂机部分(基线) */
export function idleExpSecsPerHour(): number {
  return 3600
}

/** 闭关部分:修速加成取自 buffs 本体,不在此抄数 */
export function retreatExpSecsPerHour(): number {
  return idleExpSecsPerHour() * (1 + (buffDef('retreat')?.mods.cultivationSpeed ?? 0))
}

export interface ExpIncomeRow {
  major: number
  /** 挂机修炼(基线) */
  idlePerHour: number
  /** 历练部分(与挂机并行) */
  tripPerHour: number
  /** 挂机 + 历练 合计 */
  totalPerHour: number
  /** 闭关专修(不能历练) */
  retreatPerHour: number
  /** 合计 ÷ 挂机;设计目标 ≈2.5,不随境界变 */
  ratio: number
}

function expIncomeAt(major: number): ExpIncomeRow {
  const idle = idleExpSecsPerHour()
  const trip = tripExpSecsPerHour()
  return {
    major,
    idlePerHour: idle,
    tripPerHour: trip,
    totalPerHour: idle + trip,
    retreatPerHour: retreatExpSecsPerHour(),
    ratio: (idle + trip) / idle
  }
}

export function expIncomeAudit(): ExpIncomeRow[] {
  const out: ExpIncomeRow[] = []
  for (let m = 0; m <= MAX_MAJOR; m += 1) out.push(expIncomeAt(m))
  return out
}
