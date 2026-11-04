import { TALENT_GRADE_COLORS, TALENT_GRADE_NAMES } from '@/data/talents'

/**
 * 天赋品阶形制。
 *
 * 天赋四档(凡赋 / 灵赋 / 天赋 / 道赋),而界面上只有两种表示:
 *   轮回择姿时写品阶名(「灵赋」);
 *   转世弹窗里已持有的天赋只有一枚彩色标签,品阶纯粹靠颜色区分。
 *
 * 同一个东西在两处长得不一样,玩家得学两套;而颜色是连续量 ——
 * 四档里「灵赋」的靛与「天赋」的紫放在一起,谁高一档读不出来。
 *
 * 这一层只做一件事:把四档落成**可数的阶点**(一档一点、四档四点),
 * 品阶名与颜色仍取 data/talents 的既有常量,不另立。
 */

/** 档数:0 是占位,真档 1~4 */
export const TALENT_GRADES = TALENT_GRADE_NAMES.length - 1

export interface TalentMark {
  /** 夹过界的档位 1~4 */
  grade: number
  /** 品阶名,转发 data 的既有常量 */
  name: string
  /** 色,转发 data 的既有常量 */
  tone: string
  /** 阶点:几档就几点 */
  pips: number
  /** 是否最上档(道赋) */
  top: boolean
}

/** 一档天赋的形制;坏档里的越界档位夹回 1~4 */
export function talentMark(grade: number): TalentMark {
  const g = Number.isFinite(grade) ? Math.max(1, Math.min(TALENT_GRADES, Math.floor(grade))) : 1
  return {
    grade: g,
    name: TALENT_GRADE_NAMES[g]!,
    tone: TALENT_GRADE_COLORS[g]!,
    pips: g,
    top: g === TALENT_GRADES
  }
}

/** 阶点:几档就几点。模板不再自己数 */
export function talentPips(grade: number): boolean[] {
  return Array.from({ length: TALENT_GRADES }, (_, i) => i < talentMark(grade).pips)
}
