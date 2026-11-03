import type { HerbGrade } from '@/data/herbGrades'
import { DAO_QUALITY_COLOR, DAO_QUALITY_RANK, pillQualityTextColor } from '@/data/pills'
import { qualityDef, qualityTextColor } from '@/data/qualities'
import { qualityTierByRank } from './qualityTier'
import { lusterByRank, type Luster } from './luster'

/**
 * 灵草五品的品阶形制。
 *
 * 为什么要有这一层:灵草进的是五品分账(凡/灵/仙/神/道),而界面此前只写「灵草×N」——
 * 采到的究竟是哪一品,玩家看不出来。品阶语言在装备、丹药、法宝上已经建立
 * (`qualityTier` 浓淡 → `qualityAura` 角饰 → `luster` 最上档形制),灵草接上去即可,
 * 不新起第五套色表,也不另立一套阈值。
 *
 * 映射唯一来源:品名。灵草五品的短名(凡品/灵品/仙品/神品)与品阶表同名,
 * 道品在 `data/pills`(rank 9,不进 `QualityId` 联合)。故本模块只做「品名 → 品阶 id」,
 * 色值、浓淡、光环、质感一律沿用既有模块。判据钉住这层同名关系(herbQuality.spec.ts):
 * 任一侧改名而对不上,测试即红 —— 那时才需要显式决定新的对应关系。
 */
const HERB_GRADE_QUALITY: Record<Exclude<HerbGrade, 5>, 'mortal' | 'spirit' | 'immortal' | 'divine'> = {
  1: 'mortal',
  2: 'spirit',
  3: 'immortal',
  4: 'divine'
}

/** 灵草品阶 → 品阶表 rank;道品取 rank 9(`data/pills`),与丹药同一档 */
export function herbQualityRank(grade: HerbGrade): number {
  return grade === 5 ? DAO_QUALITY_RANK : qualityDef(HERB_GRADE_QUALITY[grade]).rank
}

/** 识别色(光环/边框/淡底用);道品取丹药那一枚金 */
export function herbQualityTone(grade: HerbGrade): string {
  return grade === 5 ? DAO_QUALITY_COLOR : qualityDef(HERB_GRADE_QUALITY[grade]).color
}

/**
 * 当文字用的品阶色。四档过不了 4.5:1 的品阶各有暗/亮版(`qualityTextColor`),
 * 道品同理走 `data/pills` 的那条;这里只转发,不另取色。
 */
export function herbQualityTextColor(grade: HerbGrade): string {
  return grade === 5 ? pillQualityTextColor({ quality: 'dao' }) : qualityTextColor(HERB_GRADE_QUALITY[grade])
}

/** 边框与底色浓淡,与装备/丹药格同一把尺 */
export function herbQualityTier(grade: HerbGrade): { border: number; bg: number } {
  return qualityTierByRank(herbQualityRank(grade))
}

/** 最上档形制(御纹/流光/整幅框):神品与道品才有,与法宝、丹药同一档 */
export function herbQualityLuster(grade: HerbGrade): Luster | null {
  return lusterByRank(herbQualityRank(grade))
}
