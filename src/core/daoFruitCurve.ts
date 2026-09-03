/**
 * 道果曲线审计
 *
 * 轮回审计已把一级根因钉死:道果是唯一无界的永久收益项。
 * 但「该改成多少」不能拍脑袋——本模块把候选曲线放在同一把尺子下跑对照,
 * 只出数据不改数值。
 *
 * 要回答的问题不是「第 100 世还有没有收益」,而是:
 * **第 100 世到第 200 世,玩家为什么还应该愿意轮回。**
 * 这是轮回系统的长期生命线,对应下面的 marginalPer100 指标。
 *
 * 另一条设计约束(来自玩家意见,写进判据):不接受硬封顶。
 * 「第 99 世有意义、第 100 世起永远没意义」会被直接读成人为封顶。
 * 更自然的方向是道果继续增长,但后期逐渐从「纯战力倍率」转为
 * 解锁、选择权、知识、规则适应——那部分不在本审计的度量范围内,
 * 这里只负责给出各曲线的体验形状。
 *
 * ⚠ 口径警告(saveCalibration 用真实存档验出):
 * 本模块所有小时数经 progressionSim 得出,而后者**高估约 100~400 倍**,
 * 且假设「每世修满真仙」——实测玩家在元婴到合体之间就转世,
 * 十八世总共只玩 22.7 小时。
 *
 * 因此本模块的用途仅限于**横向对照曲线形状**(各曲线共用同一把有偏的尺子,
 * 做比较时偏差抵消)。任何据此得出的「第 30 世该是 X 小时」都不成立——
 * 曾据此定过 DAO_FRUIT_KNEE=672,已因基线错误回滚。
 * 要定实际参数,须先在真实存档口径上重建耗时模型。
 */
import { DAO_FRUIT_SOFT_EXP } from '@/data/constants'
import { MAX_MAJOR } from '@/data/realms'
import { hoursToReach, type SimAssumptions } from './progressionSim'
import { daoFruitAfterLives, FRUIT_PER_LIFE, talentCultBonusAt, veinCultBonusAt } from './samsaraAudit'

/** 候选曲线:道果总量 → 有效值(即当前 effectiveDaoFruit 的位置) */
export interface FruitCurve {
  id: string
  name: string
  desc: string
  /** 是否有界 */
  bounded: boolean
  effective: (fruit: number) => number
}

/**
 * 对齐基准:所有曲线在「第二世」(道果 168)给出相同有效值,
 * 这样对照的是**形状**而不是量级——否则某条曲线只因整体调低就显得更好
 */
const ALIGN_FRUIT = FRUIT_PER_LIFE
const ALIGN_VALUE = Math.pow(ALIGN_FRUIT, DAO_FRUIT_SOFT_EXP)

/** 分段软帽与周期折算的特征量:约十世的道果量 */
const KNEE = FRUIT_PER_LIFE * 10

export const FRUIT_CURVES: FruitCurve[] = [
  {
    id: 'current',
    name: 'A 当前',
    desc: '效果 ∝ 道果^0.9。次线性但无界——lim n^0.9 = ∞,只是把曲线压平',
    bounded: false,
    effective: f => Math.pow(Math.max(0, f), DAO_FRUIT_SOFT_EXP)
  },
  {
    id: 'log',
    name: 'B 对数',
    desc: '效果 ∝ ln(1+道果)。仍无界,但增长率 ~1/f,深世近乎停滞',
    bounded: false,
    effective: f => (ALIGN_VALUE / Math.log(1 + ALIGN_FRUIT)) * Math.log(1 + Math.max(0, f))
  },
  {
    id: 'softcap',
    name: 'C 分段软帽',
    desc: `拐点 ${KNEE} 枚(约十世)前同当前曲线,之后斜率降到 ^0.5。无界、无断点`,
    bounded: false,
    effective: f => {
      const x = Math.max(0, f)
      if (x <= KNEE) return Math.pow(x, DAO_FRUIT_SOFT_EXP)
      return Math.pow(KNEE, DAO_FRUIT_SOFT_EXP) + Math.pow(x - KNEE, 0.5)
    }
  },
  {
    id: 'hardcap',
    name: 'D 总量封顶',
    desc: `有效值封顶于 ${KNEE} 枚处的水平。数学上干净,但会制造「此后永远无意义」的断点`,
    bounded: true,
    effective: f => Math.min(Math.pow(Math.max(0, f), DAO_FRUIT_SOFT_EXP), Math.pow(KNEE, DAO_FRUIT_SOFT_EXP))
  },
  {
    id: 'partial',
    name: 'E 周期折算',
    desc: `道果照常累积,但只有一部分进入本世有效值:等效量 ${KNEE}·ln(1+f/${KNEE})。前期近线性,后期转对数`,
    bounded: false,
    effective: f => Math.pow(KNEE * Math.log(1 + Math.max(0, f) / KNEE), DAO_FRUIT_SOFT_EXP)
  }
]

