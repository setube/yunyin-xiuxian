import { resourceShortText, shortageText } from './resourceShortText'

/** 炼器提示:强化、分解、祭炼。只报结果与差额,数字与材料不省;缺料写「不足 / 尚差 N」,与重铸同一说法 */
export function upgradeCapToast(): string {
  return '强化已至上限'
}

/**
 * 强化缺料:缺哪一样就说哪一样,不用一句「或」。
 *
 * 句子本身转调 ui/resourceShortText —— 那里是「灵石/器灵尘 尚差 N」的唯一实现
 * (重铸与词条转移早已并过去)。本处原先另写一份,判据还差一点分叉:
 * 差额算出来是 0 时,这里按 falsy 报「不足」,而共享实现照实报「尚差 0」——
 * 同一种缺料在两处说成两种样子,正是那个模块当初要解决的问题。
 */
export function upgradeShortToast(short: 'stone' | 'dust', gap?: { stone: string; dust: number }): string {
  return resourceShortText(short, gap)
}

export function upgradeDoneToast(name: string, level: number): string {
  return `「${name}」已至 +${level}`
}

/** 连升总况,只报一次;stoneText 由调用方 formatGN */
export function upgradeBatchDoneToast(levels: number, newLevel: number, dust: number, stoneText: string): string {
  return `连升 ${levels} 级至 +${newLevel} · 共耗器灵尘×${dust} · 灵石 ${stoneText}`
}

export function salvageYieldText(dust: number, stoneText?: string): string {
  return stoneText ? `器灵尘×${dust} · 灵石退还 ${stoneText}` : `器灵尘×${dust}`
}

export function decomposeToast(dust: number, stoneText?: string, refund?: string): string {
  const yieldText = salvageYieldText(dust, stoneText)
  const base = `已化尘 · 得${yieldText}`
  return stoneText && refund ? `${base}(${refund})` : base
}

export function batchDecomposeToast(count: number, yieldText: string): string {
  return `已化尘 ${count} 件 · 得${yieldText}`
}

export function artifactCapToast(): string {
  return '祭炼已至上限'
}

/**
 * 祭炼缺料:悟道点与灵石分开报。
 *
 * 与强化、重铸、词条转移同走 resourceShortText 的 shortageText ——
 * 「X尚差 N / X不足」这一句只该有一处实现。
 */
export function artifactShortToast(
  short: 'wudao' | 'stone',
  gap?: { wudao: number; stone: string }
): string {
  return short === 'wudao' ? shortageText('悟道点', gap?.wudao) : shortageText('灵石', gap?.stone)
}

export function artifactDoneToast(name: string): string {
  return `「${name}」祭炼进一重`
}

/** 连炼总况,只报一次;stoneText 由调用方 formatGN */
export function artifactBatchDoneToast(levels: number, newLevel: number, wudao: number, stoneText: string): string {
  return `连炼 ${levels} 重至第 ${newLevel} 重 · 共耗悟道×${wudao} · 灵石 ${stoneText}`
}

/** 连炼中途停手:只报已炼成的重数与实耗 */
export function artifactBatchInterruptedToast(
  levels: number,
  newLevel: number,
  wudao: number,
  stoneText: string
): string {
  return `连炼 ${levels} 重即止 · 至第 ${newLevel} 重 · 实耗悟道×${wudao} · 灵石 ${stoneText}`
}
