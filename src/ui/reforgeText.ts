/**
 * 重铸与封存提示 —— 词条条数、尘石仍报清。
 *
 * 「不足」太像账房;重铸改的是词条构成,不是出身。
 */
export function reforgeEmptyToast(): string {
  return '此物已无重铸余地'
}

export function reforgeShortToast(): string {
  return '灵石或器灵尘未足,难移天机'
}

export function reforgeSealedNote(count: number): string {
  return count > 0 ? `(封存 ${count} 条未动)` : ''
}

export function reforgeDoneToast(countNote: string, sealedNote: string): string {
  return `天机重铸,词条 ${countNote}${sealedNote}`
}

export function sealMustLeaveToast(): string {
  return '至少须留一个词条随天意流转'
}

export function sealShortToast(): string {
  return '灵石未足,难封此纹'
}

export function sealDoneToast(name: string): string {
  return `「${name}」已封存,重铸不移`
}

/** 解封成功提示:免费、位子即时空出(重铸恢复可替它) */
export function unsealDoneToast(name: string): string {
  return `「${name}」已解封,重铸可再替`
}
