/**
 * 「X 尚差 N」「X 不足」这一句的唯一实现。
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
 * 任意一样资源的差额句。
 *
 * `amount` 用 `undefined` 区分「拿不到差额」与「差额确实是 0」——
 * 写成 falsy 判断的话,差额算出 0 会被说成「不足」,而别处照实报「尚差 0」,
 * 同一种缺料就有了两种说法(强化原先正是这么分的,现已并过来)。
 *
 * @param name   资源名(灵石 / 悟道点 / …)
 * @param amount 差额读数;`undefined` 表示拿不到
 */
export function shortageText(name: string, amount: string | number | undefined): string {
  return amount === undefined ? `${name}不足` : `${name}尚差 ${amount}`
}

/**
 * @param short 缺哪一样
 * @param gap   差额;省略则只说「不足」
 */
export function resourceShortText(short: 'stone' | 'dust', gap?: GapAmounts): string {
  return shortageText(short === 'stone' ? '灵石' : '器灵尘', short === 'stone' ? gap?.stone : gap?.dust)
}
