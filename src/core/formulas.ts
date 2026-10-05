/**
 * GameFormula —— 所有成长曲线公式集中管理
 * 关键设计:装备与敌人共用 powerScale 曲线,保证任何阶段数值对齐
 */
import type { GNum } from '@/types'
import { gn, gnMin, mulN, powN, mul, add } from '@/utils/gnum'
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
  LATE_COMBAT_GROWTH,
  LATE_CULT_SPEED_GROWTH,
  LATE_EXP_GROWTH,
  LATE_QI_CAP_GROWTH,
  LATE_QI_REGEN_GROWTH,
  QI_BASE_CAP,
  QI_BASE_REGEN,
  QI_CAP_MAJOR_GROWTH,
  QI_CAP_SUB_GROWTH,
  QI_REGEN_MAJOR_GROWTH,
  STONE_DROP_BASE,
  STONE_TIER_GROWTH,
  TRIBULATION_DIFFICULTY_CAP_MAJOR,
  TRIB_WAVE_BASE,
  TRIB_WAVE_MAJOR,
  TRIB_WAVE_STEP,
  WORLD_STEP_EXP_MULT,
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
import { isWorldEntry, MAX_MAJOR, WORLD_BREAK_MAJOR, worldOf } from '@/data/realms'

/**
 * 区域层级 → 对应大境界(与 regions.ts 设计同步)。
 * 1-20 对应人间界 0-8;21 起每层一个新境界,依次覆盖仙界/神界/混沌海。
 */
const TIER_MAJOR = [
  0, 0, 1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20
] as const
/** 区域层级 → 大境界内的小层位置 */
const TIER_SUB = [1, 4, 1, 4, 7, 2, 6, 1, 4, 8, 2, 7, 2, 7, 2, 7, 2, 7, 2, 7, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] as const

export function tierMajor(tier: number): number {
  return TIER_MAJOR[Math.max(0, Math.min(TIER_MAJOR.length - 1, tier - 1))]!
}

/**
 * 该区域层级属于哪一界域 —— 「这件东西是哪一界出的」只有这一处口径。
 * 装备详情与图鉴都用它,不再各自 tierMajor + worldOf 拼一遍。
 */
export function worldNameOfTier(tier: number): string {
  return worldOf(tierMajor(tier)).name
}

/**
 * 大境界 → 成长指数(把 major 拆成「人间界内」与「跨界之后」两段)。
 * 人间界沿用旧曲线,跨界后用平坦的 LATE_* 曲线(见 constants 注释)。
 */
function earlyLate(major: number): { early: number; late: number } {
  const early = Math.min(Math.max(0, major), WORLD_BREAK_MAJOR)
  return { early, late: Math.max(0, major - early) }
}

/** 大境界基础战力因子:realmScale 与 powerScale 共用,保证玩家与内容永不脱节 */
export function majorCombatFactor(major: number): GNum {
  const { early, late } = earlyLate(major)
  return mul(powN(COMBAT_MAJOR_GROWTH, early), powN(LATE_COMBAT_GROWTH, late))
}

/** 战力曲线因子:装备数值与敌人数值都基于它,永远与玩家境界曲线对齐 */
export function powerScale(tier: number): GNum {
  const m = tierMajor(tier)
  const s = TIER_SUB[Math.max(0, Math.min(TIER_SUB.length - 1, tier - 1))]!
  return mul(majorCombatFactor(m), powN(COMBAT_SUB_GROWTH, s))
}

/** 境界曲线因子(玩家自身基础属性) */
export function realmScale(major: number, sub: number): GNum {
  return mul(majorCombatFactor(major), powN(COMBAT_SUB_GROWTH, sub))
}

/**
 * 跨越界膜那一步 —— 走完「界末境界的圆满」就要引劫飞升/破界/归返,
 * 故界末那一境的最后一层按 WORLD_STEP_EXP_MULT 加价。
 *
 * 判据只此一处:界面(境界志/突破页)、模拟器、审计全部经 expRequirement,
 * 任何地方另写一个"×2"都会让玩家看到两个不同的需求数。
 */
export function isWorldStepLayer(major: number, sub: number): boolean {
  return sub >= SUB_LEVELS - 1 && major < MAX_MAJOR && isWorldEntry(major + 1)
}

