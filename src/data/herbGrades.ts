/**
 * 灵草五品 —— 灵草的品阶维度与灵石购价。
 *
 * 此前 `resources.herb` 是单标量:新手村田埂的青芝与混沌海的道草是同一个数,
 * 于是「新手村的草还能炼混沌道祖的丹」这类反直觉都能成立。分级把「珍贵」本身
 * 做进草里:来源在哪一界,采到的就是哪一品;方子要什么品、就用什么品;灵石要买草,
 * 得按品明码标价,×10 阶梯一路到一千万封顶。
 *
 * 唯一事实源:分档表在 `HERB_GRADE_BANDS`,`herbGradeOfMajor` 是唯一的换算口;
 * 业务代码不许再抄一段境界→品阶的 if 链(要新的界域就改这张表)。
 */
import { MAX_MAJOR, REALMS, WORLD_BREAK_MAJOR } from './realms'

/** 灵草品阶:1 凡品 → 5 道品(混沌海之巅) */
export type HerbGrade = 1 | 2 | 3 | 4 | 5

export const HERB_GRADES: readonly HerbGrade[] = [1, 2, 3, 4, 5]

/** 品阶全名(界面与人话) */
export const HERB_GRADE_NAMES: Record<HerbGrade, string> = {
  1: '凡品灵草',
  2: '灵品灵草',
  3: '仙品灵草',
  4: '神品灵草',
  5: '道品灵草'
}

/** 品阶短名(列表里用) */
export const HERB_GRADE_SHORT: Record<HerbGrade, string> = {
  1: '凡品',
  2: '灵品',
  3: '仙品',
  4: '神品',
  5: '道品'
}

/**
 * 凡品草的地价(灵石/株)—— 购价算法的锚。
 *
 * 凡品是新手村的草:千万别说它贱到白给,它是「草比石贵」这一整条宣言的起点。
 */
export const HERB_GROUND_PRICE = 1_000

/**
 * 每一品的珍贵倍率:高一品,难采十倍。
 *
 * 「珍贵程度」在这里就是**品距**(herbBuyPrice 里的 `grade - 1`):每高一个品阶,
 * 稀缺就多一个量级 —— 这一品的东西,是那一界花了十倍的界膜力气才长出来的。
 */
export const HERB_RARITY_GROWTH = 10

/**
 * 灵石购价算法(株):地价 × 珍贵倍率^品距 —— **不是查表,是公式**。
 *
 * 顶价 = 公式在道品上的产出(1000 × 10^4 = 1000 万),**不另行封顶**。
 * 高点照「草比石贵」:石头是挂机油井、后期闲置;草是炼丹根本、高品稀缺。
 */
export function herbBuyPrice(grade: HerbGrade): number {
  return HERB_GROUND_PRICE * HERB_RARITY_GROWTH ** (grade - 1)
}

/** 品阶是否合法(收外来源/存档校验用) */
export function isHerbGrade(v: unknown): v is HerbGrade {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5
}

/**
 * 品阶与境界的分档表:[起始 major, 结束 major, 品阶]。
 *
 * 人间界前中后期分两品(0~4 凡品 / 5~8 灵品),仙界 9~13 仙品,神界 14~17 神品,
 * 混沌海 18~20 道品 —— 五档对齐四大界域,混沌海至高方子(混沌道祖 20)只认道品。
 */
export const HERB_GRADE_BANDS: ReadonlyArray<readonly [number, number, HerbGrade]> = [
  [0, 4, 1],
  [5, 8, 2],
  [WORLD_BREAK_MAJOR, 13, 3],
  [14, 17, 4],
  [18, MAX_MAJOR, 5]
]

/**
 * 某品阶做成一句「喂哪个境界的方子」—— 由 HERB_GRADE_BANDS 反查 + REALMS 境名,
 * 给坊市/方子的「这品草是干嘛的」用(不新立第二张分档表)。
 */
export function herbGradeBandLabel(grade: HerbGrade): string {
  const band = HERB_GRADE_BANDS.find(b => b[2] === grade)
  if (!band) return ''
  const [from, to] = band
  const fromName = REALMS[from]?.name
  const toName = REALMS[to]?.name
  return fromName && toName ? `${fromName}~${toName}境方子所用` : `第 ${from}~${to} 境的方子所用`
}

/** 某大境界的灵草品阶(跨境即换品 —— 灵草跟着人走,不在原地等) */
export function herbGradeOfMajor(major: number): HerbGrade {
  const m = Math.max(0, Math.min(MAX_MAJOR, major))
  for (const [from, to, grade] of HERB_GRADE_BANDS) {
    if (m >= from && m <= to) return grade
  }
  return 1
}