export function fruitCurve(id: string): FruitCurve {
  return FRUIT_CURVES.find(c => c.id === id) ?? FRUIT_CURVES[0]!
}

/**
 * 把候选曲线的有效值折算成「当前曲线下的等效道果」。
 * 这样可以直接复用 progressionSim 的 hoursToReach,不必复制一份修行耗时逻辑——
 * 复制会引入两套口径,日后必然对不上
 */
export function equivalentFruit(curve: FruitCurve, fruit: number): number {
  return Math.pow(Math.max(0, curve.effective(fruit)), 1 / DAO_FRUIT_SOFT_EXP)
}

/** 第 n 世的修行假设(与 samsaraAudit 同口径:天赋 + 灵脉都是有界项) */
function assumptionsAt(lives: number): SimAssumptions {
  return { linggenMult: 1.6, talentCultBonus: talentCultBonusAt(lives - 1) + veinCultBonusAt(lives - 1) }
}

/** 某曲线下,第 n 世从炼气修满真仙所需小时 */
export function hoursToPeakUnder(curve: FruitCurve, lives: number): number {
  return hoursToReach(MAX_MAJOR, equivalentFruit(curve, daoFruitAfterLives(lives - 1)), assumptionsAt(lives))
}

export interface CurveRow {
  life: number
  /** 该世单独修满真仙的耗时 */
  hours: number
  /** 从第一世算起的累计耗时 */
  cumulative: number
  /** 相对第一世的耗时比例 */
  vsFirst: number
  /**
   * 再轮回一百世能把单世耗时再压掉多少(0~1)。
   * 这一列才是「玩家为什么还愿意继续轮回」的直接读数:
   * 趋近 0 意味着轮回已无收益,但降到 0 的方式是断崖还是渐隐,决定观感
   */
  marginalPer100: number
}

/**
 * 累计耗时按「逐世相加」算。
 * 注意这不等于玩家真实总时长(还有历练、渡劫、等灵气),
 * 但用于横向对照候选曲线足够——各曲线共用同一口径
 */
export function curveTable(curve: FruitCurve, lifeList: number[]): CurveRow[] {
  const first = hoursToPeakUnder(curve, 1)
  let cumulative = 0
  let prevLife = 0
  return lifeList.map(life => {
    // 累计:把 (prevLife, life] 区间按端点值近似,避免逐世跑满五百次
    const hours = hoursToPeakUnder(curve, life)
    const prevHours = prevLife > 0 ? hoursToPeakUnder(curve, prevLife) : first
    cumulative += ((hours + prevHours) / 2) * (life - prevLife)
    prevLife = life
    return {
      life,
      hours,
      cumulative,
      vsFirst: first > 0 ? hours / first : 1,
      marginalPer100: hours > 0 ? 1 - hoursToPeakUnder(curve, life + 100) / hours : 0
    }
  })
}

/**
 * 玩家真正会经历的窗口。
 *
 * 主要设计窗口定在 1~30 世:普通玩家十几世看完整轮回体验,
 * 深度玩家二三十世仍有东西追,再往后系统允许继续玩但不要求核心成长继续膨胀。
 * 为第 500 世设计会反过来逼前 20 世的曲线做得保守——那是本末倒置
 */
