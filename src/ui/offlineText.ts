/**
 * 离线归来文案 —— 「闭关」另有一条有时限、禁历练的增益。
 *
 * 离开游戏再回来,走的是 settleOffline,不是 startRetreat。
 * 卷轴上若写「闭关」,玩家会以为自己已经封洞,或反过来觉得闭关按钮没生效。
 *
 * 0.9 的 OFFLINE_EFFICIENCY 只削「闲置积蓄」(修炼/灵气/建筑/藏经阁,offline.ts 的 effSec):
 * 历练(离线按在线 N 场同源结算)与镇压区域(豁免折扣是志在统治的补偿)都按全额。
 * 披露只写闲置那份的折损 —— 别让「全体九成」成了乌虚,也别让玩家误以为历练也缩水。
 */
import { OFFLINE_EFFICIENCY, OFFLINE_BOSS_REWARD_MULT } from '@/data/constants'

export function offlineAwayPhrase(secondsText: string, cappedText?: string): string {
  const effNote = OFFLINE_EFFICIENCY < 1 ? ` · 离线修炼与洞府积蓄按 ${Math.round(OFFLINE_EFFICIENCY * 100)}% 计` : ''
  if (cappedText) return `此去 ${secondsText}(收益按 ${cappedText} 结算${effNote})`
  return `此去 ${secondsText}${effNote}`
}

/** 离线首领战果:收益折损要带数字,别让「下线打 boss 少拿」成了哑谜(示=算) */
export function offlineBossNoteText(bossName: string): string {
  const eff =
    OFFLINE_BOSS_REWARD_MULT < 1
      ? `(离线战果,收益 ×${Math.round(OFFLINE_BOSS_REWARD_MULT * 100)}%)`
      : '(离线战果)'
  return `挂单之间,你已将【${bossName}】斩于剑下${eff}`
}

export function offlineAgeNote(ageYears: number): string {
  return `此去寿元流逝 ${ageYears} 载`
}

/**
 * 一趟途中拾得的法宝 —— **同一件只报一行**。
 *
 * 离线按期望件数入账,16 小时长档一次能掉出几十件;而囊中早就有的那几件
 * 每件都吐一行「(已拥有,化作悟道点×10)」,归来卷轴被同一行淹掉,别的什么都读不出。
 *
 * 于是按 defId 聚合:首件照念本名,后续重复折算的悟道点并进同一行。
 * 排序按首次拾得的顺序(前端的 Map 保序),不是按字母 —— 玩家认的是「先拿到的那件」。
 */
export function offlineArtifactNote(entries: { name: string; count: number; wudao: number }[]): string {
  const list = entries.map(e => (e.count > 1 ? `${e.name}×${e.count}(${e.wudao} 悟道点)` : e.name))
  return `途中拾得法宝 ${list.join('、')}`
}
