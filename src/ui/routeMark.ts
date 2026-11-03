import type { WorldRouteNode, WorldFoeShape } from '@/types'

/**
 * 远征路线节点形制。
 *
 * 每重两径择一,是这个模式里唯一的**连续决策** —— 而两张卡此前只是同一个灰框,
 * 「这一径险在哪」得读那行小字。风险类型本来是现成的(敌手的首个技艺),
 * 却没有人把它画出来。
 *
 * 这一层给两样,都不新增数据:
 *   险纹(peril):敌手首个技艺的类型各一枚线纹 —— 多段/真伤/流血/汲血/震慑/高爆/寻常。
 *                以**技艺类型**定位而非节点 id:节点是程序生成的,id 每次都不同,
 *                而「这一径是流血消耗」才是玩家真正在比较的东西。
 *   份量(weight):这一径额外的道源,分三档。倍率越高,路越险 —— 两径之间的取舍
 *                因此一眼可比,不必逐字读「道源 +7 / +12」。
 *
 * 色取既有语义 token;险纹只吃 currentColor。
 */

/** 险纹类型:与 shapeRisk 的判据同一套(敌手首个技艺的 effect,退而看会心/寻常) */
export type PerilKind = 'multi' | 'pierce' | 'bleed' | 'drain' | 'stun' | 'burst' | 'plain'

export interface RouteMark {
  peril: PerilKind
  /** 份量档:这一径的道源高低 */
  weight: 'light' | 'mid' | 'heavy'
  /** 读屏与 title 的说法:复用节点上已有的险情措辞 */
  label: string
}

const PERIL_GLYPH: Record<PerilKind, string> = {
  multi: 'multi',
  pierce: 'pierce',
  bleed: 'bleed',
  drain: 'drain',
  stun: 'stun',
  burst: 'burst',
  plain: 'plain'
}

/**
 * 从敌手形状判险纹。与 `core/worldGen.shapeRisk` 同一套优先级 ——
 * 那边写措辞、这边画形状;两处若各写一份,迟早出现「小字说流血、纹样画成高爆」。
 * 判据钉住这条同源关系。
 */
export function perilOf(foe: WorldFoeShape): PerilKind {
  if (foe.mods?.dodgeRate) return 'plain'
  const sk = foe.skills[0]
  if (!sk) return 'plain'
  if (sk.effect === 'multi') return 'multi'
  if (sk.effect === 'pierce') return 'pierce'
  if (sk.effect === 'bleed') return 'bleed'
  if (sk.effect === 'drain') return 'drain'
  if (sk.effect === 'stun') return 'stun'
  if (sk.mult >= 2) return 'burst'
  return 'plain'
}

/**
 * 份量档:按这一径的额外道源分级。
 * 阈值取「完整一趟的奖励量级」为参照,不与契约那套(道源倍率)混用 —— 两者量的不是同一件事。
 */
export function routeWeightOf(bonus: number): 'light' | 'mid' | 'heavy' {
  if (!Number.isFinite(bonus)) return 'light'
  if (bonus >= 13) return 'heavy'
  if (bonus >= 10) return 'mid'
  return 'light'
}

/** 一个节点的形制;节点缺敌手时按「寻常」处理,不抛错 */
export function routeMark(node: Pick<WorldRouteNode, 'foe' | 'bonus' | 'riskText'>): RouteMark {
  return {
    peril: node.foe ? perilOf(node.foe) : 'plain',
    weight: routeWeightOf(node.bonus),
    label: node.riskText || '寻常之敌'
  }
}

/** 险纹的 CSS 类后缀;与 style.css 里的 .route-peril--* 一一对应 */
export function perilGlyph(peril: PerilKind): string {
  return PERIL_GLYPH[peril]
}
