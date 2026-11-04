import type { PowerDimension, PowerDimKey, PowerRating, PowerTerm } from '@/core/powerRating'

/**
 * 五维评级的刻度。
 *
 * 流派页的「五维评级」只给一排星(★★★☆☆):星级是**离散**的,
 * 而 core 早已算好连续得分与那道阈值表(`ratePower` 的 thresholds)。
 * 于是「进攻 3 星」与「进攻 3 星」之间差多少、再堆多少才够 4 星,玩家读不出来。
 *
 * 这一层只做一件事:把得分落回它所在的那一档,给出一格的进度。
 *
 * 为什么按每维自己的阈值归一,而不按全站共尺:
 *   五维的阈值本就不一样(身法 4 星要 0.7,恢复要 0.8,进攻要 1.6),
 *   共尺会把「1.0 的进攻」画成刚过一半、「0.7 的身法」画成已近满 —— 两把尺各量各的东西。
 *
 * 铁律:阈值与得分都取 core 已算出的数,这里不另判一次星级。
 */

/** 一维的刻度 */
export interface RatingGauge {
  key: PowerDimKey
  name: string
  /** 当前得分(core 原值) */
  score: number
  /** 当前星级 1~5 */
  stars: number
  /**
   * 本档进度 0~1:
   *   星与星之间这一段,当前落在其中的比例。已满 5 星时为 1。
   */
  progress: number
  /** 距下一星还差多少分;已满 5 星时为 0 */
  toNext: number
  /** 下一星的描述;已满 5 星时为 null */
  nextLabel: string | null
  /** 这一维的得分词条,原样转发 core 的明细(展开面板要读) */
  terms: PowerTerm[]
}

/** 星级的下标:星级 1 对应「还没过第一道」，5 对应「四道全过」 */
function nextThreshold(thresholds: readonly number[], stars: number): number | null {
  // thresholds 是四道线:过了 n 道就是 n+1 星
  return stars >= 5 ? null : (thresholds[stars - 1] ?? null)
}

/** 当前档的下界:1 星时下界为 0,其余为上一道线 */
function prevThreshold(thresholds: readonly number[], stars: number): number {
  return stars <= 1 ? 0 : (thresholds[stars - 2] ?? 0)
}

/**
 * 一维的刻度。
 *
 * @param dim core 给出的那一维得分与星级
 * @param thresholds 该维的四道线(core 的 thresholds 表里同键那份)
 */
export function ratingGauge(dim: PowerDimension, thresholds: readonly number[]): RatingGauge {
  const score = Number.isFinite(dim.score) ? Math.max(0, dim.score) : 0
  const stars = Math.max(1, Math.min(5, Math.round(dim.stars)))
  const next = nextThreshold(thresholds, stars)
  if (next === null) {
    return { key: dim.key, name: dim.name, score, stars, progress: 1, toNext: 0, nextLabel: null, terms: dim.terms }
  }
  const prev = prevThreshold(thresholds, stars)
  const span = next - prev
  // 跨度为 0(阈值表被写成同一个数)时退化为「过了就是过了」,不除零
  const progress = span > 0 ? Math.max(0, Math.min(1, (score - prev) / span)) : score >= next ? 1 : 0
  return {
    key: dim.key,
    name: dim.name,
    score,
    stars,
    progress,
    toNext: Math.max(0, next - score),
    nextLabel: `${stars + 1} 星`,
    terms: dim.terms
  }
}

/** 五维刻度,按 core 的 labels 原序 */
export function ratingGauges(rating: PowerRating): RatingGauge[] {
  return rating.labels.map(l => ratingGauge(l, rating.thresholds[l.key] ?? []))
}

/**
 * 全维最短的那一格 —— 「最短板」。
 *
 * 五维各画一根条,玩家一眼能看到长短;但「该先补哪一维」要拿四条去比。
 * 并列最短时取原序靠前的那个,与 labels 的次序同源,不另排。
 * 已满 5 星的不算短板:那是「已经到底」,不是「还差得远」。
 */
export function weakestGauge(gauges: readonly RatingGauge[]): RatingGauge | null {
  const candidates = gauges.filter(g => g.stars < 5)
  if (candidates.length === 0) return null
  return candidates.reduce((a, b) => (b.progress < a.progress ? b : a))
}
