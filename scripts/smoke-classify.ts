/**
 * 冒烟「死按钮」分类的**纯决策** —— 与 Playwright 无关,可被 vitest 直接单测。
 *
 * round-271 把「点了没反应」从只读数升级为判失败(dead → exitCode 1),但那段判定
 * (白名单命中 / 干净重试三态 → dead|silent)此前只藏在 9 分钟的 e2e 冒烟脚本里、
 * 没有任何单测 —— 判定器自己一出回归,冒烟要么误报、要么漏掉真死控件,CI 却无症状。
 * 于是把纯决策抽到这里(scripts/ui-smoke.mjs 与本单元测共用这一份,单一来源)。
 */
/** 幂等选中项:点「当前已选中值」本身就该没反应(×1 当已在 ×1、跟随系统当已开) —— 属设计内,不判失败 */
export const SMOKE_ALLOWLIST: readonly string[] = [
  '/settings 点「×1」', // 战报速度默认 ×1,点当下的选中值 = 无变化
  '/settings 点「跟随系统」' // 主题默认跟随系统,点当下的选中值 = 无变化
]

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 干净重试定位同一按钮用的可匹配正则(容忍 CJK 之间的空格,如「战 力▸拆解」) */
export function namePattern(label: string): RegExp {
  return new RegExp('^' + escapeRe(label).replace(/\s+/g, '\\s+') + '$')
}

export type SmokeDecision = { bucket: 'dead' | 'silent'; line: string }

/**
 * 死按钮分类的纯决策。cleanResult 由 ui-smoke 的干净重试给出:
 *   true   单独点有变化 → 功能正常(读数,不判失败)
 *   false  单独点也无变化 → 真死控件(判失败)
 *   null   干净态找不到该按钮(如弹窗按钮在干净态未开)→ 无法复现(读数,不误伤)
 * 白名单(幂等选中项)优先于一切,恒为读数。
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
