import { SMART_KEEP_PERFECT_ROLL } from '@/data/constants'
import { affixRollText } from './equipText'

/**
 * 词条掷值的形制。
 *
 * 一件装备的词条有一条 `roll`(0~1 均匀):同一条「攻击 +12」,
 * 掷到 0.95 与掷到 0.15 是两种东西 —— 那是装备里最本质的「运气」，
 * 而界面上此前只有一个「浮 95%」的读数,与「浮 15%」长得一模一样。
 *
 * 这一层把掷值落成三档可辨的形制:
 *   满(apex) :达 `SMART_KEEP_PERFECT_ROLL` —— 与「智能收纳」的保留线同一根线,
 *              玩家在收纳时被保留的那条,在详情里也该一眼看得出来。
 *   良(good) :过半但未达满。
 *   常(plain):其余,不挂形制。
 *
 * 铁律:
 *   1. 只给满档重形制(与 `luster` 同一条:每档都加,等于每档都没有);
 *   2. 阈值取自 `data/constants`,本模块不另立;
 *   3. 形制是加成:认不出或坏值时退回「常」,不画错的档。
 */

/** 掷值档;`plain` 不挂形制 */
export type RollGrade = 'apex' | 'good' | 'plain'

/** 良档的下沿:过半。这是「手感」不是经济线,故写在这里而不进 constants */
const GOOD_ROLL = 0.5

export const ROLL_GRADE_NAMES: Record<RollGrade, string> = {
  apex: '满',
  good: '良',
  plain: ''
}

export interface RollMark {
  grade: RollGrade
  /** 档名;plain 为空串,调用点据此不印 */
  name: string
  /** 百分数读数(0~100 取整),与 `affixRollText` 同一口径,不在这里另算一种写法 */
  pct: number
  /** 读屏与 title 的说法 */
  label: string
}

/**
 * 一条词条的掷值形制。
 *
 * 坏值(缺 roll / NaN / 越界)按「常」处理 —— 形制是加成,
 * 判不出时宁可不画,也不把一条坏数据画成「满」。
 */
export function rollMark(roll: number | undefined): RollMark {
  const raw = typeof roll === 'number' && Number.isFinite(roll) ? roll : 0
  const clamped = Math.max(0, Math.min(1, raw))
  const grade: RollGrade = clamped >= SMART_KEEP_PERFECT_ROLL ? 'apex' : clamped >= GOOD_ROLL ? 'good' : 'plain'
  const pct = Math.round(clamped * 100)
  // 读数格式只在一处写:形制只管档位,「浮 N%」仍归 equipText
  const reading = affixRollText(clamped)
  return {
    grade,
    name: ROLL_GRADE_NAMES[grade],
    pct,
    label: grade === 'apex' ? `${reading} · 近满` : reading
  }
}

/**
 * 整件「全满」:每一条词条都达满档。
 *
 * 与 `core/smartKeep.perfectRolls` 是**同一根线**(都取 `SMART_KEEP_PERFECT_ROLL`),
 * 但用途不同 —— 那边是收纳裁决(留不留),这里是形制(惊不惊喜)。
 * 不直接 import 那个函数:它在 `core/` 且拉进 buildDetect / equipGen 一串依赖,
 * 而形制层只需要这一个判定。两处的阈值同源,判据钉住它们不许分叉。
 *
 * 0 条词条不算全满 —— 一件没有词条的装备不该戴「运气极点」的记号。
 */
export function allRollsApex(rolls: readonly (number | undefined)[]): boolean {
  return rolls.length > 0 && rolls.every(r => rollMark(r).grade === 'apex')
}
