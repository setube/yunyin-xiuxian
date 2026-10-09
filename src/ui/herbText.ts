/**
 * 灵草的展示口径 —— 五品不可互相换算(丹方按品收),界面「存量」不得再报跨品之和
 * (`resources.herb` 那种总和回答不了「够不够炼」),只应逐品陈列。这里把逐品陈列
 * 收敛成一处,坊市摆摊 / 炼丹弹窗 / 材料页共用同一种口径。
 */
import { HERB_GRADES, HERB_GRADE_SHORT, type HerbGrade } from '@/data/herbGrades'

export interface HeldHerbGrade {
  grade: HerbGrade
  name: string
  count: number
}

/** 逐品列出持有 >0 的灵草(空则 []——坊市摆摊同款过滤) */
export function heldHerbGrades(herbOf: (g: HerbGrade) => number): HeldHerbGrade[] {
  return HERB_GRADES.filter(g => herbOf(g) > 0).map(g => ({
    grade: g,
    name: HERB_GRADE_SHORT[g],
    count: herbOf(g)
  }))
}

/**
 * 一括灵草存量文案:仅列持有 >0 的品,count 走 fmt(防大数撑破格子)。
 * 「凡品×40 · 灵品×120」;空则「无」。
 */
export function herbStashText(herbOf: (g: HerbGrade) => number, fmt: (n: number) => string = String): string {
  const held = heldHerbGrades(herbOf)
  if (!held.length) return '无'
  return held.map(h => `${h.name}×${fmt(h.count)}`).join(' · ')
}
