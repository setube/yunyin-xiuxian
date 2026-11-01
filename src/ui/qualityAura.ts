import type { QualityId } from '@/types'
import { qualityDef } from '@/data/qualities'

/**
 * 品阶光环:稀有度在卡片上「一眼可辨」的那一层。
 *
 * 与 `qualityTier` 的分工:`qualityTier` 只管浓淡(边框/底色的 alpha),三档;
 * 这里管**形制差异** —— 稀有件除了更深,还多出外发光、角饰、名牌描边。
 * 三档浓淡只能让人看出「这件比那件深」,隔着屏幕分不出「神品」和「天品」;
 * 形制才是可数的线索。
 *
 * 阈值与 `qualityTier` 同一把尺(rank 0-2 / 3-5 / 6+),不另立第三套:
 * 多一套阈值,换一处视觉就要问「到底按哪套」。
 */

/** 光环档位:凡/良/精 → plain,灵/玄/地 → refined,天/仙/神/道 → radiant */
export type AuraTier = 'plain' | 'refined' | 'radiant'

/** 天/仙/神三档再细分:章形与光色不同,不只靠浓淡 */
export type RadiantGrade = 'heaven' | 'immortal' | 'divine'

export interface QualityAura {
  tier: AuraTier
  /** 稀有档才有:天/仙/神的细分档;其余为 null */
  radiant: RadiantGrade | null
  /** 外发光强度(0 = 不发光);给 box-shadow 用,单位 px */
  glow: number
  /** 名牌是否加描边与字距(高级件名字本身要显眼) */
  plaque: boolean
  /** 角饰:刻意的形制差异,不用颜色区分 */
  corner: 'none' | 'double' | 'triple'
  /** 卡面是否带一道斜向流光(只在最顶档,且尊重减少动效) */
  sheen: boolean
  /** 读屏用:形制的中文说法,不进视觉层 */
  label: string
}

const RADIANT_ORDER: readonly QualityId[] = ['heaven', 'immortal', 'divine']

/**
 * 品阶光环。`rank` 可传 9(丹药道品),与 `qualityTierByRank` 同口径。
 * 认不出 rank 时退回最朴素的一档 —— 光环是加成,判不出来时宁可不加。
 */
export function qualityAura(quality: QualityId): QualityAura {
  return qualityAuraByRank(qualityDef(quality).rank)
}

export function qualityAuraByRank(rank: number): QualityAura {
  if (!Number.isFinite(rank) || rank < 3) {
    return { tier: 'plain', radiant: null, glow: 0, plaque: false, corner: 'none', sheen: false, label: '' }
  }
  if (rank < 6) {
    return { tier: 'refined', radiant: null, glow: 9, plaque: false, corner: 'double', sheen: false, label: '进阶' }
  }
  // 天/仙/神:每档再抬一级光与角饰,神品独有流光
  const grade = RADIANT_ORDER[Math.min(2, rank - 6)]!
  const idx = RADIANT_ORDER.indexOf(grade)
  return {
    tier: 'radiant',
    radiant: grade as RadiantGrade,
    glow: 14 + idx * 6,
    plaque: true,
    corner: idx === 0 ? 'double' : 'triple',
    sheen: idx === 2,
    label: ['天品', '仙品', '神品'][idx]!
  }
}
