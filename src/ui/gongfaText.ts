/**
 * 功法参悟提示 —— 残卷、精进。
 *
 * 藏经阁与功法升级是修行页高频短句。残页、悟道点、层数仍报清。
 */
export function gongfaPageShortToast(): string {
  return '残页未足,难拼此卷'
}

export function gongfaAllLearnedToast(): string {
  return '此境功法已尽数参透'
}

export function gongfaComprehendToast(name: string): string {
  return `残卷拼合,你参悟出《${name}》`
}

export function gongfaUpShortToast(short: 'wudao' | 'page' | 'both'): string {
  if (short === 'both') return '悟道点与残页俱缺,难以精进(悟道点自藏经阁/顿悟,残页自历练/际遇)'
  return short === 'wudao'
    ? '悟道点未足,难以精进(藏经阁与顿悟可得)'
    : '残页未足,难以精进(历练与际遇可得)'
}

export function gongfaUpDoneToast(name: string, level: number): string {
  return `《${name}》又进一重,已至第 ${level} 层`
}

export function gongfaSubFullToast(slots: number): string {
  return `辅修已满 ${slots} 席,广营藏经阁方可再纳`
}
