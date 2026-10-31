/**
 * Build 决策层:区域生态与敌人特性由正式敌人数据推导;流派×特性克制权重取自 buildSim 矩阵结论。
 * 只给评级与理由,不替玩家做决定。
 */
import type { EnemyDef, RegionDef } from '@/types'
import { enemyDef } from '@/data/enemies'
import { BUILD_STYLES, type BuildDetection, type BuildStyleDef } from './buildDetect'

// ---------- 敌人特性 ----------

export type EcoTrait = 'burst' | 'multi' | 'pierce' | 'dodge'

export const TRAIT_NAMES: Record<EcoTrait, string> = {
  burst: '高爆发',
  multi: '多段',
  pierce: '真伤',
  dodge: '疾影'
}

/** 单个敌人的机制特性(由数值与技能自动判定) */
export function enemyTraits(def: EnemyDef): EcoTrait[] {
  const traits = new Set<EcoTrait>()
  if (def.atkMult >= 1.35) traits.add('burst')
  for (const sk of def.skills) {
    if (sk.effect === 'multi') traits.add('multi')
    if (sk.effect === 'pierce') traits.add('pierce')
    if (sk.mult >= 2.2 && sk.rate >= 0.3) traits.add('burst')
  }
  if ((def.mods?.dodgeRate ?? 0) >= 0.1) traits.add('dodge')
  return [...traits]
}

// ---------- 区域生态 ----------

/** 0=无 1=低 2=中 3=高 */
export type EcoLevel = 0 | 1 | 2 | 3
export const ECO_LEVEL_NAMES = ['', '低', '中', '高'] as const

export type RegionEcology = Record<EcoTrait, EcoLevel>

/** 从区域的正式敌人配置推导生态(小怪常驻权重高,首领权重低) */
export function regionEcology(region: RegionDef): RegionEcology {
  const score: Record<EcoTrait, number> = { burst: 0, multi: 0, pierce: 0, dodge: 0 }
  for (const id of region.enemies) {
    const def = enemyDef(id)
    if (!def) continue
    for (const t of enemyTraits(def)) score[t] += 1.5
  }
  const boss = enemyDef(region.boss)
  if (boss) {
    for (const t of enemyTraits(boss)) score[t] += 1
  }
  const grade = (v: number): EcoLevel => (v >= 2.5 ? 3 : v >= 1.5 ? 2 : v > 0 ? 1 : 0)
  return { burst: grade(score.burst), multi: grade(score.multi), pierce: grade(score.pierce), dodge: grade(score.dodge) }
}

// ---------- 流派 × 特性 克制权重(源自 buildSim 矩阵) ----------

const STYLE_TRAIT_AFFINITY: Record<string, Record<EcoTrait, number>> = {
  beishui: { burst: -2, multi: 1, pierce: 1, dodge: -1 },
  gangdun: { burst: 2, multi: 1, pierce: -2, dodge: 2 },
  fanzhen: { burst: 1, multi: 2, pierce: 0, dodge: -2 },
  lianji: { burst: 2, multi: 1, pierce: 1, dodge: -2 },
  muze: { burst: -2, multi: 1, pierce: 1, dodge: 1 },
  fengmang: { burst: 1, multi: -1, pierce: 1, dodge: 0 }
}

/** 面对首领的相对表现(矩阵首领列) */
const STYLE_BOSS_AFFINITY: Record<string, number> = {
  beishui: 2,
  gangdun: -1,
  fanzhen: -2,
  lianji: -2,
  muze: 2,
  fengmang: -2
}

export interface Adaptation {
  /** 1~5 星 */
  stars: number
  reasons: string[]
}

const GOOD_COPY: Record<EcoTrait, string> = {
  burst: '耐重击',
  multi: '受击越多越强',
  pierce: '不依赖护盾',
  dodge: '不怕落空'
}

const BAD_COPY: Record<EcoTrait, string> = {
  burst: '怕重击',
  multi: '怕多段',
  pierce: '护盾被无视',
  dodge: '招式易落空'
}

