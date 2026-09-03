/**
 * GameFormula —— 所有成长曲线公式集中管理
 * 关键设计:装备与敌人共用 powerScale 曲线,保证任何阶段数值对齐
 */
import type { GNum } from '@/types'
import { gn, mulN, powN, mul, add } from '@/utils/gnum'
import {
  COMBAT_ATK_BASE,
  COMBAT_DEF_BASE,
  COMBAT_HP_BASE,
  COMBAT_MAJOR_GROWTH,
  COMBAT_SUB_GROWTH,
  CULT_BASE_SPEED,
  CULT_MAJOR_SPEED_GROWTH,
  CULT_SUB_SPEED_GROWTH,
  ENEMY_GEAR_BASE,
  ENEMY_GEAR_GROWTH,
  EXP_BASE,
  EXP_MAJOR_GROWTH,
  EXP_SUB_GROWTH,
  QI_BASE_CAP,
  QI_BASE_REGEN,
  QI_CAP_MAJOR_GROWTH,
  QI_CAP_SUB_GROWTH,
  QI_REGEN_MAJOR_GROWTH,
  STONE_DROP_BASE,
  STONE_TIER_GROWTH,
  BT_MAJOR_BASE_RATE,
  BT_MAJOR_DECAY,
  BT_MAX_RATE,
  BT_MIN_RATE,
  BT_SUB_BASE_RATE,
  BT_SUB_DECAY,
  DAO_FRUIT_PER_MAJOR,
  SUB_LEVELS,
  BUILDING_COST_GROWTH,
  GONGFA_UP_GROWTH,
  GONGFA_UP_WUDAO_BASE,
  UPGRADE_DUST_BASE,
  UPGRADE_DUST_GROWTH,
  UPGRADE_STONE_TIER_BASE
} from '@/data/constants'

/** 区域层级 → 对应大境界(与 regions.ts 设计同步) */
const TIER_MAJOR = [0, 0, 1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8] as const
/** 区域层级 → 大境界内的小层位置 */
const TIER_SUB = [1, 4, 1, 4, 7, 2, 6, 1, 4, 8, 2, 7, 2, 7, 2, 7, 2, 7, 2, 7] as const

export function tierMajor(tier: number): number {
  return TIER_MAJOR[Math.max(0, Math.min(TIER_MAJOR.length - 1, tier - 1))]!
}

/** 战力曲线因子:装备数值与敌人数值都基于它,永远与玩家境界曲线对齐 */
export function powerScale(tier: number): GNum {
  const m = tierMajor(tier)
  const s = TIER_SUB[Math.max(0, Math.min(TIER_SUB.length - 1, tier - 1))]!
  return mul(powN(COMBAT_MAJOR_GROWTH, m), powN(COMBAT_SUB_GROWTH, s))
}

/** 境界曲线因子(玩家自身基础属性) */
export function realmScale(major: number, sub: number): GNum {
  return mul(powN(COMBAT_MAJOR_GROWTH, major), powN(COMBAT_SUB_GROWTH, sub))
}

/** 突破所需修为 */
export function expRequirement(major: number, sub: number): GNum {
  return mulN(mul(powN(EXP_MAJOR_GROWTH, major), powN(EXP_SUB_GROWTH, sub)), EXP_BASE)
}

/** 基础修为/秒(未计任何倍率) */
export function baseCultPerSec(major: number, sub: number): number {
  return CULT_BASE_SPEED * Math.pow(CULT_MAJOR_SPEED_GROWTH, major) * Math.pow(CULT_SUB_SPEED_GROWTH, sub)
}

/** 灵气上限 */
export function qiCap(major: number, sub: number): number {
  return Math.floor(QI_BASE_CAP * Math.pow(QI_CAP_MAJOR_GROWTH, major) * Math.pow(QI_CAP_SUB_GROWTH, sub))
}

