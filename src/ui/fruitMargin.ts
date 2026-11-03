import { effectiveDaoFruit } from '@/core/statsCalc'

/**
 * 道果的边际形制。
 *
 * 道果是全作唯一跨世保留的贵重物,而它的收益是一条**递减**曲线:
 * 第 N 枚的边际效用 ∝ N^0.9 − (N−1)^0.9,越往后越薄。
 * 界面此前把这件事写成四个字「边际渐减」,外加一个两位小数的百分比 ——
 * 玩家读到的是「好像会变少」,而不是「已经薄到什么程度」。
 *
 * 这一层把递减做成可数、可看的形制:
 *   边际刻度(pips):本枚还剩几成力,满格为 6 —— 一枚新果满格,第十枚只剩一格。
 *                  分段而非连续条:数得出来,不必比长度。
 *   弧线(points):最近若枚的边际效率曲线,供画成折线;
 *                  下跌这件事在图形里比在文字里直接。
 *
 * 算式只有一个来源:`effectiveDaoFruit`(即 `n^DAO_FRUIT_SOFT_EXP`)。本模块不重写它,
 * 也不引入第二套阈值 —— 判据钉住这条同源关系。
 */

/** 边际刻度的满格数 */
export const MARGIN_PIPS = 6

/**
 * 第 n 枚道果的**边际**有效收益占比:相对「第一枚」的百分比。
 *
 * 第一枚恒为 100(它就是基准);n → ∞ 时趋近 0 但永不为 0。
 * n ≤ 0 时返回 0 —— 一枚都还没有时不该显示边际力。
 */
export function marginalShare(owned: number): number {
  const n = Math.floor(owned)
  if (!Number.isFinite(n) || n <= 0) return 0
  const prev = effectiveDaoFruit(n - 1)
  const cur = effectiveDaoFruit(n)
  const first = effectiveDaoFruit(1)
  if (first <= 0) return 0
  return ((cur - prev) / first) * 100
}

/**
 * 边际刻度:把「还剩几成力」折成 0~6 格。
 * 用四舍五入而非向下取整 —— 十枚之后还剩 4% 的力,向下取整会一路读成 0 格,
 * 与「边际渐减但永不为 0」的实情相反。
 */
export function marginPips(owned: number): number {
  const share = marginalShare(owned)
  if (share <= 0) return 0
  const raw = (share / 100) * MARGIN_PIPS
  return Math.max(1, Math.min(MARGIN_PIPS, Math.round(raw)))
}

export interface MarginMark {
  /** 已持有的道果数 */
  owned: number
  /** 本枚的边际有效收益占比(相对第一枚,%) */
  share: number
  /** 边际刻度 0~6 */
  pips: number
  /** 满格 */
  full: boolean
  /** 读屏用:一句可念的说法 */
  label: string
}

/** 一枚道果的边际形制;0 枚时 pips 为 0、label 为空 */
export function marginMark(owned: number): MarginMark {
  const n = Math.max(0, Math.floor(Number.isFinite(owned) ? owned : 0))
  const share = marginalShare(n)
  const pips = marginPips(n)
  return {
    owned: n,
    share,
    pips,
    full: pips >= MARGIN_PIPS,
    label: n <= 0 ? '' : `第 ${n} 枚 · 边际 ${share.toFixed(1)}%`
  }
}

/**
 * 折线点:最近 `span` 枚的边际占比,供画成折线(从第 base+1 枚起)。
 * 跨度默认 8 —— 前几枚的落差最大,画出来是一段能看出「急降后趋平」的形状;
 * 跨度太长(几千枚)时曲线整段贴着底边,等于没画。
 */
export function marginCurve(base: number, span = 8): number[] {
  const from = Math.max(0, Math.floor(base))
  return Array.from({ length: span }, (_, i) => marginalShare(from + i + 1))
}

/**
 * 曲线画成 SVG polyline 的 points 串;坐标系固定 100×24,便于样式里写死尺寸。
 *
 * 画成**阶梯**而不是折线:边际都是逐枚算的,两枚之间不连续;
 * 折线会在两点间连出一条不存在的斜线,读起来像「这期间收益在匀速下滑」。
 *
 * 纵向用**相对量程**:以这一段里的最高为顶、最低贴底。
 * 绝对量程下四十枚之后每枚只剩个位数,所有台阶都糊在底边一条线上(实测):
 * 要看的是「这一段跌了多少」,「离第一枚还有多远」由刻度负责。
 * 量程相同(一段里曲线是平的)时给一条居中的直线,不假装有跌幅。
 */
export function marginCurvePoints(base: number, span = 8, width = 100, height = 24): string {
  const values = marginCurve(base, span)
  if (values.length === 0) return ''
  const step = width / values.length
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min
  const yOf = (v: number): number => {
    if (range < 1e-9) return height / 2
    // 顶部与底部各留 2px,台阶不贴框线
    const t = (v - min) / range
    return height - 2 - t * (height - 4)
  }
  const parts: string[] = []
  values.forEach((v, i) => {
    const x0 = (i * step).toFixed(1)
    const x1 = ((i + 1) * step).toFixed(1)
    const y = yOf(v).toFixed(1)
    parts.push(`${x0},${y}`, `${x1},${y}`)
  })
  return parts.join(' ')
}

