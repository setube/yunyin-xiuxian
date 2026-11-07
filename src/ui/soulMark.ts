import { SOUL_GRADES, soulGradeDef, type SoulGradeDef } from '@/data/souls'

/**
 * 器魂形制。
 *
 * 器魂有六阶(朦胧 → 化真),而界面此前只靠一个字色区分:同一枚「锋魂」,
 * 一阶与六阶长得分毫不差,只是「锋」字深了一点。颜色是连续量,读不出层数;
 * 可数的线索要靠形制 —— 这里给两样:
 *
 *   阶点(pips):阶数 = 点数的等值,一阶一点、六阶六点。数得出来,不必比色。
 *   魂环(halo):最上阶(化真)独有的一圈外环。与 `luster` 同一条铁律:
 *     每阶都加一圈等于每阶都没有,所以只给最上阶。
 *
 * 阈值不另立:`SOUL_GRADES` 就是唯一事实源,顶阶取表尾。
 * 色值也不在这里 —— 器魂色本来就在 `data/souls.ts`,本模块只转发。
 */

/** 器魂形制:点数与是否最上阶;非有限阶数退回一阶(宁可不加,不加错) */
export interface SoulMark {
  /** 阶点枚数 1~6,与阶数同值 */
  pips: number
  /** 是否最上阶(化真) */
  top: boolean
  /** 读屏与 title 用的说法:品阶名,复用 data/souls 的既有状态词 */
  label: string
  /** 阶色,取自 data/souls 唯一事实源 */
  color: string
}

/** 器魂阶数上限;与 `SOUL_GRADES` 表长同源,不另写 6 */
export const SOUL_TOP_GRADE = SOUL_GRADES.length - 1

/** 阶号夹进合法区间;与 `soulGradeDef` 同口径,坏档不会取到 undefined */
export function clampSoulGrade(grade: number): number {
  if (!Number.isFinite(grade)) return 0
  const n = Math.floor(grade)
  if (n < 0) return 0
  if (n > SOUL_TOP_GRADE) return SOUL_TOP_GRADE
  return n
}

/** 器魂阶位形制:点数取阶数 + 1(一阶一点),最上阶另有魂环 */
export function soulMark(grade: number): SoulMark {
  const rank = clampSoulGrade(grade)
  const def: SoulGradeDef = soulGradeDef(rank)
  return { pips: rank + 1, top: rank >= SOUL_TOP_GRADE, label: def.name, color: def.color }
}

/**
 * 器魂档色作**正文**用时的文字色。
 *
 * 与天赋同一把尺:两端档(朦胧 #857F70 / 化真 #C9A227)的原色当正文过不了 AA,另给一档;
 * 中间四档的 jade / azure / violet-ink / amber-ink 本就达标,直接复用。
 * 装饰处(封印章、阶点、光环)仍用 `SOUL_GRADES[].color`。
 */
const TEXT_TONE: Partial<Record<number, string>> = {
  0: 'var(--color-talent-mortal-text)',
  5: 'var(--color-talent-dao-text)'
}

/** 第 rank 档当正文用时的字色;未登记的档回落到原色 */
export function soulGradeTextColor(rank: number): string {
  const def = soulGradeDef(rank)
  return TEXT_TONE[def.rank] ?? def.color
}
