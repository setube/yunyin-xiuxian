/**
 * 胜率 → 五档说法。
 *
 * 这个换算在仓库里曾被抄了三份:
 *   core/compare.ts 的 rateText 与 RANK_TEXT(道痕今昔之比)
 *   core/lab.ts 的 rateRank 与 RANK_TEXT(反事实换装推演)
 *   core/expedition.ts 内联的三元链(远征难度与星级)
 * 三份的阈值一模一样(0.85 / 0.6 / 0.4 / 0.15),只有措辞在两两漂移 ——
 * 改一处阈值,另两处不会跟着动,而它们说的是同一件事:「这一场有多悬」。
 *
 * 这一层把阈值与说法收成一处。调用方按各自的展示需要取:要文字取 label,要星数取 stars。
 *
 * 铁律:阈值只有这一份。新增一档时改这里,三处一起跟上。
 */

/** 五档,由高到低;下标即档位(0 = 最悬) */
const RANK_TEXT = ['九死一生', '凶险', '胜负各半', '略占上风', '稳操胜券'] as const

/** 各档的下界:rate ≥ 该值即进入这一档。与 RANK_TEXT 一一对应(0 档无下界) */
const RANK_FLOOR = [0.15, 0.4, 0.6, 0.85] as const

/**
 * 胜率所在档位,0~4。
 *
 * 边界取「≥」:0.85 恰是「稳操胜券」的下界,差一点(0.849)就掉到「略占上风」。
 * 坏值按最悬处理 —— 算不出来时少承诺。
 */
export function rateRank(rate: number): number {
  if (!Number.isFinite(rate)) return 0
  let rank = 0
  for (const floor of RANK_FLOOR) if (rate >= floor) rank += 1
  return rank
}

/** 胜率的五档说法 */
export function rateText(rate: number): string {
  return RANK_TEXT[rateRank(rate)]!
}

/** 胜率的星数 1~5,与档位同源 */
export function rateStars(rate: number): number {
  return rateRank(rate) + 1
}

/** 星串(★/☆ 各五格);与 ratingStars 同形,但取的是胜率档而非战力维 */
export function rateStarsText(rate: number): string {
  const n = rateStars(rate)
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

/** 全部说法(供自检读) */
export function rateLabels(): readonly string[] {
  return RANK_TEXT
}