/** 灵气恢复/秒(未计倍率) */
export function baseQiRegen(major: number): number {
  return QI_BASE_REGEN * Math.pow(QI_REGEN_MAJOR_GROWTH, major)
}

/** 玩家基础战斗三维 */
export function baseCombatStats(major: number, sub: number): { attack: GNum; defense: GNum; maxHp: GNum } {
  const scale = realmScale(major, sub)
  return {
    attack: mulN(scale, COMBAT_ATK_BASE),
    defense: mulN(scale, COMBAT_DEF_BASE),
    maxHp: mulN(scale, COMBAT_HP_BASE)
  }
}

/** 战力评分 */
export function powerScore(attack: GNum, defense: GNum, maxHp: GNum): GNum {
  return add(add(mulN(attack, 3), mulN(defense, 2)), mulN(maxHp, 0.15))
}

/** 突破基础成功率(未计加成) */
export function breakthroughBaseRate(major: number, sub: number): number {
  const isMajorStep = sub >= SUB_LEVELS - 1
  const raw = isMajorStep ? BT_MAJOR_BASE_RATE - major * BT_MAJOR_DECAY : BT_SUB_BASE_RATE - sub * BT_SUB_DECAY
  return Math.max(BT_MIN_RATE, Math.min(BT_MAX_RATE, raw))
}

export function clampRate(rate: number): number {
  return Math.max(BT_MIN_RATE, Math.min(BT_MAX_RATE, rate))
}

/** 灵石掉落基准(战斗/事件按层级换算) */
export function stoneByTier(tier: number, amount: number): GNum {
  return mulN(powN(STONE_TIER_GROWTH, Math.max(0, tier - 1)), STONE_DROP_BASE * amount * 0.1)
}

/** 建筑升级灵石成本 */
export function buildingCost(costBase: number, level: number): GNum {
  return mulN(powN(BUILDING_COST_GROWTH, level), costBase)
}

/** 功法升级悟道点成本 */
export function gongfaUpCost(qualityRank: number, level: number): number {
  return Math.ceil(GONGFA_UP_WUDAO_BASE * (1 + qualityRank * 0.6) * Math.pow(GONGFA_UP_GROWTH, level))
}

/** 装备强化成本 */
export function upgradeCost(level: number, tier: number, qualityRank: number, discount: number): { dust: number; stone: GNum } {
  const factor = Math.max(0.4, 1 - discount)
  return {
    dust: Math.ceil(UPGRADE_DUST_BASE * Math.pow(UPGRADE_DUST_GROWTH, level) * (1 + qualityRank * 0.3) * factor),
    stone: mulN(stoneByTier(tier, UPGRADE_STONE_TIER_BASE), (1 + level * 0.5) * factor)
  }
}

/** 离线收益估算辅助:胜率与战力比的映射 */
export function winChanceFromRatio(r: number): number {
  if (r <= 0) return 0.05
  const chance = 1 / (1 + Math.pow(0.85 / r, 4))
  return Math.max(0.05, Math.min(0.95, chance))
}

/** 天劫单波伤害占玩家最大生命比例(裸装首劫约五成生还,备战后稳过) */
export function tribulationWaveDamage(targetMajor: number, wave: number, resist: number): number {
  const base = 0.15 + targetMajor * 0.02 + wave * 0.03
  return Math.max(0.04, base * (1 - resist))
}

/** 敌人装备补偿系数:随层级指数跟随玩家装备成长(Phase 33.2 去封顶) */
export function enemyGearFactor(tier: number): number {
  return ENEMY_GEAR_BASE * Math.pow(ENEMY_GEAR_GROWTH, Math.max(0, tier - 1))
}

/** 转世凝结的道果数 */
export function daoFruitGain(major: number, sub: number): number {
  let total = 0
  for (let i = 0; i <= major; i += 1) total += (i + 1) * DAO_FRUIT_PER_MAJOR
  return total + Math.floor(sub / 3)
}

export { gn }
