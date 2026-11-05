/** 器魂页文案(凝炼代价与余额、散去不可逆、六类形意);页面模板只许调用不许手打(soulText.spec 钉) */
import { soulTypeDef, type SoulTypeId } from '@/data/souls'

export function refineCostLine(cost: number, balanceText: string): string {
  return `入炉毁原器 · 耗道源 ${cost} · 现有 ${balanceText}`
}

export function dissolveNote(): string {
  return '散去不可逆 · 道源不返'
}

/**
 * 器魂的形意一句。
 *
 * 六类器魂各有一句形意(`data/souls` 的 `desc`),而这六枚在界面上只差「阶名 · 类型名」:
 * 锋魂与盾魂的区别,得先知道「锋」与「盾」在战斗里各管什么。数据里那句写得很具体 ——
 * 「此器生来向前,不曾回头,形意里只剩那一分锐」—— 它说的正是这一类魂为什么长成这样。
 * 原先这句只在 `dataTextAudit` 里被扫过文本,从不上界面。
 *
 * 取不到时返回空串:调用点据此不印,而不是印一个假的。
 */
export function soulFlavorText(soul: { type: string }): string {
  const def = soulTypeDef(soul.type as SoulTypeId)
  return typeof def?.desc === 'string' ? def.desc : ''
}
