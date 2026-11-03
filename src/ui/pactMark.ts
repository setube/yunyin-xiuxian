import type { PactDef } from '@/types'
import { PACTS, PACT_HEAVY_MULT, pactDef } from '@/data/pacts'

/**
 * 天道契约形制。
 *
 * 契是「主动签下的不公平规则,风险换道源」—— 六张契摆在眼前,玩家要做的判断是
 * **「这一趟我敢下多大的注」**。而界面此前只给了三样:一个字、一行规则、一个倍数,
 * 六张契长得一模一样,重与轻只能靠读那个 ×N。
 *
 * 这一层把「重」变成可数与可辨的两样形制,不另立数值:
 *   契重(weight):按 `sourceMult` 分三档,重注阈值取 `data/pacts.PACT_HEAVY_MULT` ——
 *                与 `core/identity` 的「重注」口径同一根线,那边用它数接下重注的次数。
 *   契纹(crest):每张契一枚自己的线纹(裂/缺/促/独/完/逆),六枚两两不同。
 * 颜色只表达「轻重」,不表达「这几张不一样」:色弱玩家靠纹样与契重仍然分得开。
 */

/** 契重:轻(≤1.7)/ 中(2.0~2.2)/ 重(≥2.5) */
export type PactWeight = 'light' | 'mid' | 'heavy'

/** 契纹:每张契一枚线纹 */
export type PactCrest = 'crack' | 'broken' | 'haste' | 'solo' | 'whole' | 'reversed'

export interface PactMark {
  /** 契重档 */
  weight: PactWeight
  /** 契纹种类,CSS 按它上纹样 */
  crest: PactCrest
  /** 读屏与 title 用的说法:轻重 + 契名,不另造词 */
  label: string
}

const WEIGHT_LABEL: Record<PactWeight, string> = { light: '轻契', mid: '中契', heavy: '重契' }

/**
 * 契纹映射。id 是数据层的事实源,这里只定「哪张契长得像什么」。
 * 新增契若忘了登记,`pactMark` 返回 undefined,调用点不挂形制 —— 不会静默画错。
 */
const CRESTS: Record<string, PactCrest> = {
  xue: 'crack',
  can: 'broken',
  ji: 'haste',
  gu: 'solo',
  wushang: 'whole',
  ni: 'reversed'
}

/** 按 sourceMult 判契重;认不出的倍数按轻契处理(宁可不加,不加错) */
export function pactWeightOf(sourceMult: number): PactWeight {
  if (!Number.isFinite(sourceMult)) return 'light'
  if (sourceMult >= PACT_HEAVY_MULT) return 'heavy'
  if (sourceMult >= 2) return 'mid'
  return 'light'
}

/** 按 id 取契约形制;认不出就是 undefined */
export function pactMark(id: string): PactMark | undefined {
  const def = pactDef(id)
  if (!def) return undefined
  const crest = CRESTS[def.id]
  if (!crest) return undefined
  const weight = pactWeightOf(def.sourceMult)
  return { weight, crest, label: `${WEIGHT_LABEL[weight]} · ${def.name}` }
}

/** 六契各有形制;用于判据核对「每张都登记了」 */
export function pactMarks(): { def: PactDef; mark: PactMark }[] {
  return PACTS.flatMap(def => {
    const mark = pactMark(def.id)
    return mark ? [{ def, mark }] : []
  })
}

export { WEIGHT_LABEL }