/** 突破所需修为 */
export function expRequirement(major: number, sub: number): GNum {
  const { early, late } = earlyLate(major)
  const majorFactor = mul(powN(EXP_MAJOR_GROWTH, early), powN(LATE_EXP_GROWTH, late))
  const stepMult = isWorldStepLayer(major, sub) ? WORLD_STEP_EXP_MULT : 1
  return mulN(mul(majorFactor, powN(EXP_SUB_GROWTH, sub)), EXP_BASE * stepMult)
}

/** 基础修为/秒(未计任何倍率) */
export function baseCultPerSec(major: number, sub: number): number {
  const { early, late } = earlyLate(major)
  return (
    CULT_BASE_SPEED *
    Math.pow(CULT_MAJOR_SPEED_GROWTH, early) *
    Math.pow(LATE_CULT_SPEED_GROWTH, late) *
    Math.pow(CULT_SUB_SPEED_GROWTH, sub)
  )
}

/** 灵气上限 */
export function qiCap(major: number, sub: number): number {
  const { early, late } = earlyLate(major)
  return Math.floor(
    QI_BASE_CAP *
      Math.pow(QI_CAP_MAJOR_GROWTH, early) *
      Math.pow(LATE_QI_CAP_GROWTH, late) *
      Math.pow(QI_CAP_SUB_GROWTH, sub)
  )
}

/** 灵气恢复/秒(未计倍率) */
export function baseQiRegen(major: number): number {
  const { early, late } = earlyLate(major)
  return QI_BASE_REGEN * Math.pow(QI_REGEN_MAJOR_GROWTH, early) * Math.pow(LATE_QI_REGEN_GROWTH, late)
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
/** 战力算式里的三项权重 —— powerScore 与其解释文字用同一份,不许改一处漏一处 */
export const POWER_WEIGHTS = { attack: 3, defense: 2, hp: 0.15 } as const

export function powerScore(attack: GNum, defense: GNum, maxHp: GNum): GNum {
  return add(
    add(mulN(attack, POWER_WEIGHTS.attack), mulN(defense, POWER_WEIGHTS.defense)),
    mulN(maxHp, POWER_WEIGHTS.hp)
  )
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

/**
 * 即时修为的**唯一结算口径**:等效闭关时长 → 修为,封顶在「不满一层」。
 *
 *   修为 = min(修速 × 等效秒数, 当前一层需求 × 层上限)
 *
 * 三条来源(丹药 / 一场遭遇 / 一次际遇)都走这一个函数,在线与离线也走它 ——
 * 从前每一处各写一遍「需求 × 百分比」,于是每一处都随境界指数膨胀(见 constants
 * 里 BATTLE_EXP_SECS 的那段读数),而修速词条反倒只管得到挂机那一条线。
 *
 * 离线 N 场:把秒数与层上限一并乘 N(`secs × N` / `layerCap × N`)——
 * 上限随场数线性放大,故「N 场」恒等于「N 次单场」,离线不会偷跑也不会被吃掉。
 */
export function expFromSecs(expReq: GNum, secs: number, cultPerSec: number, layerCap: number): GNum {
  return gnMin(mulN(gn(cultPerSec), secs), mulN(expReq, layerCap))
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

/**
 * 天劫单波伤害占玩家最大生命比例。
 *
 * 式子 = (TRIB_WAVE_BASE + TRIB_WAVE_MAJOR×境界 + TRIB_WAVE_STEP×第几道) × (1 − 抗性)
 *        ↑ 三个系数收在 data/constants(Phase 39 由 0.15 / 0.02 / 0.03 上调 3%)
 *        ↑ 跨界那一境(9/14/18)的加难不在这条式子里,它走「不认三维折算」那条规则
 */
export function tribulationWaveDamage(targetMajor: number, wave: number, resist: number): number {
  // 境界项封顶(见 constants:难度口径只为 major ≤ 8 设,减伤有绝对上限)
  const m = Math.min(targetMajor, TRIBULATION_DIFFICULTY_CAP_MAJOR)
  const base = TRIB_WAVE_BASE + m * TRIB_WAVE_MAJOR + wave * TRIB_WAVE_STEP
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
