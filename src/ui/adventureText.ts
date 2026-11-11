/** 出发按钮上的账:行程、遇险、收益、遇敌间隔由 exploration 现算,须是结算即将用的数;只排成一行 */
import { cnNumber, formatDuration, formatNum } from '@/utils/format'
import { EXPLORE_MODES } from '@/data/constants'
import type { ExploreMode } from '@/types'
import type { PetPersonalityEffects } from '@/core/petPersonality'

/** 各档行程的凶险形容词(纯展示,与 `EXPLORE_MODES` 的数值无关) */
export const EXPLORE_MODE_RISK_LABEL: Record<ExploreMode, string> = {
  normal: '安稳',
  deep: '小险',
  risky: '大凶',
  prolonged: '极险',
  marathon: '凶险',
  deepExpedition: '九死一生'
}

/** 未登记档位的回落 */
export const EXPLORE_MODE_RISK_FALLBACK = '涉险'

/** 某一档的凶险形容词;未登记的档位不留空 */
export function exploreModeRiskLabel(mode: ExploreMode): string {
  return EXPLORE_MODE_RISK_LABEL[mode] ?? EXPLORE_MODE_RISK_FALLBACK
}

/** 全部行程档位,按 `EXPLORE_MODES` 键序(时长递进);界面不许另写档位清单 */
export const exploreModeIds = Object.keys(EXPLORE_MODES) as ExploreMode[]

function timesLabel(n: number): string {
  const rounded = Math.round(n * 100) / 100
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '')
  return text.endsWith('.') ? text.slice(0, -1) : text
}

export function departButtonText(p: {
  durationSec: number
  rewardMult: number
  dangerMult: number
  battleGapSec: number
}): string {
  return `行程 ${formatDuration(p.durationSec)} · 收益 ×${timesLabel(p.rewardMult)} · 遇险 ×${timesLabel(p.dangerMult)} · 遇敌约 ${formatDuration(p.battleGapSec)}`
}

/**
 * 灵兽之性的出行折算,与 dangerFactorFor / exploreDurationSec / loot 同读 EFFECTS。
 * 遇险、行程给倍率;掉宝、护持只定性(没有单数可写)。无同伴返回空串。
 */
export function petTraitTripLine(petName: string, effects: PetPersonalityEffects): string {
  const parts: string[] = []
  if (effects.dangerMult !== 1) parts.push(`遇险 ×${timesLabel(effects.dangerMult)}`)
  if (effects.exploreDurMult !== 1) parts.push(`行程 ×${timesLabel(effects.exploreDurMult)}`)
  if (effects.dropLuck !== 0) parts.push(`掉宝${effects.dropLuck > 0 ? '更佳' : '稍逊'}`)
  if (effects.lossReduction > 0) parts.push('败北偶有护持')
  return parts.length > 0 ? `${petName}之性:${parts.join(' · ')}` : ''
}

/** 行程档位总账「N档行程 · 最凶较最稳凶 X 倍」;两个数都从 `EXPLORE_MODES` 现算 */
export function exploreModeSummaryLine(): string {
  const ids = exploreModeIds
  const dangers = ids.map(id => EXPLORE_MODES[id].dangerMult)
  const span = Math.round((Math.max(...dangers) / Math.min(...dangers)) * 10) / 10
  return `${cnNumber(ids.length)}档行程 · 最凶较最稳凶 ${span} 倍`
}

/** 一趟历练的战绩:胜 N 场,有败场时加报负 M 场 */
export function sessionRecordText(s: { wins: number; losses: number }): string {
  // Math.max(0, NaN) 仍是 NaN:非有限值先按 0 收口
  const count = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0)
  /*
   * 读数走 formatNum,不裸插值。
   *
   * 坏档把 `wins` 写成 1e300 时,裸插值印出「胜 1e+300 场」——
   * 那既不是本作的数字写法,也读不出来。formatNum 会印「100垓」,
   * 与灵石、修为那些读数同一套单位。
   * 一场历练的胜场正常是两位到三位数,formatNum 对那个区间就是原样输出。
   */
  const wins = formatNum(count(s.wins))
  const losses = formatNum(count(s.losses))
  return count(s.losses) > 0 ? `胜 ${wins} 场 · 负 ${losses} 场` : `胜 ${wins} 场`
}
