/** 灵脉效果行:数字只从 perPoint / INSIGHT_DISCOUNT_PER_POINT 现算;词条名与加成栏同一套 */
import { formatPercent } from '@/utils/format'
import { INSIGHT_DISCOUNT_CAP, INSIGHT_DISCOUNT_PER_POINT, INSIGHT_EFFECT_NAME, type VeinDef } from '@/data/veins'
import { modsText } from '@/data/statNames'
import { shortageText } from './resourceShortText'

export function veinEffectText(def: VeinDef, points: number): string {
  const scaled: Record<string, number> = {}
  for (const [k, raw] of Object.entries(def.perPoint)) {
    if (typeof raw !== 'number' || raw === 0) continue
    scaled[k] = raw * points
  }
  const parts: string[] = []
  const mods = modsText(scaled)
  if (mods) parts.push(mods)
  if (def.id === 'insight') {
    parts.push(`${INSIGHT_EFFECT_NAME} −${formatPercent(Math.min(INSIGHT_DISCOUNT_CAP, points * INSIGHT_DISCOUNT_PER_POINT))}`)
  }
  return parts.join(' · ')
}

/** 洞府灵脉投点与改立;容量、主副上限、灵石报清 */
export function veinFullToast(): string {
  return '容量已尽'
}

export function veinPeakToast(isMain: boolean): string {
  return isMain ? '主脉圆满' : '副脉已至上限'
}

export function veinShortToast(stoneText?: string): string {
  // 与强化/词条转移同一句:共用 shortageText,不各写一份「灵石不足 / 尚差 N」
  return shortageText('灵石', stoneText)
}

export function veinSwitchShortToast(stoneText?: string): string {
  return shortageText('灵石', stoneText)
}

export function veinSwitchDoneToast(name: string): string {
  return `主脉改立「${name}」`
}

/** 连投总况,只报一次(stoneText 由调用方 formatGN) */
export function veinBatchDoneToast(name: string, points: number, stoneText: string): string {
  return `「${name}」连投 ${points} 点 · 共耗灵石 ${stoneText}`
}
