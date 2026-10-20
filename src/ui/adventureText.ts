/**
 * 出发按钮上的账 —— 数字由 exploration 现算,这里只排成一行。
 * 行程、遇险、收益、遇敌间隔必须是结算即将用的那几个数。
 */
import { formatDuration } from '@/utils/format'
import type { PetPersonalityEffects } from '@/core/petPersonality'

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
 * 出行那一刻,灵兽之性折进了什么 —— 与 dangerFactorFor / exploreDurationSec / loot
 * 读同一张 EFFECTS(同源):遇险与行程两个数给倍率,掉宝与护持只能定性(一个进品质
 * 权重、一个进败北判定,没有干净的单数可写)。无同伴返回空串。
 */
export function petTraitTripLine(petName: string, effects: PetPersonalityEffects): string {
  const parts: string[] = []
  if (effects.dangerMult !== 1) parts.push(`遇险 ×${timesLabel(effects.dangerMult)}`)
  if (effects.exploreDurMult !== 1) parts.push(`行程 ×${timesLabel(effects.exploreDurMult)}`)
  if (effects.dropLuck !== 0) parts.push(`掉宝${effects.dropLuck > 0 ? '更佳' : '稍逊'}`)
  if (effects.lossReduction > 0) parts.push('败北偶有护持')
  return parts.length > 0 ? `${petName}之性:${parts.join(' · ')}` : ''
}

/**
 * 一趟历练的战绩 —— 胜 N 场、负 M 场。
 *
 * 只报胜场时,「胜 2 场」分不出是打了两场全胜,还是打了九场只赢了两场;
 * 而「胜 + 负 ≥ 3 才算走过一趟」的成就门槛、以及这趟值不值得再来,
 * 恰恰要的是**总量**。两本账本来就是会话里现成的 `wins` / `losses`,
 * 这里只负责把它们排成一行,不另算一遍。
 */
export function sessionRecordText(s: { wins: number; losses: number }): string {
  // Math.max(0, NaN) 仍是 NaN —— 先把非有限值按 0 收口,坏档才不会印出「胜 NaN 场」
  const count = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0)
  const wins = count(s.wins)
  const losses = count(s.losses)
  return losses > 0 ? `胜 ${wins} 场 · 负 ${losses} 场` : `胜 ${wins} 场`
}
