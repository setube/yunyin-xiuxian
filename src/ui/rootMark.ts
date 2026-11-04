import type { SpiritRoot } from '@/types'

/**
 * 灵根资质刻度。
 *
 * 灵根在角色页与建号页都只画成一行圆圈,资质写在圈下(「88」):
 * 三根火水土并排时,哪一根是主根、它高多少,得逐个读数字再比。
 *
 * 而资质在游戏里是有分工的:它决定**主根**(灵根次序有意义,见 core/fate 的种子),
 * 决定同源功法与机缘的偏向权重 —— 但**不**直接加修行速度(见 data/linggenAffinity 的红线)。
 * 故这一层只做一件事:把资质落成刻度,让「主根是哪一根」一眼看出来。
 *
 * 刻度上限取数据里的资质天花板,不写死 100 —— 改数据时跟着变。
 */

/** 资质的显示上限:滚动区间 40~100,再叠转世地板后夹到 100 */
export const APTITUDE_CAP = 100

/** 一格代表多少资质:10 点一格,十格为满。够读出「88 与 62 差两格半」这种量级 */
export const APTITUDE_PER_PIP = 10
export const APTITUDE_PIPS = APTITUDE_CAP / APTITUDE_PER_PIP

export interface RootMark {
  element: SpiritRoot['element']
  /** 夹过界的资质 */
  aptitude: number
  /** 实心格数,0~10 */
  pips: number
  /** 是否本组资质最高的一根 */
  top: boolean
}

/**
 * 一组灵根的刻度。
 *
 * @param roots 灵根表(次序有意义,保持原序)
 */
export function rootMarks(roots: readonly SpiritRoot[]): RootMark[] {
  const cleaned = roots.map(r => ({
    element: r.element,
    aptitude: Number.isFinite(r.aptitude) ? Math.max(0, Math.min(APTITUDE_CAP, Math.round(r.aptitude))) : 0
  }))
  const peak = cleaned.reduce((m, r) => Math.max(m, r.aptitude), 0)
  return cleaned.map(r => ({
    element: r.element,
    aptitude: r.aptitude,
    pips: Math.round(r.aptitude / APTITUDE_PER_PIP),
    // 并列最高时都标:两根同资质,没有理由只亮一根
    top: peak > 0 && r.aptitude === peak
  }))
}

/** 十格:已满的为 true。模板不再自己数 */
export function rootPips(pips: number): boolean[] {
  const n = Number.isFinite(pips) ? Math.max(0, Math.min(APTITUDE_PIPS, Math.round(pips))) : 0
  return Array.from({ length: APTITUDE_PIPS }, (_, i) => i < n)
}
