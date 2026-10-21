/**
 * 丹药提示 —— 服用与开炉。
 *
 * 入口、成丹、炸炉都是高频短句。账房口吻(不足、炼成 ×1)太硬,
 * 但药力与枚数仍得报清,否则玩家不知这一口换来什么。
 */
export function pillGoneToast(): string {
  return '囊中无此丹'
}

export function pillTakenToast(name: string, effects: string): string {
  return `服下「${name}」,${effects || '药力温养周身'}`
}

export interface CraftShortGap {
  /** 当前品灵草还差几株;不缺时省略 */
  herb?: number
  /** 灵石还差多少(调用方已格式化);不缺时省略 */
  stone?: string
}

/**
 * 开炉缺料话术。
 *
 * 不传 gap 时保留旧的总称,供「尚不知道缺哪一样」的兜底;调用方拿得到实际
 * 差额时必须传进来 —— 只缺石就不提草,只缺草就不提石。
 */
export function craftShortToast(gap?: CraftShortGap): string {
  if (!gap) return '灵草或灵石未足,难开此炉'
  const parts: string[] = []
  if ((gap.herb ?? 0) > 0) parts.push(`灵草尚差 ${gap.herb} 株`)
  if (gap.stone) parts.push(`灵石尚差 ${gap.stone}`)
  return parts.length > 0 ? `${parts.join(' · ')},难开此炉` : '灵草或灵石未足,难开此炉'
}

/** 方子压根不存在 / 没解析出配方 —— 与「知道方子但缺料」是两回事,分开说 */
export function craftUnknownToast(): string {
  return '尚不知此方,无从开炉'
}

export function craftOkToast(name: string, extra: boolean): string {
  return extra ? `一炉双丹,「${name}」品相极佳` : `炉开丹成,得「${name}」一枚`
}