export const LIFECYCLE_LIVES = [1, 2, 3, 5, 8, 10, 15, 20, 25, 30] as const

/** 生命周期窗口的末端,用作「优势兑现度」的分母 */
export const LIFECYCLE_HORIZON = 30

/**
 * E 周期折算的参数化版本:拐点位置可调。
 *
 * kneeLives 决定衰减发生在第几世附近——这是把「轮回优势」压进玩家
 * 自然生命周期的主要调节杆。拐点越靠前,主要收益兑现得越早,
 * 后面的世数越倾向于「走不同的人生」而非「走得更快」
 */
export function partialCurve(kneeLives: number): FruitCurve {
  const knee = FRUIT_PER_LIFE * Math.max(1, kneeLives)
  return {
    id: `partial${kneeLives}`,
    name: `E/拐点${kneeLives}世`,
    desc: `道果照常累积,有效量取 ${knee.toFixed(0)}·ln(1+f/${knee.toFixed(0)});衰减集中在第 ${kneeLives} 世附近`,
    bounded: false,
    effective: f => Math.pow(knee * Math.log(1 + Math.max(0, f) / knee), DAO_FRUIT_SOFT_EXP)
  }
}

/** 逐世边际收益:再多轮回一世,单世耗时能再压掉多少 */
export function marginalPerLife(curve: FruitCurve, lives: number): number {
  const h = hoursToPeakUnder(curve, lives)
  if (h <= 0) return 0
  return 1 - hoursToPeakUnder(curve, lives + 1) / h
}

/**
 * 优势兑现度:到第 n 世为止,兑现了「前 horizon 世全部轮回优势」的多少。
 *
 * 这是判断「衰减位置对不对」的主指标——若前十世只兑现三成,
 * 说明优势被摊到了玩家根本到不了的深世去
 */
export function redemptionAt(curve: FruitCurve, lives: number, horizon = LIFECYCLE_HORIZON): number {
  const h1 = hoursToPeakUnder(curve, 1)
  const hEnd = hoursToPeakUnder(curve, horizon)
  const total = h1 - hEnd
  if (total <= 0) return 1
  return (h1 - hoursToPeakUnder(curve, lives)) / total
}

export interface LifecycleRow {
  life: number
  hours: number
  vsFirst: number
  /** 再轮回一世的收益 */
  marginal: number
  /** 前 30 世优势的兑现进度 */
  redemption: number
}

/** 生命周期窗口内的逐世读数 */
export function lifecycleTable(curve: FruitCurve, lives: readonly number[] = LIFECYCLE_LIVES): LifecycleRow[] {
  const h1 = hoursToPeakUnder(curve, 1)
  return lives.map(life => {
    const hours = hoursToPeakUnder(curve, life)
    return {
      life,
      hours,
      vsFirst: h1 > 0 ? hours / h1 : 1,
      marginal: marginalPerLife(curve, life),
      redemption: redemptionAt(curve, life)
    }
  })
}

/** 各曲线在深世的收敛形态:用于判断「是渐隐还是断崖」 */
export interface ConvergenceRow {
  curve: FruitCurve
  /** 第 100 世的单世耗时 */
  h100: number
  /** 第 500 世的单世耗时 */
  h500: number
  /** 100→200 世的边际收益 */
  marginal100: number
  /** 400→500 世的边际收益 */
  marginal400: number
  /** 是否存在断点(某处边际收益骤降到近零) */
  hasCliff: boolean
}

export function convergence(): ConvergenceRow[] {
  return FRUIT_CURVES.map(curve => {
    const h100 = hoursToPeakUnder(curve, 100)
    const h500 = hoursToPeakUnder(curve, 500)
    const marginal100 = 1 - hoursToPeakUnder(curve, 200) / h100
    const marginal400 = 1 - h500 / hoursToPeakUnder(curve, 400)
    // 断崖判据:封顶类曲线在拐点之后边际收益直接为 0
    const hasCliff = marginal100 < 1e-6 && marginal400 < 1e-6
    return { curve, h100, h500, marginal100, marginal400, hasCliff }
  })
}
