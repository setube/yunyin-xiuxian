import { MUTATOR_THEMES, THEME_IDENTITY, type MutatorTheme } from '@/data/mutators'

/**
 * 天道变数的主题形制。
 *
 * 变数池按五个主题轴组织(生机/天时/杀伐/虚影/坚守),程序生成虚界时还会拿它做
 * 「不许大杂烩」的语义约束 —— 而界面此前只把变数印成「◇ 名称:说明」一行字,
 * 主题这条线从未浮出水面。玩家看到的是一串彼此无关的规则。
 *
 * 这一层给三样,都不新增数据:
 *   轴纹(axis):五轴各一枚线纹 —— 生(芽)、时(漏)、杀(锋)、影(叠影)、守(垒)。
 *                以**主题轴**定位而非变数 id:变数可以增删,轴是稳定的。
 *   轴名(identity):转发 `THEME_IDENTITY` 的既有措辞(生机断绝等),不另造词。
 *   同轴(count):一组变数里有几条落在同一轴上 —— 落在同一轴上的越多,
 *                这一趟的打法就越极端,这一点此前只能靠玩家自己数。
 *
 * 色取既有语义 token;轴纹只吃 currentColor。
 */

/** 轴纹种类,与 MutatorTheme 一一对应 */
export type AxisGlyph = 'sprout' | 'hourglass' | 'blade' | 'shadow' | 'rampart'

export interface ThemeMark {
  theme: MutatorTheme
  glyph: AxisGlyph
  /** 轴名,取 THEME_IDENTITY */
  identity: string
  /** 这一组里落在同轴的条数 */
  count: number
}

const GLYPHS: Record<MutatorTheme, AxisGlyph> = {
  survival: 'sprout',
  tempo: 'hourglass',
  lethality: 'blade',
  evasion: 'shadow',
  endurance: 'rampart'
}

/**
 * 一个变数落在哪条轴。
 * 池里登记过的按表查;未登记的(将来新增而忘了登记主题)按「杀伐」处理 ——
 * `worldGen` 那边同样以 `MUTATOR_THEMES[id] ?? 'survival'` 兜底,这里取它的另一半:
 * 宁可画成最常见的一轴,也不画一个没人认得的空纹。
 */
export function axisOf(mutatorId: string): MutatorTheme {
  return MUTATOR_THEMES[mutatorId] ?? 'survival'
}

/** 单条变数的主题形制 */
export function themeMark(mutatorId: string, count = 1): ThemeMark {
  const theme = axisOf(mutatorId)
  return { theme, glyph: GLYPHS[theme], identity: THEME_IDENTITY[theme], count }
}

/**
 * 一组变数的主题分布,按条数降序。
 * 同轴计数直接读 `MUTATOR_THEMES` —— 与 `worldGen` 判「语义是否聚焦」用的是同一张表,
 * 所以界面报出来的分布与世界的生成约束永远一致。
 */
export function themeBreakdown(mutatorIds: readonly string[]): ThemeMark[] {
  const counts = new Map<MutatorTheme, number>()
  for (const id of mutatorIds) {
    const theme = axisOf(id)
    counts.set(theme, (counts.get(theme) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([theme, count]) => ({ theme, glyph: GLYPHS[theme], identity: THEME_IDENTITY[theme], count }))
}

/** 轴纹的 CSS 类后缀 */
export function axisGlyph(glyph: AxisGlyph): string {
  return glyph
}

/** 变数池里出现过的全部主题轴;用于判据核对五轴都有形制 */
export function themesInPool(ids: readonly string[]): MutatorTheme[] {
  return [...new Set(ids.map(axisOf))]
}
