import { EQUIP_LEVEL_BONUS } from '@/data/constants'
import { formatPercent } from '@/utils/format'

/** Each level adds EQUIP_LEVEL_BONUS of the naked base; the gain relative to the stats on screen shrinks as the level rises */
export function equipNextLevelText(level: number): string {
  const rel = EQUIP_LEVEL_BONUS / (1 + level * EQUIP_LEVEL_BONUS)
  return `基础属性 +${formatPercent(rel)}`
}

/** 词条随机浮动,取实例上存的 roll(0~1) */
export function affixRollText(roll: number): string {
  /*
   * `Math.max/min` 挡不住 NaN —— `Math.max(0, Math.min(1, NaN))` 仍是 NaN,
   * 会印成「浮 NaN%」(AGENTS.md 明文点过这个坑)。
   * 当前的调用点都是安全的(rng.next() 恒 0~1、rollMark 已先夹一次),
   * 但这是公开导出,新调用点误传坏值就直接脏到界面上。判不出按 0(下限)处理。
   */
  const raw = Number.isFinite(roll) ? roll : 0
  return `浮 ${Math.round(Math.max(0, Math.min(1, raw)) * 100)}%`
}

/** 「浮 X%」的悬停说明 */
export const affixRollHint = '浮动:0% 下限 · 100% 上限'

/** 战斗价值对比行的命名;不叫「战力」,免得误认成面板的「战力」 */
export function powerCompareLabel(): string {
  return '战斗价值'
}
