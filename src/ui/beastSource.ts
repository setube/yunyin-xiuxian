import { BEAST_EFFECT_PER_LEVEL } from '@/data/buildings'

/**
 * 灵兽加成的来源拆解。
 *
 * 灵兽卡上只写它现在加多少(「+12%」),而这个数是两步放大出来的:
 *   ① 灵兽园等级:`1 + 等级 × BEAST_EFFECT_PER_LEVEL`
 *   ② 安抚灵兽的 buff(`beastPct`,另一种来路)
 * 玩家看到「+12%」时,看不出这十二个点里有多少是园子给的、有多少是安抚给的;
 * 而这两样一个靠花灵石升建筑、一个靠用丹,决策完全不同。
 *
 * 这一层把两个倍率分开报,不改任何数值 —— `petModsFor` 仍按原式相乘。
 */

export interface BeastSourceMark {
  /** 灵兽园等级 */
  gardenLevel: number
  /** 园子放大倍率:1 + 等级 × 每级 */
  gardenMult: number
  /** 安抚放大倍率:1 + beastPct */
  sootheMult: number
  /** 两者合计倍率 */
  totalMult: number
  /** 园子与安抚各自贡献的百分点(合计 − 1 拆成两段) */
  gardenPct: number
  soothePct: number
}

/**
 * 把灵兽当前的实际倍率拆成两段来源。
 *
 * @param gardenLevel 灵兽园等级
 * @param beastPct 安抚那一路的加成(0.3 即 +30%)
 */
export function beastSources(gardenLevel: number, beastPct: number): BeastSourceMark {
  const lv = Number.isFinite(gardenLevel) ? Math.max(0, Math.floor(gardenLevel)) : 0
  const pct = Number.isFinite(beastPct) ? Math.max(0, beastPct) : 0
  const gardenMult = 1 + lv * BEAST_EFFECT_PER_LEVEL
  const sootheMult = 1 + pct
  return {
    gardenLevel: lv,
    gardenMult,
    sootheMult,
    totalMult: gardenMult * sootheMult,
    gardenPct: (gardenMult - 1) * 100,
    soothePct: pct * 100
  }
}

/**
 * 两段来源的刻度:各占几格。
 *
 * 以两段中较长的为准铺十格 —— 两段并排,谁占比大一目了然;
 * 不按合计(合计可以到几倍,格就失去意义)。
 */
export const BEAST_PIP_STEPS = 10

export interface BeastSourcePips {
  garden: boolean[]
  soothe: boolean[]
}

/** 两段来源各铺十格,按两段里的较大值归一 */
export function beastSourcePips(mark: BeastSourceMark): BeastSourcePips {
  const peak = Math.max(mark.gardenPct, mark.soothePct, 0)
  const fill = (pct: number): boolean[] => {
    const n = peak <= 0 ? 0 : Math.round((Math.max(0, pct) / peak) * BEAST_PIP_STEPS)
    return Array.from({ length: BEAST_PIP_STEPS }, (_, i) => i < n)
  }
  return { garden: fill(mark.gardenPct), soothe: fill(mark.soothePct) }
}
