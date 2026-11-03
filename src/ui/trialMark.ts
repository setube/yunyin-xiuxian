import { TRIALS } from '@/data/endgame'
import type { TrialDef } from '@/types'

/**
 * 天道试炼形制。
 *
 * 三场试炼(七杀/一线/无回)此前只有一枚共用的金色方印,三张卡长得一样:
 * 「这场难在哪」得逐条读规则。而试炼之间的差别本就在三个可数的量上:
 *   战数(fights):连战几场 —— 七 / 四 / 五;
 *   恢复(healBetweenPct):场间能回几成 —— 三成 / 全满 / 不回;
 *   锚点(anchorTier):本试炼站在梯子的哪一层 —— 23 / 26 / 30。
 *
 * 这一层把它们折成三样形制,不新增数据:
 *   战纹(rank):每场一枚记号,连战越久点越多(七/四/五,封顶七枚);
 *   恢复档(recovery):全满 / 部分 / 无 —— 用**形状**区分(实心/半实心/空心),不只靠色;
 *   层阶(tier):锚点层级,取数据层的 anchorTier,给一条刻度。
 *
 * 铁律:三者都是「这一场怎么打」的事实,不是稀有度;故不使用品阶色。
 */

/** 恢复档:全满 / 部分 / 无 */
export type RecoveryTier = 'full' | 'partial' | 'none'

export interface TrialMark {
  id: TrialDef['id']
  /** 战纹枚数:连战几场就几枚,封顶 7 */
  fights: number
  /** 恢复档 */
  recovery: RecoveryTier
  /** 锚点层级(原样转发) */
  tier: number
  /** 读屏与 title 的说法 */
  label: string
}

/** 战纹封顶数:三场试炼里最长的是七杀(7 场),再多也画不全 */
export const TRIAL_FIGHT_CAP = 7

/**
 * 恢复档判定。
 * 阈值只用「有没有」与「够不够全」两刀,不引入第三个数:
 *   ≥1 全满;> 0 部分;= 0 不回。
 * 与 `core/trialChallenge` 里 `healBetweenPct` 的用法同源(那是场间回血比例)。
 */
export function recoveryOf(healBetweenPct: number): RecoveryTier {
  if (!Number.isFinite(healBetweenPct) || healBetweenPct <= 0) return 'none'
  return healBetweenPct >= 1 ? 'full' : 'partial'
}

/** 一场试炼的形制;战数夹进 1..CAP,坏值退回 1 枚 */
export function trialMark(trial: TrialDef): TrialMark {
  const raw = Math.floor(Number.isFinite(trial.fights) ? trial.fights : 1)
  const fights = Math.max(1, Math.min(TRIAL_FIGHT_CAP, raw))
  const recovery = recoveryOf(trial.healBetweenPct)
  return {
    id: trial.id,
    fights,
    recovery,
    tier: trial.anchorTier,
    label: `${trial.name} · 连战 ${trial.fights} 场 · ${RECOVERY_LABEL[recovery]}`
  }
}

/** 恢复档的说法,复用卡面上已有的措辞 */
export const RECOVERY_LABEL: Record<RecoveryTier, string> = {
  full: '场间全复',
  partial: '场间部分',
  none: '场间不回'
}

/** 三场试炼全取形制;用于判据核对每一场都登记得到 */
export function trialMarks(): TrialMark[] {
  return TRIALS.map(trialMark)
}

/**
 * 档位在全部试炼里的相对位置(0~1),供画「这条梯子上的哪一段」。
 * 取三场试炼的最小/最大 anchorTier 为两端 —— 不写死 23 与 30,
 * 将来增删试炼时这条刻度自动跟上。
 */
export function tierPosition(tier: number): number {
  const tiers = TRIALS.map(t => t.anchorTier)
  const lo = Math.min(...tiers)
  const hi = Math.max(...tiers)
  if (!Number.isFinite(tier) || hi <= lo) return 0
  return Math.max(0, Math.min(1, (tier - lo) / (hi - lo)))
}
