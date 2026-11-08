/**
 * 「灵石/器灵尘 尚差 N」这一句的唯一实现。
 *
 * 这段文案原先在 ui/reforgeText.reforgeShortToast 与 ui/affixTransferText.transferShortText
 * 里各写一遍,逐字相同(只有第一参数的类型名不同)。两处都是把差额说给玩家听:
 * 抄两份时若只改一处,同一种「灵石缺了 7 点」会在强化与词条转移里说成两种样子。
 *
 * 固定写法见 AGENTS.md「缺资源」:知道差额写「X尚差 N」,拿不到差额才写「X不足」。
 */

/** 差额读数:调用方已用 formatGap 处理,这里只拼句子 */
export interface GapAmounts {
  stone: string
  dust: number
}

/**
 * @param short 缺哪一样
 * @param gap   差额;省略则只说「不足」
 */
export function resourceShortText(short: 'stone' | 'dust', gap?: GapAmounts): string {
  const amount = short === 'stone' ? gap?.stone : gap?.dust
  const missing = amount === undefined ? '不足' : `尚差 ${amount}`
  return short === 'stone' ? `灵石${missing}` : `器灵尘${missing}`
}
