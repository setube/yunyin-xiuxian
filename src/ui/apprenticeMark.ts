import { APPRENTICE_MAX_LEVEL, BOND_TITLES, bondTitle } from '@/data/apprentices'

/**
 * 道童形制。
 *
 * 道童卡上此前只有两串文字:「第 7 层」(上限 20)与「道徒」(羁绊五阶)。
 *   —— 第 7 层离满还有多远,得自己拿 7 去比 20;
 *   —— 「道徒」与「记名弟子」哪个更近,得先记住五阶的次序。
 *
 * 这两样本来都是可数的东西,只是写成了读数。
 * 这一层给两样形制,门槛全部取自 data/apprentices 的既有常量与 BOND_TITLES ——
 * 不另立一份。
 */

/** 层数刻度的格数:上限 20 层,每层一格 */
export const LEVEL_PIPS = APPRENTICE_MAX_LEVEL

/** 羁绊阶数:五阶(道童 → 真传) */
export const BOND_STEPS = BOND_TITLES.length

export interface ApprenticeMark {
  /** 层数刻度:已满几格 / 共几格 */
  level: { have: number; total: number }
  /** 是否已至满层 */
  maxed: boolean
  /** 羁绊阶序:0 道童 … 4 真传 */
  bondRank: number
  /** 羁绊阶点:几阶就几点(从 1 起,道童也有一点) */
  bondPips: number
  /** 离下一阶还差几趟;已至最高阶为 null */
  toNextBond: number | null
}

/**
 * 一名道童的形制。
 *
 * @param level 当前层数
 * @param bond 累计完工趟数
 */
export function apprenticeMark(level: number, bond: number): ApprenticeMark {
  const lv = Number.isFinite(level) ? Math.max(0, Math.min(LEVEL_PIPS, Math.floor(level))) : 0
  const b = Number.isFinite(bond) ? Math.max(0, Math.floor(bond)) : 0

  // 阶序取「最后一个门槛不高于 bond 的那一阶」——与 bondTitle 同一判据
  let rank = 0
  for (let i = 0; i < BOND_TITLES.length; i += 1) {
    if (b >= BOND_TITLES[i]!.min) rank = i
  }
  const next = BOND_TITLES[rank + 1]

  return {
    level: { have: lv, total: LEVEL_PIPS },
    maxed: lv >= LEVEL_PIPS,
    bondRank: rank,
    bondPips: rank + 1,
    toNextBond: next ? Math.max(0, next.min - b) : null
  }
}

/** 层数刻度:已满的格为 true,未满为 false。模板不再自己比大小 */
export function levelPips(have: number): boolean[] {
  const n = Number.isFinite(have) ? Math.max(0, Math.min(LEVEL_PIPS, Math.round(have))) : 0
  return Array.from({ length: LEVEL_PIPS }, (_, i) => i < n)
}

/** 与卡上那串字同源:称谓仍取 data 的 bondTitle,不在这里另写 */
export function apprenticeBondLabel(bond: number): string {
  return bondTitle(bond)
}
