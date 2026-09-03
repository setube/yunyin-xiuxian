/**
 * 轮回 ROI 审计
 *
 * 前一轮审计问错了问题。真实存档证明耗时模型高估两个数量级(见 saveCalibration),
 * 于是「道果永久收益该怎么递减」这个题面本身就站不住。
 *
 * 真正要回答的是:**为什么高频轮回是显性最优解。**
 *
 * 本模块只做一件事:比较「继续本世深修」与「立刻轮回重刷」的道果效率。
 * 结论若是后者长期占优,那玩家刷轮回就不是习惯问题,是系统结构逼出来的。
 *
 * 口径:耗时用本模块的 fullHoursToReach,已计入修速倍率(功法/装备/建筑/灵根/道果)、
 * 突破失败重试与灵气等待。绝对值仍不可信(见 saveCalibration),
 * 但全部读数都是**同一把尺子下的比值**,偏差在相除时抵消,故可用。
 *
 * 补齐突破与灵气后结论未变:最优点仍是金丹,效率跌幅由 466 倍变 339 倍——
 * 这两项都随境界递增,分子分母同向放大,压不动阶数差。
 */
import { MANUAL_REBIRTH_MIN_MAJOR } from './reincarnation'
import { baseCultPerSec, baseQiRegen, breakthroughBaseRate, daoFruitGain, expRequirement, qiCap } from './formulas'
import { DEFAULT_ASSUMPTIONS, type SimAssumptions, estimateCultMult } from './progressionSim'
import { BT_FAIL_EXP_LOSS, BT_QI_COST_RATIO, SUB_LEVELS } from '@/data/constants'
import { toNum } from '@/utils/gnum'
import { MAX_MAJOR } from '@/data/realms'

/**
 * 修满一个大境界的完整耗时(秒)。
 *
 * progressionSim.hoursToReach 只算「修为累积」,漏了三项都随境界递增的成本:
 *   1. 突破失败重试——成功率从金丹 81% 降到真仙 72%,失败还要重攒 18% 修为
 *   2. 灵气等待——每次突破耗上限的 40%,攒够的时间从 1.3 分钟涨到 3.5 分钟
 *   3. 历练时间——战斗是修为的主要来源之一,但要占用时长(本函数暂未计入,
 *      因真实存档显示它与修炼并行,不是纯串行成本)
 *
 * 补齐前两项后,深修的时间成本比旧口径更高——这只会让「浅修快轮回」
 * 的优势更明显,不会翻转结论
 */
export function fullSecondsForMajor(major: number, daoFruit = 0, a: SimAssumptions = DEFAULT_ASSUMPTIONS): number {
  const mult = estimateCultMult(major, daoFruit, a)
  let sec = 0
  for (let s = 0; s < SUB_LEVELS; s += 1) {
    const req = toNum(expRequirement(major, s))
    const speed = baseCultPerSec(major, s) * mult
    const rate = breakthroughBaseRate(major, s)
    const tries = 1 / rate
    // 修为:首次攒满 + 每次失败后重攒损失的部分
    const expSec = (req / speed) * (1 + (tries - 1) * BT_FAIL_EXP_LOSS)
    // 灵气:每次尝试都要攒够
    const qiSec = ((qiCap(major, s) * BT_QI_COST_RATIO) / baseQiRegen(major)) * tries
    sec += expSec + qiSec
  }
  return sec
}

/** 从零修满到某大境界的完整耗时(小时) */
export function fullHoursToReach(targetMajor: number, daoFruit = 0, a: SimAssumptions = DEFAULT_ASSUMPTIONS): number {
  let sec = 0
  for (let m = 0; m < targetMajor; m += 1) sec += fullSecondsForMajor(m, daoFruit, a)
  return sec / 3600
}

/** 转世点:玩家在某个大境界圆满时选择轮回 */
export interface RebirthPoint {
  major: number
  /** 该境界圆满转世可凝的道果 */
  fruit: number
  /** 从零修满该境界的相对耗时(单位不可信,仅供比值) */
  hours: number
  /** 道果效率 = 道果 / 耗时 */
  efficiency: number
}

/** 合法转世点(金丹起,低于此境界不允许手动轮回) */
export function rebirthPoints(): RebirthPoint[] {
  const out: RebirthPoint[] = []
  for (let m = MANUAL_REBIRTH_MIN_MAJOR; m <= MAX_MAJOR; m += 1) {
    const fruit = daoFruitGain(m, 9)
    const hours = fullHoursToReach(m + 1)
    out.push({ major: m, fruit, hours, efficiency: fruit / hours })
  }
  return out
}

/** 效率最高的转世点 */
export function optimalRebirthPoint(): RebirthPoint {
  return rebirthPoints().reduce((a, b) => (b.efficiency > a.efficiency ? b : a))
}

export interface MarginalRow {
  from: number
  to: number
  /** 多修一境多得的道果 */
  fruitGain: number
  /** 多修一境多花的时间 */
  hoursCost: number
  /** 该段的边际效率 */
  marginal: number
  /** 相对「重刷一轮最优转世点」的效率占比 */
  vsOptimal: number
}

/**
 * 边际账:站在某境界,再往上修一境值不值。
 *
 * 参照物是「立刻轮回、重刷一轮最优转世点」——玩家的真实备选方案就是它,
 * 而不是「什么都不做」
 */
export function marginalTable(): MarginalRow[] {
  const opt = optimalRebirthPoint()
  const out: MarginalRow[] = []
  for (let m = MANUAL_REBIRTH_MIN_MAJOR; m < MAX_MAJOR; m += 1) {
    const fruitGain = daoFruitGain(m + 1, 9) - daoFruitGain(m, 9)
    const hoursCost = fullHoursToReach(m + 2) - fullHoursToReach(m + 1)
    const marginal = hoursCost > 0 ? fruitGain / hoursCost : 0
    out.push({ from: m, to: m + 1, fruitGain, hoursCost, marginal, vsOptimal: marginal / opt.efficiency })
  }
  return out
}

/**
 * 结构成因:两条曲线的增长阶数不同。
 *
 * 道果 = Σ(i+1)×DAO_FRUIT_PER_MAJOR,对境界是**二次**增长
 * 耗时按 EXP_MAJOR_GROWTH/CULT_MAJOR_SPEED_GROWTH 约 3.3 倍/境界,是**指数**增长
 * 分子二次、分母指数,效率必然单调崩塌——这不是参数没调好,是阶数不匹配
 */
export interface GrowthOrders {
  /** 金丹→真仙的道果倍数 */
  fruitSpan: number
  /** 金丹→真仙的耗时倍数 */
  hoursSpan: number
  /** 效率跌幅 */
  efficiencyDrop: number
}

export function growthOrders(): GrowthOrders {
  const lo = MANUAL_REBIRTH_MIN_MAJOR
  const fruitSpan = daoFruitGain(MAX_MAJOR, 9) / daoFruitGain(lo, 9)
  const hoursSpan = fullHoursToReach(MAX_MAJOR + 1) / fullHoursToReach(lo + 1)
  return { fruitSpan, hoursSpan, efficiencyDrop: hoursSpan / fruitSpan }
}
