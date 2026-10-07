/**
 * 装备/物品品质体系
 *
 * ## 词条条数:上限一档一抬,下限一律不动
 *
 * 品质最值钱的地方是**词条条数**(数值那部分被 EQUIP_QUALITY_FLAT_EXP 压过,见 constants),
 * 所以这九档的**上限**必须一档比一档高:
 *   凡品 1 → 良品 2 → 精品 3 → 灵品 4 → 玄品 5 → 地品 6 → 天品 7 → 仙品 8 → 神品 9
 * 规则一句话:**上限 = rank + 1**。
 *
 * 从前不是这样:精品 [2,2]、地品 [4,4]、神品 [6,6] 各自把上下限**锁死在同一档**,
 * 于是 玄品 [3,4] 与 地品 [4,4] 的上限都是 4,天品 [4,5] 也只比它多半条 ——
 * 玩家一路穿到中后期,看到的「条数上限」都卡在四五条,
 * 「品质珍贵在多一条词条」这句话在界面上兑现不了。
 *
 * **下限这一列这次一律不动**(0/1/2/2/3/4/4/5/6,仍是老口径)。
 * 只抬上限、不落下限的理由是两条:
 *   一 只抬上限正好回答「品质越高,上限越高」,不让任何一档的**保底**变差——
 *      一件玄品仍至少三条、一件神品仍至少六条,老存档里的件不会因为新口径显得更破;
 *   二 上限是唯一必须动的量。下限跟着一起抬(如玄品 4~5)会让中后期装备平均多出
 *      小半条词条,把 Phase 33.1/33.2 好不容易收回来的膨胀又放出去
 *      (实测:炼虚→合体那一跃的脱节会从 1.15 顶到 1.39,越过了 inflationAudit 的红线)。
 *      只抬上限时同一读数仍在 1.2 附近,红线不响。
 *
 * 上界 9 不是随手定的:九档要**严格递增**、且不许比老口径更差,唯一的最小解就是 1…9。
 *
 * ## 品质窗口:稀有度是内容深度的函数,不是纯运气
 *
 * 每档品质带一个 [fromTier, toTier] —— 行业里叫物品等级带:神品该从神界/混沌海长出来,
 * 不是青云山麓抽奖抽到的。窗口内按权重正常掉;窗口外留一线(QUALITY_OUT_OF_BAND),
 * 给际遇、秘境与图鉴留门,但那已是万分之几。
 *
 * 首领/秘境/际遇显式指定了 minQualityRank 时**不吃窗口** —— 那是剧情给的例外,
 * 不该被一条掉落规则挡掉(人间界的仙缘,就该掉得出仙品)。
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

export function qualityDef(id: QualityId): QualityDef {
  return BY_ID.get(id) ?? QUALITIES[0]!
}

/** 「稀有及以上」的起点档 = 灵品(spirit)。此边界由数据档位定义推导,改名/重排档位时一处生效。 */
const RARE_RANK = QUALITIES.find(q => q.id === 'spirit')!.rank

/** 是否稀有品质(灵品及以上)—— 掉落 toast、气运加成等处共用的同一把尺子。 */
export function isRareQuality(q: QualityDef): boolean {
  return q.rank >= RARE_RANK
}

/** 玄品(profound)档位 rank —— 层级加成封顶档,由数据推导,排档时一处生效。 */
export const PROFOUND_RANK = QUALITIES.find(q => q.id === 'profound')!.rank
