/**
 * 战力算式与构成行 —— 只给界面用,故留在 ui 层。
 *
 * 权重取自 `core/formulas` 的 POWER_WEIGHTS(与 powerScore 同一份),
 * 名字取自 `data/statNames` —— 两处都不在这里抄第二份。
 */
import type { FinalStats, GNum } from '@/types'
import { POWER_WEIGHTS } from '@/core/formulas'
import { mulN } from '@/utils/gnum'

/** 战力算式一句话 */
export function powerExplainText(): string {
  const w = POWER_WEIGHTS
  return `攻×${w.attack} + 防×${w.defense} + 血×${w.hp}`
}

/** 战力构成行:攻/防/血各带权重与折算值 —— 逐行相加即总战力 */
export function powerBreakdownRows(
  s: FinalStats
): { name: string; raw: GNum; weight: number; value: GNum }[] {
  const w = POWER_WEIGHTS
  return [
    { name: '攻击', raw: s.attack, weight: w.attack, value: mulN(s.attack, w.attack) },
    { name: '防御', raw: s.defense, weight: w.defense, value: mulN(s.defense, w.defense) },
    { name: '气血', raw: s.maxHp, weight: w.hp, value: mulN(s.maxHp, w.hp) }
  ]
}