/** 流派在某生态下的适配评级与理由 */
export function styleAdaptation(styleId: string, eco: RegionEcology, facingBoss = false): Adaptation {
  const affinity = STYLE_TRAIT_AFFINITY[styleId]
  if (!affinity) return { stars: 3, reasons: [] }
  let delta = 0
  const reasons: string[] = []
  for (const trait of Object.keys(eco) as EcoTrait[]) {
    const level = eco[trait]
    if (level === 0) continue
    const a = affinity[trait]
    delta += (a * level) / 2
    if (Math.abs(a) >= 1) {
      reasons.push(`${TRAIT_NAMES[trait]}·${ECO_LEVEL_NAMES[level]} → ${a > 0 ? GOOD_COPY[trait] : BAD_COPY[trait]}`)
    }
  }
  if (facingBoss) {
    const b = STYLE_BOSS_AFFINITY[styleId] ?? 0
    delta += b
    if (b >= 2) reasons.push('首领 → 擅久战')
    if (b <= -2) reasons.push('首领 → 不擅攻坚')
  }
  const stars = Math.max(1, Math.min(5, Math.round(3 + delta)))
  return { stars, reasons: reasons.slice(0, 3) }
}

/**
 * 混合流派的适配:主体系为主(权重 0.7),副体系调和(权重 0.3)。
 *
 * 理由的取法有讲究:styleAdaptation 每侧最多给 3 条,直接拼起来再 slice(0,3)
 * 会让副体系的理由**永远进不来**(主体系已经占满 3 条),于是出现
 * 「星级变了、理由没变」——玩家看到 3 星却读不到副体系的贡献。
 * 故两侧都有理由时各留席位:主 2 条 + 副 1 条,总数仍是 3,不改 UI 容量。
 */
export function detectionAdaptation(detection: BuildDetection, eco: RegionEcology, facingBoss = false): Adaptation {
  const main = styleAdaptation(detection.style.id, eco, facingBoss)
  if (!detection.secondary) return main
  const sub = styleAdaptation(detection.secondary.style.id, eco, facingBoss)
  const stars = Math.max(1, Math.min(5, Math.round(main.stars * 0.7 + sub.stars * 0.3)))
  // 副体系无理由时全给主体系,避免白占一格
  if (sub.reasons.length === 0) return { stars, reasons: main.reasons.slice(0, 3) }
  return { stars, reasons: [...main.reasons.slice(0, 2), sub.reasons[0]!].slice(0, 3) }
}

export interface StyleRecommendation {
  style: BuildStyleDef
  adaptation: Adaptation
}

/** 面向某区域的全流派推荐,按星级降序 */
export function recommendForRegion(region: RegionDef): StyleRecommendation[] {
  const eco = regionEcology(region)
  return BUILD_STYLES.map(style => ({ style, adaptation: styleAdaptation(style.id, eco) })).sort(
    (a, b) => b.adaptation.stars - a.adaptation.stars
  )
}

/** 生态展示行(仅列出存在的特性) */
export function ecologyChips(eco: RegionEcology): { trait: EcoTrait; name: string; level: EcoLevel }[] {
  return (Object.keys(eco) as EcoTrait[])
    .filter(t => eco[t] > 0)
    .sort((a, b) => eco[b] - eco[a])
    .map(t => ({ trait: t, name: TRAIT_NAMES[t], level: eco[t] }))
}

/**
 * 五星文案。入参先钳到 1~5:
 * 原实现直接 `'☆'.repeat(5 - stars)`, stars>5 时 repeat 收到负数会抛 RangeError
 * (全站是五行星, 越界只可能来自绕过 styleAdaptation 的调用), stars<1 则会给出五颗空星。
 * 钳制是防御性的, 不改变正常路径的输出。
 */
export function starsText(stars: number): string {
  const n = Math.max(1, Math.min(5, Math.round(stars)))
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}
