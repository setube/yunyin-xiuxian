/**
 * 道果消费的动机类型审计
 *
 * 逆旅契已经证明「规则型消费」能产生真实构筑决策(四契皆改排序,
 * 两契让最强易主)。但它属于哪一种动机,决定了它能不能成为
 * 轮回的长期动力。
 *
 * 两种动机看着只差一点,实际完全不同:
 *
 *   挑战型  「我想挑战自己」    —— 签之前就知道会发生什么,只是想做到
 *   探索型  「我想看看会怎样」  —— 签之前不知道会发生什么,想去看
 *
 * 本模块要回答:**什么样的道果消费会产生后者?**
 *
 * 判据不靠感觉,靠三个可测的结构特征:
 *   determinism  签之前能否准确预知这一世的规则
 *   replayDelta  第二次买带来多少新信息
 *   surface      改的是数值,还是内容构成
 *
 * 只做度量,不改数值、不新增契约。
 */
import type { CombatRules } from '@/types'
import { LIFE_TRIALS } from '@/data/lifeTrials'
import { MUTATORS } from '@/data/mutators'
import { NOVELTY_MIN } from './worldGen'

// ============ 一、规则的向量化 ============

/**
 * 把 CombatRules 摊成可比向量。
 *
 * 与 worldGen 的 ruleVector 同构 —— 那边用来判「新世界够不够新」,
 * 这边用来判「这一世够不够不一样」,量的是同一件事
 */
export function ruleVector(r: CombatRules): number[] {
  return [
    r.healMult ?? 1,
    (r.maxRounds ?? 50) / 50,
    r.shieldCapRatio ?? 1,
    (r.enemyHpMult ?? 1) - 1,
    (r.enemyAtkMult ?? 1) - 1,
    (r.playerAtkMult ?? 1) - 1,
    r.playerStartHpPct ?? 1,
    r.enemyExtraMods?.dodgeRate ?? 0,
    r.enemyExtraMods?.critRate ?? 0
  ]
}

/** 两组规则的归一距离(0~1) */
export function ruleDistance(a: CombatRules, b: CombatRules): number {
  const va = ruleVector(a)
  const vb = ruleVector(b)
  let sum = 0
  for (let i = 0; i < va.length; i += 1) sum += (va[i]! - vb[i]!) ** 2
  return Math.min(1, Math.sqrt(sum / va.length) * 2.2)
}

/** 平常的一世:没有任何附加规则 */
export const PLAIN_LIFE: CombatRules = {}

// ============ 二、动机类型 ============

export type MotivationType =
  /** 挑战型:信息已知,动机来自证明自己 */
  | 'challenge'
  /** 探索型:信息未知,动机来自好奇 */
  | 'discovery'

/** 改变落在哪一层 */
export type ChangeSurface =
  /** 只改数值(乘区、上限) */
  | 'numbers'
  /** 改内容构成(有什么敌人、有什么可用、去哪些地方) */
  | 'content'

export interface MotivationProfile {
  id: string
  name: string
  /** 签之前能否准确预知这一世的规则;1 = 完全可预知 */
  determinism: number
  /** 相对「平常一世」的规则偏离 */
  deviation: number
  /** 第二次买带来的新信息;0 = 完全重复 */
  replayDelta: number
  surface: ChangeSurface
  type: MotivationType
  evidence: string
}

/**
 * 动机类型判定。
 *
 * 核心是 replayDelta:第二次买还有没有未知。
 * 没有未知就只能靠「证明自己」支撑,那是挑战型 ——
 * 挑战型天然是一次性的,不会成为长期动力
 */
export function classify(determinism: number, replayDelta: number): MotivationType {
  return replayDelta > 0 && determinism < 1 ? 'discovery' : 'challenge'
}

/** 逆旅契的动机画像 */
export function trialProfiles(): MotivationProfile[] {
  return LIFE_TRIALS.map(t => {
    // 规则是硬编码常量:签之前完全可预知,签第二次一模一样
    const determinism = 1
    const replayDelta = 0
    return {
      id: t.id,
      name: t.name,
      determinism,
      deviation: ruleDistance(t.rules, PLAIN_LIFE),
      replayDelta,
      surface: 'numbers' as ChangeSurface,
      type: classify(determinism, replayDelta),
      evidence: `rules 是 LIFE_TRIALS 里的常量;第二次签得到完全相同的一世`
    }
  })
}

