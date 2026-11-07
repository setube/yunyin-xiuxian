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

/**
 * 档色作**正文**用时的文字色。
 *
 * 装饰处(标签边框、阶点、`between` 分隔)继续用 `tone` —— 那里只要色差够大。
 * 正文另有线:日主题三张纸底上,凡赋 #857F70 实测 3.50、道赋 #C9A227 2.13,
 * 都低于正文 AA。中间两档的 azure / violet-ink 本就达标,直接复用原色。
 * 与品阶色同一套做法(见 data/qualities 的 TEXT_COLOR):原色管装饰,文字另给一档。
 */
const TEXT_TONE: Partial<Record<number, string>> = {
  1: 'var(--color-talent-mortal-text)',
  4: 'var(--color-talent-dao-text)'
}

/** 第 grade 档当正文用时的字色;未登记的档回落到原色 */
export function talentTextColor(grade: number): string {
  const m = talentMark(grade)
  return TEXT_TONE[m.grade] ?? m.tone
}
