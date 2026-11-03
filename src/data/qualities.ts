/**
 * 装备/物品品质体系
 *
 * 词条条数:上限 = rank + 1,九档严格递增;下限 0/1/2/2/3/4/4/5/6 不动。
 * 下限一并抬高会让炼虚→合体脱节从 1.15 升到 1.39,越过 inflationAudit 红线。
 * 品质差主要在词条条数(数值部分被 EQUIP_QUALITY_FLAT_EXP 压过,见 constants)。
 *
 * 品质窗口 [fromTier, toTier]:窗口内按权重掉,窗口外只留一线(QUALITY_OUT_OF_BAND,万分之几)。
 * 首领/秘境/际遇显式指定 minQualityRank 时不吃窗口。
 */
import type { QualityDef, QualityId } from '@/types'
import { QUALITY_WEIGHTS } from './constants'

export const QUALITIES: QualityDef[] = [
  { id: 'mortal', name: '凡品', rank: 0, mult: 1.0, affixes: [0, 1], fromTier: 1, toTier: 12, weight: QUALITY_WEIGHTS[0], color: 'var(--color-ink-faint)' },
  { id: 'fine', name: '良品', rank: 1, mult: 1.25, affixes: [1, 2], fromTier: 1, toTier: 16, weight: QUALITY_WEIGHTS[1], color: 'var(--color-jade)' },
  { id: 'excellent', name: '精品', rank: 2, mult: 1.6, affixes: [2, 3], fromTier: 2, toTier: 20, weight: QUALITY_WEIGHTS[2], color: 'var(--color-azure)' },
  { id: 'spirit', name: '灵品', rank: 3, mult: 2.1, affixes: [2, 4], fromTier: 4, toTier: 24, weight: QUALITY_WEIGHTS[3], color: 'var(--color-violet-ink)' },
  { id: 'profound', name: '玄品', rank: 4, mult: 2.8, affixes: [3, 5], fromTier: 8, toTier: 27, weight: QUALITY_WEIGHTS[4], color: '#A85C3F' },
  { id: 'earth', name: '地品', rank: 5, mult: 3.7, affixes: [4, 6], fromTier: 12, toTier: 29, weight: QUALITY_WEIGHTS[5], color: 'var(--color-amber-ink)' },
  { id: 'heaven', name: '天品', rank: 6, mult: 5.0, affixes: [4, 7], fromTier: 16, toTier: 32, weight: QUALITY_WEIGHTS[6], color: '#C9A227' },
  { id: 'immortal', name: '仙品', rank: 7, mult: 6.8, affixes: [5, 8], fromTier: 20, toTier: 32, weight: QUALITY_WEIGHTS[7], color: '#3E8E8B' },
  { id: 'divine', name: '神品', rank: 8, mult: 9.5, affixes: [6, 9], fromTier: 24, toTier: 32, weight: QUALITY_WEIGHTS[8], color: 'var(--color-cinnabar)' }
]

const BY_ID = new Map<QualityId, QualityDef>(QUALITIES.map(q => [q.id, q]))

/**
 * 品阶色**当文字用**时的取值。
 *
 * 九档里三档的原色在正文线上过不去(实测日主题:玄 4.28、天 2.11、仙 3.36;
 * 夜主题:玄 3.34、仙 4.26),而 `color` 那一列还要兼任光环/边框/角章,
 * 那些地方只需要「色差够大分得开」,不该为了文字压暗。
 *
 * 所以文字走单独一组 token:日主题用暗版、夜主题反过来用亮版
 * (夜纸近黑,压暗只会更看不见)。其余六档原色本就双端达标,直接复用。
 */
const TEXT_COLOR: Partial<Record<QualityId, string>> = {
  profound: 'var(--color-quality-profound-text)',
  heaven: 'var(--color-quality-heaven-text)',
  immortal: 'var(--color-quality-immortal-text)'
}

export function qualityTextColor(id: QualityId): string {
  return TEXT_COLOR[id] ?? qualityDef(id).color
}

export function qualityDef(id: QualityId): QualityDef {
  return BY_ID.get(id) ?? QUALITIES[0]!
}

const RARE_RANK = QUALITIES.find(q => q.id === 'spirit')!.rank

/** 是否稀有品质(灵品及以上);掉落 toast、气运加成等处共用 */
export function isRareQuality(q: QualityDef): boolean {
  return q.rank >= RARE_RANK
}

/** 玄品 rank:层级加成封顶档 */
export const PROFOUND_RANK = QUALITIES.find(q => q.id === 'profound')!.rank
