/**
 * Next upgrade line for equipment flats.
 * Each level adds EQUIP_LEVEL_BONUS of the naked base, so the gain
 * relative to the stats on screen shrinks as the level rises.
 */
import { EQUIP_LEVEL_BONUS } from '@/data/constants'
import { formatPercent } from '@/utils/format'

export function equipNextLevelText(level: number): string {
  const rel = EQUIP_LEVEL_BONUS / (1 + level * EQUIP_LEVEL_BONUS)
  return `基础属性此刻再涨 ${formatPercent(rel)}(每级相对裸装 +${formatPercent(EQUIP_LEVEL_BONUS)})`
}

/** 词条随机浮动,取实例上存的 roll(0~1)。满掷 = 贴着该条上限,贴底 = 掷在下限 */
export function affixRollText(roll: number): string {
  return `浮 ${Math.round(Math.max(0, Math.min(1, roll)) * 100)}%`
}

/** 「浮 X%」的悬停说明:告诉玩家这个百分数在比什么 */
export const affixRollHint = '随机浮动:百分数越大,这条越接近它的上限。封存/重铸前看一眼'
