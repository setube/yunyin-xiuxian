import { mentorTierOf, type MentorTier } from '@/core/mentorService'

/**
 * 师承契合的形制。
 *
 * 弹窗原先写「当下契合 +1.00 / 1.0」:四个师承里三个都是 +1.00,
 * 而这个数其实是「加权计数 ÷ 常数」钳位的结果 —— 原始分 8.69 / 2.55 / 7.27 的差别
 * 一点也读不出来。更要紧的是计数器只增、权重全正,式子只能得非负值,
 * 「未纯」那一档的师尊叙事永远打不出来(见 data/mentors.ts 的四段 unaligned)。
 *
 * 现改用份额:四门各占你全部作为的多少,四门之和为 1。
 * 本模块只把份额落成可数的形制 —— 档位判据在 core,不在这里重写一份。
 */

/** 一门的份额落成几格;10 格够读出「过半」「三成」这种量级 */
export const SHARE_PIPS = 10

export type MentorShareTier = MentorTier

export interface MentorShareMark {
  /** 份额四舍五入到整格 */
  pips: number
  tier: MentorShareTier
  /** 份额的百分之几,整数 */
  pct: number
}

/**
 * 份额 → 可数的格数 + 档位。
 * @param share 本门份额 0~1
 * @param topShare 四门中最大份额 0~1(为 0 表示还没有可数的作为)
 * @param domains 门的数量(均分 = 1/domains)
 */
export function shareMark(share: number, topShare: number, domains: number): MentorShareMark {
  const safe = Number.isFinite(share) && share > 0 ? Math.min(1, share) : 0
  return {
    pips: Math.round(safe * SHARE_PIPS),
    tier: mentorTierOf(safe, Number.isFinite(topShare) ? topShare : 0, domains),
    pct: Math.round(safe * 100)
  }
}

/** 十格印:实心为已有,空心为未到。格数与形制都由这里给,模板不再自己数 */
export function sharePips(pips: number): boolean[] {
  const n = Number.isFinite(pips) ? Math.max(0, Math.min(SHARE_PIPS, Math.round(pips))) : 0
  return Array.from({ length: SHARE_PIPS }, (_, i) => i < n)
}

/** 档位色只取既有语义 token 的类名 */
export const TIER_CLASS: Record<MentorShareTier, string> = {
  aligned: 'text-jade',
  neutral: 'text-ink-faint',
  unaligned: 'text-cinnabar'
}

/** 档名:与师尊叙事同源,不另起说法 */
export const TIER_LABEL: Record<MentorShareTier, string> = {
  aligned: '契合',
  neutral: '中正',
  unaligned: '未纯'
}
