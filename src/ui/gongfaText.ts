/**
 * 功法参悟提示 —— 残卷、精进。
 *
 * 藏经阁与功法升级是修行页高频短句。残页、悟道点、层数仍报清。
 */
export function gongfaPageShortToast(pageShort?: number): string {
  return pageShort === undefined ? '残页未足,难拼此卷' : `残页尚差 ${pageShort} 页,难拼此卷`
}

export function gongfaAllLearnedToast(): string {
  return '此境功法已尽数参透'
}

export function gongfaComprehendToast(name: string): string {
  return `残卷拼合,你参悟出《${name}》`
}

export interface GongfaUpShortGap {
  wudao?: number
  page?: number
}

export function gongfaUpShortToast(short: 'wudao' | 'page' | 'both', gap?: GongfaUpShortGap): string {
  if (short === 'both') {
    const parts: string[] = []
    if (gap?.wudao !== undefined) parts.push(`悟道点尚差 ${gap.wudao}`)
    if (gap?.page !== undefined) parts.push(`残页尚差 ${gap.page} 页`)
    const amount = parts.length > 0 ? `${parts.join(' · ')},` : ''
    return `${amount}悟道点与残页俱缺,难以精进(悟道点自藏经阁/顿悟,残页自历练/际遇)`
  }
  if (short === 'wudao') {
    return gap?.wudao === undefined
      ? '悟道点未足,难以精进(藏经阁与顿悟可得)'
      : `悟道点尚差 ${gap.wudao},难以精进(藏经阁与顿悟可得)`
  }
  return gap?.page === undefined ? '残页未足,难以精进(历练与际遇可得)' : `残页尚差 ${gap.page} 页,难以精进(历练与际遇可得)`
}

export function gongfaUpDoneToast(name: string, level: number): string {
  return `《${name}》又进一重,已至第 ${level} 层`
}

export function gongfaSubFullToast(slots: number): string {
  return `辅修已满 ${slots} 席,广营藏经阁方可再纳`
}
