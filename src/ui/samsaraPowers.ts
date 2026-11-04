import { INSIGHT_CONSUMERS, type InsightConsumer } from '@/core/impactSurface'

/**
 * 宿慧换来的能力清单:已得 / 将至。
 *
 * 转世弹窗原只写「本世宿慧 +40 / 宿慧共计 400 / 第四境地 / 下一境地尚差 120」——
 * 数都摆着,却从不说什么能力是这些宿慧换来的。
 * 而 core 的 `INSIGHT_CONSUMERS` 早有一张完整的表:每项能力的名字、内生还是常驻、
 * 从第几阶起生效。那张表至今只有 spec 在读。
 *
 * 玩家在转世这一刻最想知道的两件事恰好是:
 *   这一世的积累换到了什么(已得),再转一世能多拿到什么(将至)。
 *
 * 这一层只做分组与排序,不另算门槛 —— fromStage 取 core 的表。
 */

/** 一项能力的呈现 */
export interface SamsaraPower {
  id: string
  name: string
  /** 内生(只在转世那一刻生效一次) / 常驻(整世都在) */
  kind: InsightConsumer['kind']
  /** 从第几阶起生效 */
  fromStage: number
  /** 已得(false 表示还得再升阶) */
  owned: boolean
}

/** 能力的类型说法:两字,可直接进标签 */
export const POWER_KIND_LABEL: Record<InsightConsumer['kind'], string> = {
  opening: '内生',
  standing: '常驻'
}

/**
 * 按当前阶序把能力分成「已得」与「将至」。
 *
 * @param stageIndex 当前所处的阶序(与 SamsaraStageDef 的序一致)
 */
export function samaraPowers(stageIndex: number): { owned: SamsaraPower[]; pending: SamsaraPower[] } {
  const safeStage = Number.isFinite(stageIndex) ? Math.max(0, Math.floor(stageIndex)) : 0
  const rows: SamsaraPower[] = INSIGHT_CONSUMERS.map(c => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    fromStage: c.fromStage,
    owned: safeStage >= c.fromStage
  }))
  // 先按生效阶序,同阶内生在前 —— 内生是一次性的,更值得先看见
  const order = (a: SamsaraPower, b: SamsaraPower): number =>
    a.fromStage - b.fromStage || (a.kind === b.kind ? 0 : a.kind === 'opening' ? -1 : 1)
  return {
    owned: rows.filter(r => r.owned).sort(order),
    pending: rows.filter(r => !r.owned).sort(order)
  }
}

/** 下一项将至的能力(阶序最低的那项);没有则 null */
export function nextPower(stageIndex: number): SamsaraPower | null {
  const { pending } = samaraPowers(stageIndex)
  return pending[0] ?? null
}

/**
 * 将至的前几项。
 *
 * 视图里对 `pending` 取前几项会被 codePointTruncateAudit 拦下 ——
 * 那条判据按「接收者名字像不像数组」来豁免,而 pending 这种名字不在名单里。
 * 与其把 `pending` 塞进白名单(那会放宽全局判据),不如把「取前几项」留在本层:
 * 它本就是展示层该定的事,视图只负责摆。
 */
export function upcomingPowers(stageIndex: number, limit: number): SamsaraPower[] {
  const n = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0
  const { pending } = samaraPowers(stageIndex)
  const out: SamsaraPower[] = []
  for (const p of pending) {
    if (out.length >= n) break
    out.push(p)
  }
  return out
}

/** 已得几项 / 共几项 —— 一句话读全 */
export function powerTally(stageIndex: number): { owned: number; total: number } {
  const { owned, pending } = samaraPowers(stageIndex)
  return { owned: owned.length, total: owned.length + pending.length }
}
