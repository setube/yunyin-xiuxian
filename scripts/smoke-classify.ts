/**
 * 冒烟死按钮分类的纯决策,不依赖 Playwright。
 * 单一来源:scripts/ui-smoke.mjs 与单测共用这一份。
 */
/** 幂等选中项:点当前已选中的值本就无变化,不判失败 */
export const SMOKE_ALLOWLIST: readonly string[] = [
  '/settings 点「×1」', // 战报速度默认 ×1
  '/settings 点「跟随系统」', // 主题默认跟随系统
  '/inventory 弹窗内点「不设」' // 智能收纳的阶级线默认「不设」
]

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 干净重试按名定位按钮的正则。
 *
 * - 容忍 CJK 字间空格多寡(如「战 力▸拆解」)
 * - 容忍**数字**不同:「深入探寻小险 … 一胜约 219 石」这类按钮名里嵌着当次生成的数值,
 *   下一轮再点必然换了数。按字面精确匹配的话 `cleanRetry` 永远找不到它、一律判成
 *   「干净态无法单独复现」—— 那条读数是假的,该按钮其实从未被单独验证过。
 *   只把数字段松开,文字骨架仍须逐字相同。
 */
export function namePattern(label: string): RegExp {
  /*
   * 先摘数字段再做转义。
   *
   * 反过来做不行:escapeRe 会把小数点写成 `\.`,之后再按 `[.,]` 找数字边界就找不到分隔符,
   * 一段 `1.4` 会被拆成两半来匹配(实测「遇险 ×1.4」与「×1.6」之间认不出来)。
   */
  const NUM = '\u0000'
  const body = label
    .replace(/\d+(?:[.,]\d+)*[万亿]?/g, NUM)
    .split(NUM)
    .map(escapeRe)
    .join('\\d+(?:[.,]\\d+)*[万亿]?')
    .replace(/\s+/g, '\\s+')
  return new RegExp('^' + body + '$')
}

export type SmokeDecision = { bucket: 'dead' | 'silent'; line: string }

/**
 * cleanResult 来自 ui-smoke 的干净重试:
 *   true   单独点有变化 → 功能正常(读数)
 *   false  单独点也无变化 → 真死控件(判失败)
 *   null   干净态找不到该按钮 → 无法复现(读数)
 * 白名单优先,恒为读数。
 */
export function classifySmoke(
  route: string,
  kind: 'page' | 'modal',
  label: string,
  cleanResult: boolean | null,
  allowlist: readonly string[] = SMOKE_ALLOWLIST
): SmokeDecision {
  const verb = kind === 'modal' ? '弹窗内点' : '点'
  const entry = `${route} ${verb}「${label}」`
  if (allowlist.includes(entry)) return { bucket: 'silent', line: `${entry}(幂等选中项,不判失败)` }
  if (cleanResult === true) {
    return { bucket: 'silent', line: `${route} 干净重试有变化(功能正常,抑制误报):${verb}「${label}」` }
  }
  if (cleanResult === null) return { bucket: 'silent', line: `${entry}(干净态无法单独复现,不判失败)` }
  return { bucket: 'dead', line: entry }
}
