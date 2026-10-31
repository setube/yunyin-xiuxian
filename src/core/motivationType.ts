/** 道果消费的动机类型审计,只做度量 */
import type { CombatRules } from '@/types'
import { LIFE_TRIALS } from '@/data/lifeTrials'
import { NOVELTY_MIN } from './worldGen'

/**
 * 把 CombatRules 摊成可比向量,供 ruleDistance 度量两条规则的差异。
 *
 * 与 worldGen 的 ruleVector **不同构**(原注释写「同构」,是错的):
 *   本表含 playerStartHpPct(生命命题常改开局气血),不含 critDamage;
 *   worldGen 那张表反之(终局变数常改暴击之伤,不管开局气血)。
 * 两边服务不同场景,维度不同是有意的;要比较时必须先确认落在哪一套坐标里。
 * spec 钉:bothVectors.spec.ts 记录两份维度清单,任一侧增删字段都会红。
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

/** 平常一世:无附加规则 */
export const PLAIN_LIFE: CombatRules = {}

export type MotivationType =
  /** 挑战型:信息已知 */
  | 'challenge'
  /** 探索型:信息未知 */
  | 'discovery'

/** 改变落在哪一层 */
export type ChangeSurface =
  /** 只改数值(乘区、上限) */
  | 'numbers'
  /** 改内容构成 */
  | 'content'

export interface MotivationProfile {
  id: string
  name: string
  /** 签前能否预知本世规则;1 = 完全可预知 */
  determinism: number
  /** 相对「平常一世」的规则偏离 */
  deviation: number
  /** 第二次买带来的新信息;0 = 完全重复 */
  replayDelta: number
  surface: ChangeSurface
  type: MotivationType
  evidence: string
}

/** 动机类型判定;核心是 replayDelta:第二次买还有没有未知 */
export function classify(determinism: number, replayDelta: number): MotivationType {
  return replayDelta > 0 && determinism < 1 ? 'discovery' : 'challenge'
}

/** 逆旅契的动机画像 */
export function trialProfiles(): MotivationProfile[] {
  return LIFE_TRIALS.map(t => {
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

/** 天界虚界的动机画像(对照) */
export function voidWorldProfile(): MotivationProfile {
  return {
    id: 'voidWorld',
    name: '虚界(对照)',
    determinism: 0,
    deviation: 1,
    replayDelta: NOVELTY_MIN,
    surface: 'content',
    type: classify(0, NOVELTY_MIN),
    evidence: `generateApprovedWorld 换种子重生成,noveltyScore < ${NOVELTY_MIN} 直接弃用;规则、敌人机制、可行流派三维都要够新`
  }
}

/** 两份契之间的规则距离 */
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

/** 契约池的总信息量:全部签过一遍即见底 */
export function poolExhaustion(): { total: number; livesToExhaust: number } {
  return { total: LIFE_TRIALS.length, livesToExhaust: LIFE_TRIALS.length }
}

export interface StructuralCondition {
  id: string
  name: string
  desc: string
  /** 逆旅契是否满足 */
  trialMeets: boolean
  /** 虚界是否满足 */
  voidMeets: boolean
  /** 凡界有没有现成能力 */
  hostReady: boolean
  note: string
}

/** 探索型消费须同时满足的三条结构条件 */
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

/** 凡界已具备的条件数 */
export function hostReadyCount(): number {
  return CONDITIONS.filter(c => c.hostReady).length
}

export { NOVELTY_MIN }

