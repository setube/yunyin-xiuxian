import type { QualityId } from '@/types'
import { qualityDef } from '@/data/qualities'

/**
 * 品阶的三档视觉强度。
 *
 * 九档颜色各自有名字,但单靠色相去记九档并不现实:良品与精品同属青绿系,
 * 灵品到地品又都在紫褐之间。这里把九档折成三档晕染强度
 * (凡/良/精、灵/玄/地、天/仙/神),档内一致、档间拉开,让边框本身也带信息。
 *
 * 稀有档另由 isRareQuality 判断是否盖品阶章:章是形状线索,色弱玩家不靠颜色
 * 也能认出高档。颜色仍由 data/qualities 的单一事实源提供,这里只决定浓淡。
 */
export function qualityTierStyle(quality: QualityId): { border: number; bg: number } {
  const rank = qualityDef(quality).rank
  if (rank >= 6) return { border: 0.85, bg: 0.13 }
  if (rank >= 3) return { border: 0.55, bg: 0.1 }
  return { border: 0.33, bg: 0.06 }
}

/** 稀有档(天/仙/神)—— 需要盖品阶角章的那批 */
export function isRareQuality(quality: QualityId): boolean {
  return qualityDef(quality).rank >= 6
}

/**
 * 按品质 rank 判三档强度 —— 丹药的「道品」不在 QualityId 联合里,
 * 但它的 rank 9 仍应落进稀有档。调用方传 pillRank 即可,不必另写一张阈值表。
 */
export function qualityTierByRank(rank: number): { border: number; bg: number } {
  if (!Number.isFinite(rank)) return { border: 0.33, bg: 0.06 }
  if (rank >= 6) return { border: 0.85, bg: 0.13 }
  if (rank >= 3) return { border: 0.55, bg: 0.1 }
  return { border: 0.33, bg: 0.06 }
}

/** rank 是否落在稀有档(天/仙/神/道)—— 与 qualityTierByRank 同一阈值 */
export function isRareRank(rank: number): boolean {
  return Number.isFinite(rank) && rank >= 6
}
