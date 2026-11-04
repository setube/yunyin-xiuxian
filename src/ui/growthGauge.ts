/**
 * 修行倍率的刻度。
 *
 * 建号页掷完灵根,只给一个数:「修行倍率 ×1.11」。
 * 而 1.11 算好还是不好,玩家无从判断 —— 同一个界面上有五个资质数、一个「杂灵根」标签、
 * 一句「不限次数」,唯独没有「这一手在你可能拿到的牌里排哪一段」。
 *
 * 倍率是三个因子相乘出来的(见 core/linggenGen):
 *   平均资质 / 60 × 根数系数 × 特殊灵根 1.2
 * 因子都有上界与下界,所以倍率的理论区间可以算出来,不必采经验值:
 *   最低 五根杂灵根 资质 40 无特殊 → (40/60) × 0.90 = 0.60
 *   最高 单根天灵根 资质 100 有特殊 → (100/60) × 1.60 × 1.20 = 3.20
 *   混沌灵根另走一条:资质 85~100 → (a/60) × 1.6 × 1.5 ≈ 3.40~4.00
 * 故区间取 [0.6, 4.0]。混沌灵根落在最右端那一小截 —— 它确实是异数。
 *
 * 这一层只把倍率摆到区间里的位置上,不替玩家判断「要不要重掷」。
 */

/** 倍率区间的两端;由 core 的因子上下界推出,不采经验值 */
export const MULT_FLOOR = 0.6
export const MULT_CEIL = 4.0

/** 倍率在区间里的位置 0~1 */
export function growthPosition(mult: number): number {
  if (!Number.isFinite(mult)) return 0
  const span = MULT_CEIL - MULT_FLOOR
  if (span <= 0) return 0
  return Math.max(0, Math.min(1, (mult - MULT_FLOOR) / span))
}

/** 倍率落在一枚刻度上的位置,附带读屏与文案用的说法 */
export interface GrowthGauge {
  mult: number
  /** 在 [MULT_FLOOR, MULT_CEIL] 上的位置 0~1 */
  position: number
  /** 区间的两个端点,供轴上标注 */
  floor: number
  ceil: number
  /**
   * 这一手的档次。按位置分四段,与建号页已有的「杂灵根 / 伪灵根 / …」不是一回事:
   * 那个说的是根数形状,这个说的是最终倍率。
   */
  tier: 'low' | 'mid' | 'high' | 'peak'
  /** 档次的说法(四个字以内,可直接进标签) */
  label: string
}

const TIER_LABEL: Record<GrowthGauge['tier'], string> = {
  low: '偏低',
  mid: '寻常',
  high: '上乘',
  peak: '绝品'
}

/** 由倍率取整枚刻度 */
export function growthGauge(mult: number): GrowthGauge {
  const m = Number.isFinite(mult) && mult > 0 ? mult : 1
  const position = growthPosition(m)
  /*
   * 四档按真实牌型切,不按四等分:
   *   · 五根杂灵根资质 40 → 0.60(下界);资质 70 → 1.05,pos 0.13
   *   · 三根灵根资质 70 → 1.34,pos 0.22
   *   · 单根异灵根资质 70 → 1.87,pos 0.37;真灵根(二根)70 → 1.58,pos 0.29
   *   · 单根天灵根资质 80 → 2.13,pos 0.45
   *   · 变异灵根资质 70 → 2.24,pos 0.48;资质 100 → 3.20,pos 0.77
   *   · 混沌灵根资质 85 → 3.40,pos 0.82;资质 100 → 4.00,pos 1.00
   * 故:0.20 以下多是杂/伪灵根,0.20~0.45 是三五根的中等资质,
   * 0.45~0.70 是真灵根与单根好资质,0.70 以上是变异与混沌 —— 后者才是「绝品」。
   */
  const tier: GrowthGauge['tier'] = position < 0.2 ? 'low' : position < 0.45 ? 'mid' : position < 0.7 ? 'high' : 'peak'
  return { mult: m, position, floor: MULT_FLOOR, ceil: MULT_CEIL, tier, label: TIER_LABEL[tier] }
}
