import { gongfaMaxLevel } from '@/data/gongfa'
import { peakLabel } from './peakLabel'
import type { GongfaDef } from '@/types'

/**
 * 功法层数形制。
 *
 * 功法行末尾只写「第 5 层」,而各功法的上限不同(密法 3 层、主辅 9 层):
 * 「第 5 层」在一门功法里是过半,在另一门里是练满;「还差几层」得自己拿两个数去减。
 * 主修卡与已习两处都是这个写法。
 *
 * 这一层只做一件事:把层数落成刻度 —— 上限几层就几格,已满几格。
 * 上限取 `gongfaMaxLevel`,那是数据里的唯一事实源(漏配 maxLevel 的秘术不会被练到 9 层)。
 */

/** 一门功法的层数刻度 */
export interface GongfaMark {
  /** 当前层,夹到 0~上限 */
  level: number
  /** 上限层数,取自数据 */
  max: number
  /** 是否已满级 */
  maxed: boolean
  /** 还差几层;已满级为 0 */
  toMax: number
  /** 已满级时的说法;未满返回 null —— 不替玩家算「还差几层」以外的建议 */
  peakLabel: string | null
}

/**
 * 一门功法的层数形制。
 *
 * @param def 功法定义(取上限用)
 * @param level 已习层数
 */
export function gongfaMark(def: GongfaDef | undefined, level: number): GongfaMark {
  const max = Math.max(1, Math.floor(gongfaMaxLevel(def)))
  const lv = Number.isFinite(level) ? Math.max(0, Math.min(max, Math.floor(level))) : 0
  const maxed = lv >= max
  return {
    level: lv,
    max,
    maxed,
    toMax: max - lv,
    peakLabel: maxed ? peakLabel() : null
  }
}

/** 层数刻度:已满的格为 true,未满为 false。格数随上限变,模板不再自己数 */
export function gongfaPips(mark: GongfaMark): boolean[] {
  return Array.from({ length: mark.max }, (_, i) => i < mark.level)
}
