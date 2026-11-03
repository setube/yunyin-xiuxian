import type { DaoPathId } from '@/types'
import { DAO_PATHS, daoPathDef } from '@/data/endgame'

/**
 * 道途形制。
 *
 * 四条道途(剑/长生/天机/杀伐)此前的界面语言只有一样:一枚朱砂方印,四道全是同一个红底。
 * 而道途是「一世一择、不可更改」的东西 —— 它该比一枚通用印章更有分量。
 *
 * 这一层加两样:符纹(crest)与道色(tone)。
 *   剑为单锋、长生为回环、天机为三横、杀伐为交刃 —— 形状不同,不必比色,
 *   色弱玩家照样分得开。道色只转发既有语义色(朱/金/靛/紫),不新增 token。
 *
 * 铁律与 luster 一致:形制服务于「这一世选了哪条路」,不抢正文可读性 ——
 * 道纹是卡角的一枚水印(见 style.css 里为什么不叠在印字上),不吃指针事件。
 */

/** 道途符纹的种类;CSS 里每种一套线纹 */
export type DaoCrest = 'blade' | 'ring' | 'bars' | 'cross'

export interface DaoMark {
  /** 符纹种类,CSS 按它上纹样 */
  crest: DaoCrest
  /** 纹样色:既有语义 token 的完整颜色(纹样用 currentColor,直接吃得下) */
  tone: string
  /** 读屏与 title 的说法:道名,复用 data/endgame 的既有状态词 */
  label: string
}

/**
 * 四道的形制映射:只定「哪条道长得像什么、用什么色」,名与色都转发既有事实源。
 * 拿不到定义的 id(坏档里写了个野 id)返回 undefined,调用点据此不挂形制。
 */
const CRESTS: Record<DaoPathId, DaoCrest> = {
  sword: 'blade',
  longevity: 'ring',
  fate: 'bars',
  slaughter: 'cross'
}

/** 道色:剑朱、长生金、天机靛、杀伐紫 —— 全是既有语义色,不新增 token */
const TONES: Record<DaoPathId, string> = {
  sword: 'var(--color-cinnabar)',
  longevity: 'var(--color-gold-ink)',
  fate: 'var(--color-azure)',
  slaughter: 'var(--color-violet-ink)'
}

/** 按 id 取道途形制;认不出就是 undefined(不挂形制,而不是挂一份假的) */
export function daoMark(id: string): DaoMark | undefined {
  const def = daoPathDef(id)
  if (!def) return undefined
  return { crest: CRESTS[def.id], tone: TONES[def.id], label: def.name }
}

/** 四条道各有一枚符纹,且互不重复(重复了等于两道长得一样) */
export function daoMarks(): DaoMark[] {
  return DAO_PATHS.map(d => daoMark(d.id)!)
}
