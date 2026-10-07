/**
 * 集合运算 —— 纯数值,与游戏语义无关。
 */

/**
 * Jaccard 距离(0 完全重合 ~ 1 全异)。
 *
 * 两个字符串集的重合度,用于"两套构建/两界生态有多像"这类判据。
 * 语义约定:两个空集视为完全相同(距离 0)。
 */
export function jaccardDistance(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter += 1
  const union = a.size + b.size - inter
  return 1 - inter / union
}
