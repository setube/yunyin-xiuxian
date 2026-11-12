import type { GNum } from '@/types'
import { formatGap } from '@/utils/format'
import { resourceShortText, shortageText } from './resourceShortText'
import { TRANSFER_LABELS } from './affixTransferText'
/** 重铸与封存提示:只报结果与差额;缺料写「不足 / 尚差 N」 */
export function reforgeEmptyToast(): string {
  return '无可重铸词条'
}

/** 缺料提示:缺哪样只说哪样 */
export function reforgeShortToast(short: 'stone' | 'dust', gap?: { stone: string; dust: number }): string {
  return resourceShortText(short, gap)
}

/**
 * 重铸/自动重铸的缺料句(灵石与器灵尘两样并列)。
 *
 * 两处调用各写了一遍完全相同的五行(AutoReforgePanel 的 autoMaxShortText 与
 * EquipReforgeFooter 的 benchShortText),连 push 的顺序都一样。
 * `reforgeShortToast` 只管单样,并列这种单独一个入口。
 */
export function reforgeGapText(stone: GNum, dust: number): string {
  const parts: string[] = []
  if (stone.m > 0) parts.push(shortageText('灵石', formatGap(stone)))
  if (dust > 0) parts.push(shortageText('器灵尘', dust))
  return parts.join(' · ')
}

export function reforgeDoneToast(countNote: string): string {
  return `已重铸 · 词条 ${countNote}`
}

/**
 * 封存已满(每件须留一个可重掷位)。
 *
 * 说法转调词条转移的 sealFull —— 两处说的是同一条规矩(每件必须留一个可重掷位),
 * 原先各自写一遍字面量,注释里写着「同说法」而代码是抄的。
 */
export function sealMustLeaveToast(): string {
  return TRANSFER_LABELS.sealFull
}

export function sealShortToast(shortText?: string): string {
  // 封存只花灵石:同一份拼接,传尘的位随便填(不读)
  return resourceShortText('stone', shortText === undefined ? undefined : { stone: shortText, dust: 0 })
}

export function sealDoneToast(name: string): string {
  return `「${name}」已封存`
}

export function unsealDoneToast(name: string): string {
  return `「${name}」已解封`
}
