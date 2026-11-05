import type { ArtifactDef } from '@/types'

/**
 * 法宝神通的节奏形制。
 *
 * 每件法宝都带一个神通,而「每隔几回合触发一次」这件事在界面上**一处未读** ——
 * 法宝卡只写「神通「X」:某效果」,不写它多久出手一次。
 *
 * 而节奏正是法宝之间最实质的差别:同样一句「造成伤害」,
 * 三回合一次与五回合一次是两种分量;还有一类是「随身常在」,压根不是按回合数走。
 * 玩家要比较两件法宝值不值得祭炼,最该先看的就是这一项 —— 而它一直藏在数据里。
 *
 * 这一层只做一件事:把 `active.interval` 落成可数的形制。
 *   · `interval = 1` 是**特殊语义**,不是「每 1 回合」:那是「随身常在」型(见 data/artifacts 的注释
 *     与 core/combat.tryStun),故单独成一档,不参与「每 N 回合」的刻度;
 *   · 其余按回合数成刻度,格数 = 间隔,越短越密。
 *
 * 铁律:阈值与语义都取自数据与 core 的既有注释,本模块不另立。
 */

/** 节奏档:随身常在 / 每 N 回合 */
export type ArtifactCadence = 'always' | 'everyN'

/** 间隔刻度的满格数:数据里最长的间隔是 5(见 data/artifacts) */
export const ARTIFACT_CADENCE_MAX = 5

export interface CadenceMark {
  /** 节奏档 */
  cadence: ArtifactCadence
  /** 每几回合一次;随身常在时为 1(原值,不参与刻度) */
  interval: number
  /** 刻度格数:随身常在为 0(不画回合刻度),其余等于间隔 */
  pips: number
  /** 读屏与 title 的说法 */
  label: string
}

/**
 * 一件法宝神通的节奏形制。
 *
 * 坏值按「随身常在」处理:形制是加成,判不出时宁可不画回合刻度,
 * 也不把一件法宝画成「每 99 回合才出一次手」。
 */
export function cadenceMark(def: ArtifactDef | undefined): CadenceMark {
  const raw = def?.active?.interval
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 1
  // interval <= 1 一律是「随身常在」:数据里没有「每 1 回合」这种写法(见 data/artifacts 的注释)
  if (n <= 1) {
    return { cadence: 'always', interval: 1, pips: 0, label: '随身常在' }
  }
  const capped = Math.min(ARTIFACT_CADENCE_MAX, n)
  return {
    cadence: 'everyN',
    interval: n,
    pips: capped,
    label: `每 ${n} 回合一次`
  }
}

/** 间隔刻度:格数等于间隔,全部实心 —— 这里表达的是「多久一次」,不是「走了多远」 */
export function cadencePips(mark: CadenceMark): boolean[] {
  return Array.from({ length: mark.pips }, () => true)
}
