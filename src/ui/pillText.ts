/** 丹药提示(服用与开炉):只报结果,药力与枚数照实报清 */
export function pillGoneToast(): string {
  return '囊中无此丹'
}

export function pillTakenToast(name: string, effects: string): string {
  return effects ? `服下「${name}」,${effects}` : `服下「${name}」`
}

export interface CraftShortGap {
  /** 当前品灵草还差几株;不缺时省略 */
  herb?: number
  /** 灵石还差多少(调用方已格式化);不缺时省略 */
  stone?: string
}

/** 开炉缺料回执。不传 gap 为总称兜底;拿得到差额时须传入,只报缺的那样 */
export function craftShortToast(gap?: CraftShortGap): string {
  if (!gap) return '灵草或灵石不足'
  const parts: string[] = []
  if ((gap.herb ?? 0) > 0) parts.push(`灵草尚差 ${gap.herb} 株`)
  if (gap.stone) parts.push(`灵石尚差 ${gap.stone}`)
  return parts.length > 0 ? parts.join(' · ') : '灵草或灵石不足'
}

/** 方子不存在 / 没解析出配方;与缺料分开报 */
export function craftUnknownToast(): string {
  return '不知此方'
}

export function craftOkToast(name: string, extra: boolean): string {
  return extra ? `双丹,得「${name}」两枚` : `丹成,得「${name}」一枚`
}

/**
 * 丹方读到几分熟。
 *
 * 同一个读数在三处各拼一遍:图鉴的「已得方 / 通晓」、行囊丹方行的「未得方 / 已通晓 /
 * 熟练 N%」、可炼性判据的阻断原因(那里只要「未得方」那一种)。
 * 三处各写各的时候,「已通晓」与「通晓」这种一字之差就有两套说法。
 *
 * @param mastery 熟练度 0~1(lore.recipeMastery)
 * @return 三态读数;调用方按需取整句或只看是否 `=== 未得方`
 */
export const RECIPE_MASTERY_TEXT = {
  /** 一点没读过:丹方还不会 */
  none: '未得方',
  /** 完全掌握 */
  full: '已通晓'
} as const

/** 行囊丹方行的完整读数;中间那档给出百分比 */
export function recipeMasteryText(mastery: number): string {
  if (!Number.isFinite(mastery) || mastery <= 0) return RECIPE_MASTERY_TEXT.none
  if (mastery >= 1) return RECIPE_MASTERY_TEXT.full
  return `熟练 ${Math.round(mastery * 100)}%`
}
