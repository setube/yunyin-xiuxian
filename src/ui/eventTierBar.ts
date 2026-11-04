import type { EventTier, EventTierDef } from '@/core/eventTier'
import { EVENT_TIERS } from '@/core/eventTier'

/**
 * 历练三档的分布条。
 *
 * 历练页顶部写着「途中三档:际遇 · 约每 2 程一次 / 奇缘 · 约每 240 程一次 / 机缘 · 约每 40 程一次」。
 * 这是三句独立的话 —— 想比出哪档更常见,得先把「2 / 240 / 40」三个数在脑子里排一下。
 * 而 core 的 `tierChances` 早算好了三档各自的发生概率,那个函数至今没有任何界面读过。
 *
 * 这一层把三档概率画成一条分段条:一段有多长,就是这档占多少。
 *
 * 为什么按「出事之后」的比例归一,而不按绝对概率:
 *   三档之和 = 出事概率(约 0.09),三条加起来才占整条的一成不到 ——
 *   画出来会是一根几乎空着的槽,三档全挤在最左边一小截,反而更看不清。
 *   玩家要比较的是「这一档比那一档稀多少」,那是三档之间的相对比例。
 *
 * 铁律:概率取 core 的 tierChances,本层不另算一次。
 */

/** 一档在整条上的位置与长度,均为 0~1 的比例 */
export interface TierSegment {
  id: EventTier
  name: string
  /** 界面色(数据层给的 token 名) */
  color: string
  /** 绝对概率(core 原值,可用于文案) */
  chance: number
  /** 在本条上的起点与长度,均按三档之和归一到 0~1 */
  start: number
  length: number
  /** 这一档里已发生的次数(由调用方给;只用于高亮「最近出的那一档」) */
  count?: number
}

/** 三档按「常见 → 罕见」排;数据层的 rarity 就是这个序,不另定 */
function orderedTiers(): EventTierDef[] {
  return [...EVENT_TIERS].sort((a, b) => a.rarity - b.rarity)
}

/**
 * 由 core 的三档概率给出分段条。
 *
 * @param chances core 的 `tierChances` 返回值(绝对值,未归一)
 */
export function tierSegments(chances: Record<EventTier, number>): TierSegment[] {
  const tiers = orderedTiers()
  const safe = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0)
  const values = tiers.map(t => safe(chances[t.id]))
  const total = values.reduce((a, b) => a + b, 0)
  // 全为 0(还没出事过):三档等分,至少让条有形,而不是一根空槽
  if (total <= 0) {
    const each = 1 / tiers.length
    return tiers.map((t, i) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      chance: 0,
      start: each * i,
      length: each
    }))
  }
  const out: TierSegment[] = []
  let acc = 0
  for (const [i, t] of tiers.entries()) {
    const len = values[i]! / total
    out.push({ id: t.id, name: t.name, color: t.color, chance: values[i]!, start: acc, length: len })
    acc += len
  }
  return out
}

/** 最常见的那一档 —— 条上最长的一段 */
export function dominantTier(segments: readonly TierSegment[]): TierSegment | null {
  if (segments.length === 0) return null
  return segments.reduce((a, b) => (b.length > a.length ? b : a))
}

/**
 * 一档的稀度说法:与最常见那档相比,rAre 几倍才有一次。
 *
 * 这是把「约每 2 程 / 约每 240 程」两个数折算成一句人话:
 * 「稀 120 倍」。比让玩家自己拿 240 除 2 快。
 */
export function rarityRatio(segment: TierSegment, base: TierSegment | null): string {
  if (!base || base.id === segment.id) return ''
  if (!(segment.chance > 0) || !(base.chance > 0)) return '暂无'
  const k = base.chance / segment.chance
  if (!Number.isFinite(k) || k < 1.5) return '相当'
  return `稀 ${Math.round(k)} 倍`
}
