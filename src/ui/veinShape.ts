import { VEINS, type VeinId } from '@/data/veins'

/**
 * 灵脉形制。
 *
 * 四条脉原先各按「已投 / 本脉上限」填条:主脉 42 点填到 60%,副脉 20 点填到 67% ——
 * **点数多的那条反而显得短**。四条横条长度不是同一把尺量的,「哪条投得多」读不出来,
 * 而这正是这张卡唯一要回答的问题(总容量 100、四脉上限之和 160,必须放弃 60 点)。
 *
 * 这里给两样形制:
 *   共用横轴:四条一律按 0→主脉上限 填,副脉上限在主脉轴上落一枚刻度。
 *            「超额保留」的旧主脉也会越过那枚刻度,越没越过一眼可见。
 *   预算分段:顶上一条按总容量切段的条,四段的长度就是各自点数,
 *            空着的那截就是还能投多少 —— 比原来一根纯色条只说得出总数。
 *
 * 轴长与容量都由调用方传 data/constants 的常数,本模块不另立一把尺。
 */

export interface VeinBand {
  id: VeinId
  /** 该脉已投点数 */
  points: number
  /** 占总容量的百分比 */
  pct: number
}

export interface VeinBudget {
  /** 已投的四段,零点的脉不出段(否则画出一截看不见的空色,还把圆角切开) */
  bands: VeinBand[]
  /** 四脉合计已投 */
  spent: number
  /** 还可投的点数 */
  free: number
  freePct: number
}

/**
 * 总容量上的分段。
 * 超容量的旧档(`veinPoints` 未经 sanitize 时)按容量截断:条只有一根,画出去也无处可见。
 */
export function veinBudget(points: Record<VeinId, number>, capacity: number): VeinBudget {
  const cap = Number.isFinite(capacity) && capacity > 0 ? capacity : 0
  const pctOf = (n: number): number => (cap > 0 ? (n / cap) * 100 : 0)
  const bands: VeinBand[] = []
  let spent = 0
  for (const def of VEINS) {
    const raw = points[def.id] ?? 0
    const n = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
    if (n <= 0) continue
    spent += n
    bands.push({ id: def.id, points: n, pct: pctOf(n) })
  }
  const free = Math.max(0, cap - spent)
  return { bands, spent, free, freePct: pctOf(free) }
}

/**
 * 已投点数落在 0→max 轴上的位置。
 * 超额封顶百分百:旧主脉转副脉后点数可越过副脉上限,条不能画到轴外。
 */
export function axisPct(points: number, max: number): number {
  if (!Number.isFinite(points) || points <= 0) return 0
  if (!Number.isFinite(max) || max <= 0) return 0
  return Math.min(100, (points / max) * 100)
}
