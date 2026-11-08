/**
 * 战报逐行的字色 —— 按条目类型分。
 *
 * 这是战报配色的唯一事实源。它原本在 `CombatPanel`(历练主战)与 `GauntletPanel`(天界演武)
 * 各写了一份一模一样的 10 键表:两处显示的是同一种战报条目,配色自然该同一套,
 * 但各写一份就意味着改一处、漏一处 —— 玩家会看到同一条「暴击」在两个入口颜色不同。
 *
 * 放在 ui 层而不是各组件内:它是一张「条目类型 → 字体色」的展示映射,不含逻辑。
 */
import type { CombatLogEntry } from '@/types'

/** 战报条目类型 → 字体色 class */
export const COMBAT_LOG_TONE: Record<CombatLogEntry['t'], string> = {
  atk: 'text-ink-soft',
  skill: 'text-azure',
  crit: 'text-cinnabar',
  shield: 'text-gold-ink',
  heal: 'text-jade',
  dodge: 'text-ink-faint',
  proc: 'text-violet-ink',
  info: 'text-ink-faint',
  win: 'text-jade font-kai',
  lose: 'text-cinnabar font-kai'
}
