/**
 * 五星串(★★★☆☆)。
 *
 * 同一段换算在仓库里曾有三份逐字相同的实现:
 *   core/buildAdvisor.ts 的 starsText(地域契合度)
 *   core/powerRating.ts  的 ratingStars(五维评级)
 *   ui/rateRank.ts       的 rateStarsText(胜率档位 —— 后加的,又抄了一遍)
 * 后一份的注释还写着「与 buildAdvisor.starsText 的钳制取法保持一致」——
 * 靠注释维持的一致性,改一处另两处不会跟。
 *
 * 这次收成一份。三处的语义本就相仿(都是「这一项有几颗星」),
 * 差别只在星数从哪来,不构成拆开的理由。
 *
 * 铁律:恒为五个字符。五星文案长度不固定时,tabular 列会错位。
 */

/** 星数夹进 1~5 并取整;坏值按 1 星处理(少承诺) */
export function clampStars(stars: number): number {
  if (!Number.isFinite(stars)) return 1
  return Math.max(1, Math.min(5, Math.round(stars)))
}

/** 五星串:恒星 + 空星,恒五个字符 */
export function starRow(stars: number): string {
  const n = clampStars(stars)
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}
