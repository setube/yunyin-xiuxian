/**
 * 装备词条位的形制。
 *
 * 装备详情页只写「词条 3 / 5 条」:
 *   —— 还差几个位、这些位能不能洗练出来,得自己拿 3 去比 5;
 *   —— 而 5 这个数不是随手给的,它是品阶的上限(九档从 1 到 9,见 data/qualities 的 affixes[1])。
 *
 * 这一层只做一件事:把「已占几格 / 共几格」落成刻度。
 * 上限一律取 `qualityDef(q).affixes[1]`,与词条生成同源,不另立。
 */

export interface AffixSlotMark {
  /** 已占格数,夹到 0~上限 */
  used: number
  /** 上限格数,取自品阶表 */
  cap: number
  /** 还有几个空位 */
  free: number
  /** 是否已满位 */
  full: boolean
}

/**
 * 一件装备的词条位形制。
 *
 * 上限由调用方按品阶表给出(它自己不去查表):
 * 品阶 → 上限这一跳留在界面那一处,spec 钉着「模板里不写死数字」。
 *
 * @param cap 词条上限
 * @param used 已有词条数
 */
export function affixSlotMark(cap: number, used: number): AffixSlotMark {
  const capN = Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : 0
  const n = Number.isFinite(used) ? Math.max(0, Math.min(capN, Math.floor(used))) : 0
  return { used: n, cap: capN, free: capN - n, full: capN > 0 && n >= capN }
}

/** 词条位刻度:已占的格为 true。格数随品阶变,不是一律五格 */
export function affixSlotPips(mark: AffixSlotMark): boolean[] {
  return Array.from({ length: mark.cap }, (_, i) => i < mark.used)
}
