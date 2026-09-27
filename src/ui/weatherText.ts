/**
 * 天时效果行 —— 数字只从天时定义里现算,不在界面另写一份。
 *
 * 风味短句可以写气氛,但不能代替词条:赤阳并不加火属,月蚀并不加幽冥,
 * 雷鸣加的是攻击与渡劫难度,不是「雷属」。玩家每天看这一行做取舍。
 */
import { formatPercent } from '@/utils/format'
import type { WeatherDef } from '@/core/weather'
import { modsText } from './statNames'

/** 今日实际加减;清和(空词条且渡劫倍率 1)说「无加减」,不留空白让人去猜 */
export function weatherEffectText(w: WeatherDef): string {
  const parts: string[] = []
  const mods = modsText(w.mods)
  if (mods) parts.push(mods)
  if (w.tribulationMult !== 1 && Number.isFinite(w.tribulationMult)) {
    const delta = w.tribulationMult - 1
    const pct = formatPercent(Math.abs(delta))
    parts.push(`渡劫难度 ${delta > 0 ? '+' : '-'}${pct}`)
  }
  return parts.length ? `今日:${parts.join(' · ')}` : '今日无加减'
}

/**
 * 修行页渡劫栏:天威百分比必须已经乘入 tribulationMult。
 * 倍率不为 1 时点明今日之名与加几成,数字仍从定义现算。
 */
export function weatherTribulationLine(w: WeatherDef): string | null {
  if (!Number.isFinite(w.tribulationMult) || w.tribulationMult === 1) return null
  const delta = w.tribulationMult - 1
  const pct = formatPercent(Math.abs(delta))
  const tilt = delta > 0 ? `天威更盛 ${pct}` : `天威稍敛 ${pct}`
  return `今日「${w.name}」,${tilt}。下方所陈劫数,已随今日天时同涨共落。`
}