/**
 * 天界虚界的动机画像(作为对照)。
 *
 * worldGen 每次换种子生成,且有 NOVELTY_MIN 硬门槛 ——
 * 结构上保证「与历史最近邻至少差 0.25」,故第二次去一定有新东西
 */
export function voidWorldProfile(): MotivationProfile {
  return {
    id: 'voidWorld',
    name: '虚界(对照)',
    // 生成式:同一个入口每次给出不同的世界
    determinism: 0,
    deviation: 1,
    // 新颖度门是结构性保证,不是概率
    replayDelta: NOVELTY_MIN,
    surface: 'content',
    type: classify(0, NOVELTY_MIN),
    evidence: `generateApprovedWorld 换种子重生成,noveltyScore < ${NOVELTY_MIN} 直接弃用;规则、敌人机制、可行流派三维都要够新`
  }
}

// ============ 三、契约之间的差异 ============

/** 两份契之间的规则距离 —— 衡量「换一份签」能带来多少不同 */
export function trialPairDistances(): { a: string; b: string; d: number }[] {
  const out: { a: string; b: string; d: number }[] = []
  for (let i = 0; i < LIFE_TRIALS.length; i += 1) {
    for (let j = i + 1; j < LIFE_TRIALS.length; j += 1) {
      out.push({
        a: LIFE_TRIALS[i]!.name,
        b: LIFE_TRIALS[j]!.name,
        d: ruleDistance(LIFE_TRIALS[i]!.rules, LIFE_TRIALS[j]!.rules)
      })
    }
  }
  return out
}

/**
 * 契约池的总信息量:全部签过一遍之后,还剩多少未知。
 *
 * 枚举式内容的信息量是有限的 —— 四份契签完就见底了。
 * 生成式内容没有这个上限,这是两者最本质的差别
 */
export function poolExhaustion(): { total: number; livesToExhaust: number } {
  return { total: LIFE_TRIALS.length, livesToExhaust: LIFE_TRIALS.length }
}

// ============ 四、探索型消费的结构条件 ============

export interface StructuralCondition {
  id: string
  name: string
  desc: string
  /** 逆旅契是否满足 */
  trialMeets: boolean
  /** 虚界是否满足 */
  voidMeets: boolean
  /** 凡界目前有没有现成能力 */
  hostReady: boolean
  note: string
}

/**
 * 要让道果消费产生「我想看看这一世会发生什么」,需要同时满足三条。
 *
 * 关键发现:三条**项目里已经全部实现过一遍**了 —— 就在 worldGen。
 * 只是它只服务天界(真仙之后),凡界轮回一条都用不上
 */
export const CONDITIONS: StructuralCondition[] = [
  {
    id: 'generative',
    name: '生成式而非枚举式',
    desc: '同一个入口每次给出不同的东西,而不是从固定清单里挑',
    trialMeets: false,
    voidMeets: true,
    hostReady: false,
    note: '逆旅契是四条常量;worldGen 换种子生成。凡界的区域/敌人/事件目前都是静态定义'
  },
  {
    id: 'noveltyFloor',
    name: '新颖度有下限保证',
    desc: '不是「可能不一样」,而是「保证与见过的都不一样」',
    trialMeets: false,
    voidMeets: true,
    hostReady: true,
    note: `NOVELTY_MIN=${NOVELTY_MIN} 是硬门槛,不过审就换种子重来 —— 这套判据本身是通用的,不依赖天界`
  },
  {
    id: 'contentSurface',
    name: '改内容构成而非只改数值',
    desc: '变的是「有什么」,不是「强多少」',
    trialMeets: false,
    voidMeets: true,
    hostReady: false,
    note: '逆旅契只动 CombatRules 的乘区;虚界连敌人机制集合都换。凡界需要能重组区域/敌人/事件'
  }
]

export function conditionsMetBy(who: 'trial' | 'void'): StructuralCondition[] {
  return CONDITIONS.filter(c => (who === 'trial' ? c.trialMeets : c.voidMeets))
}

/** 凡界已具备的条件数 —— 决定「把虚界那套搬下来」的实际成本 */
export function hostReadyCount(): number {
  return CONDITIONS.filter(c => c.hostReady).length
}

export { LIFE_TRIALS, MUTATORS, NOVELTY_MIN }
