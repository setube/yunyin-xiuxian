/** 功法参悟提示:残卷、精进。残页、悟道点、层数报清 */
export function gongfaPageShortToast(pageShort?: number): string {
  return pageShort === undefined ? '残页不足' : `残页尚差 ${pageShort} 页`
}

export function gongfaAllLearnedToast(): string {
  return '此境已收全'
}

export function gongfaComprehendToast(name: string): string {
  return `习得《${name}》`
}

export interface GongfaUpShortGap {
  wudao?: number
  page?: number
}

export function gongfaUpShortToast(short: 'wudao' | 'page' | 'both', gap?: GongfaUpShortGap): string {
  const wudao = gap?.wudao === undefined ? '悟道点不足' : `悟道点尚差 ${gap.wudao}`
  const page = gap?.page === undefined ? '残页不足' : `残页尚差 ${gap.page} 页`
  if (short === 'both') return `${wudao} · ${page}`
  return short === 'wudao' ? wudao : page
}

export function gongfaUpDoneToast(name: string, level: number): string {
  return `《${name}》已至第 ${level} 层`
}

/**
 * 功法满级时「进 修」钮的状态词。
 * 该钮与「设为主修 / 辅修」并排各占一半,代价算不出来时不能消失(见 masteryMark.spec 的同族判据);
 * 用既有状态词「圆满」—— 功法卡与地界卡都这么写,不再新造一个。
 */
export function gongfaPeakLabel(): string {
  return '已圆满'
}

export function gongfaSubFullToast(slots: number): string {
  return `辅修已满 ${slots} 席`
}

/**
 * 主修/辅修的开关回执。
 *
 * 原先主修切换完全没有回执,辅修只在「槽位已满」时出声 ——
 * 而这两颗钮点下去会改面板上的一整片属性(主修决定功法加成与神通),
 * 没有回执时玩家只能去角色页比对数值才知道换成了没有。
 * 换装、佩称号、祭炼法宝都有回执,此处补齐同一套。
 */
export function gongfaMainToast(name: string): string {
  return `主修《${name}》`
}

export function gongfaSubToast(name: string, on: boolean): string {
  return on ? `辅修《${name}》` : `撤下《${name}》`
}
