/**
 * 深修补偿审计(A/B 两案)
 *
 * 前一轮已定性:道果对境界二次增长、耗时指数增长,阶数不匹配,
 * 「浅修最优」被数学锁死。继续调 KNEE、^0.9、周期折算只能改曲线高度,
 * 改不了排序——金丹永远赢。
 *
 * 本模块验算两条结构性出路,只出数据不改代码:
 *
 *   A 案:把道果阶数提到与耗时同阶。代价是道果本身重新变成膨胀源。
 *   B 案:道果照旧,给深修另一种回报。问题是需要多大的量才够。
 *
 * 判据取自一条设计立场:**允许金丹成为最快的道果农场,本身不是问题。**
 * 问题是除了收割道果之外,系统没有任何理由让玩家把这一世继续活下去。
 * 所以 B 案要的不是「把效率抹平」,而是「让深修成为另一种目标下的最优解」。
 */
import { MANUAL_REBIRTH_MIN_MAJOR } from './reincarnation'
import { daoFruitGain } from './formulas'
import { effectiveDaoFruit } from './statsCalc'
import { DAO_FRUIT_COMBAT_BONUS } from '@/data/constants'
import { MAX_MAJOR } from '@/data/realms'
import { fullHoursToReach, optimalRebirthPoint } from './rebirthRoi'

// ---------------- A 案:道果阶数追平耗时 ----------------

/**
 * 求解「让道果效率不崩」所需的道果增长率。
 *
 * 目标:各境界的 道果/耗时 都不低于最优点的 floor 比例。
 * 耗时按约 3.3 倍/境界指数增长,故道果也必须指数增长才追得上
 */
export function requiredFruitGrowth(floor = 0.5): number {
  const lo = MANUAL_REBIRTH_MIN_MAJOR
  const optEff = optimalRebirthPoint().efficiency
  // 二分求解增长率 k:fruit(m) = fruit(lo) × k^(m-lo)
  let low = 1
  let high = 10
  for (let iter = 0; iter < 60; iter += 1) {
    const k = (low + high) / 2
    let ok = true
    for (let m = lo; m <= MAX_MAJOR; m += 1) {
      const fruit = daoFruitGain(lo, 9) * Math.pow(k, m - lo)
      if (fruit / fullHoursToReach(m + 1) < optEff * floor) {
        ok = false
        break
      }
    }
    if (ok) high = k
    else low = k
  }
  return high
}

export interface ExponentialFruitRow {
  major: number
  /** 当前口径的道果 */
  current: number
  /** A 案下的道果 */
  proposed: number
  /** 放大倍数 */
  inflation: number
  /** A 案下,单世道果换算成的永久战力加成 */
  combatBonus: number
}

/** A 案的道果表:看它会膨胀到什么程度 */
export function exponentialFruitTable(growth: number): ExponentialFruitRow[] {
  const lo = MANUAL_REBIRTH_MIN_MAJOR
  const base = daoFruitGain(lo, 9)
  const out: ExponentialFruitRow[] = []
  for (let m = lo; m <= MAX_MAJOR; m += 1) {
    const current = daoFruitGain(m, 9)
    const proposed = base * Math.pow(growth, m - lo)
    out.push({
      major: m,
      current,
      proposed,
      inflation: proposed / current,
      combatBonus: effectiveDaoFruit(proposed) * DAO_FRUIT_COMBAT_BONUS
    })
  }
  return out
}

// ---------------- B 案:深修的第二回报 ----------------

export interface CompensationRow {
  major: number
  fruit: number
  hours: number
  /** 当前效率相对最优点 */
  ratio: number
  /** 追平到最优点 target 比例所需的「等效道果」额外价值 */
  needed: number
  /** 该额外价值相当于本境界道果的多少倍 */
  timesFruit: number
}

/**
 * B 案:若要让深修在**纯效率口径**下追平,需要多大的第二回报。
 *
 * 注意这个口径本身是保守的——它假定第二回报与道果可比、可折算。
 * 实际设计中深修给的应是金丹**拿不到**的东西(命题、高阶认知、天界资格),
 * 那时效率比较不成立,需要的量会远低于此表。
 * 本表的用途是给出「若走纯补偿路线,坑有多深」的上界
 */
export function compensationTable(target = 0.5): CompensationRow[] {
  const optEff = optimalRebirthPoint().efficiency
  const out: CompensationRow[] = []
  for (let m = MANUAL_REBIRTH_MIN_MAJOR; m <= MAX_MAJOR; m += 1) {
    const fruit = daoFruitGain(m, 9)
    const hours = fullHoursToReach(m + 1)
    const needed = Math.max(0, optEff * target * hours - fruit)
    out.push({ major: m, fruit, hours, ratio: fruit / hours / optEff, needed, timesFruit: needed / fruit })
  }
  return out
}

/**
 * 不可替代性口径:若深修给的是独一份的东西,需要多少条独立路线
 * 才能让每个境界都有存在意义。
 *
 * 这是 B 案真正该走的方向——不比效率,比「你要的是哪一种东西」。
 * 返回的是可作为停世点的境界数(金丹之上每一境都得有自己的独特回报)
 */
export function distinctRouteCount(): number {
  return MAX_MAJOR - MANUAL_REBIRTH_MIN_MAJOR + 1
}
