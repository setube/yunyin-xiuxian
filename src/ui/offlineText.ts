/**
 * 离线归来文案 —— 「闭关」另有一条有时限、禁历练的增益。
 *
 * 离开游戏再回来,走的是 settleOffline,不是 startRetreat。
 * 卷轴上若写「闭关」,玩家会以为自己已经封洞,或反过来觉得闭关按钮没生效。
 *
 * 离线收益全体打 0.9(OFFLINE_EFFICIENCY):「离线可攒 X 时」指的是攒的上限,
 * 账面结算是按九成来的。这里一并交代,别让「说八小时、只得七成二」成了哑谜。
 */
import { OFFLINE_EFFICIENCY } from '@/data/constants'

export function offlineAwayPhrase(secondsText: string, cappedText?: string): string {
  const effNote = OFFLINE_EFFICIENCY < 1 ? ` · 离线按 ${Math.round(OFFLINE_EFFICIENCY * 100)}% 收益计` : ''
  if (cappedText) return `此去 ${secondsText}(收益按 ${cappedText} 结算${effNote})`
  return `此去 ${secondsText}${effNote}`
}

export function offlineAgeNote(ageYears: number): string {
  return `此去寿元流逝 ${ageYears} 载`
}
