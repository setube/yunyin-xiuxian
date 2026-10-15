/**
 * 灵草五品 —— 灵草的品阶维度(购价已随层级缩放在 core/herbPrice,见下)。
 *
 * 此前 `resources.herb` 是单标量:新手村田埂的青芝与混沌海的道草是同一个数,
 * 于是「新手村的草还能炼混沌道祖的丹」这类反直觉都能成立。分级把「珍贵」本身
 * 做进草里:来源在哪一界,采到的就是哪一品;方子要什么品、就用什么品。
 *
 * 灵石购价与「高贵多少倍」**不在这里**:它依赖 stoneByTier(核心公式),故住在
 * `core/herbPrice.ts`(数据层不依赖核心层)。本模块只留品阶本体的换算口。
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

/** 品阶是否合法(收外来源/存档校验用) */
export function isHerbGrade(v: unknown): v is HerbGrade {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5
}

/**
 * 灵田等级 → 可种出的最高品(单调 LUT)。
 * 每 3 级「破一档」,15 级(品类满级)到顶可种道品。刻意用一张小表而非巧公式:
 * 门槛肉眼可读、好调,不藏玄机。灵田升级不被境界门控,故 fieldHerbGrade 用
 * 「限超前 +1」兜住低境一步到道品(见 dongfu 注释) —— 这张表只是等级上限那半边。
 */
const FIELD_GRADE_UNLOCK_LEVELS: Record<Exclude<HerbGrade, 1>, number> = { 2: 4, 3: 7, 4: 10, 5: 13 }

/** 灵田等级 → 可种最高品(1 起,逐档跃迁,单调) */
export function fieldGradeCap(fieldLv: number): HerbGrade {
  let g: HerbGrade = 1
  for (const grade of [2, 3, 4, 5] as const) if (fieldLv >= FIELD_GRADE_UNLOCK_LEVELS[grade]) g = grade
  return g
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
