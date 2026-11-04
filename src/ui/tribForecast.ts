import type { TribulationPlan, TribulationTrace } from '@/core/tribulationDecision'

/**
 * 渡劫前的逐波推演读数。
 *
 * 决意前最该知道的两件事是「最险会掉到哪」与「第几道不支」。
 * core 的 `traceTribulation` 早就算出了这两项,但原只用来定「劫势」一档,
 * 算完即弃 —— 界面上是一句「劫势:可渡」,玩家读到的是结论,读不到结论的来路。
 *
 * 这一层只做一件事:把 trace 翻成一句话与一个水位比例。
 * 不重算、不预测随机浮动(结算另有 ±15% 波动,推演是期望值)。
 *
 * 与战后波次柱(`ui/tribWave`)的分工:那个读战报原文、画已发生的事;
 * 这个读推演、画将要发生的事。两者同源不同表,不互相取数。
 */

/** 推演读数 */
export interface TribForecast {
  /** 全程最低水位,按「开劫满血 = 1」的比例;跌破 0 记 0(已在最低处失去意义) */
  lowPct: number
  /** 推演是否撑到最后 */
  survived: boolean
  /** 崩在第几道;撑到最后为 0 */
  fellAt: number
  /** 一句话读数 */
  line: string
  /** 这一劫的险度档:只看最低水位,与 verdict 的分档同源(0.45 那条线) */
  tone: 'safe' | 'graze' | 'danger'
}

/** 最低水位低于这条线即「险过」;与 buildTribulationPlan 里 expectedRate 的 0.45 同义 */
const GRAZE_LINE = 0.45

/**
 * 由推演给读数。
 *
 * @param trace core 的推演结果
 * @param waves 这一劫共几道(waveSpan 给的数,不另数)
 */
export function tribForecast(trace: TribulationTrace, waves: number): TribForecast {
  const survived = trace.survived === true
  const fellAt = Number.isFinite(trace.fellAt) ? Math.max(0, Math.floor(trace.fellAt)) : 0
  const minHp = Number.isFinite(trace.minHp) ? trace.minHp : 0
  // 水位可以跌破 0(气血为负),报表上按 0 画 —— 负数的条没有意义
  const lowPct = Math.max(0, Math.min(1, minHp))
  const total = Number.isFinite(waves) && waves > 0 ? Math.floor(waves) : 0

  const tone: TribForecast['tone'] = !survived ? 'danger' : minHp < GRAZE_LINE ? 'graze' : 'safe'

  let line: string
  if (!survived) {
    line = total > 0 ? `推演第 ${fellAt} 道不支` : `推演不支`
  } else if (total > 0) {
    line = `推演 ${total} 道皆过 · 最低 ${Math.round(lowPct * 100)}%`
  } else {
    line = `最低 ${Math.round(lowPct * 100)}%`
  }

  return { lowPct, survived, fellAt, line, tone }
}

/** 由计划一次取全 —— 计划里已带 trace 与 def,waves 仍须调用方给(取自 waveSpan) */
export function forecastOf(plan: TribulationPlan | null, waves: number): TribForecast | null {
  return plan ? tribForecast(plan.trace, waves) : null
}
