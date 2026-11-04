import { STAGE_GATES, stageIndex, type BondStage } from '@/data/daolu'

/**
 * 道侣三条关系值的形制。
 *
 * 弹窗里缘分 / 信任 / 契合是三根一模一样的蓝条,各填到 0~100。
 * 可推进缘阶要的是三条**各自**过线,而三条的线并不相同 ——
 * 下一阶可能要缘分 50、信任 45、契合 0,于是「契合那条已经满到哪都没用」,
 * 真正卡着的是缘分。而界面一根门槛都没画:玩家得读下面那句「缘分尚浅」才知道,
 * 还得自己回去比对哪根条差多少。
 *
 * 这一层只加一件事:每根条上标出**下一阶的门槛**,并说清这根过没过线。
 * 门槛全部取自 `data/daolu` 的 STAGE_GATES —— 那里已是唯一事实源,不另立一份。
 */

/** 关系值上限,与 core/daoluService 的 CAP 同值 */
export const BOND_METER_CAP = 100

export type BondMeterKey = 'fate' | 'trust' | 'accord'

/** 三根条与门槛字段的对应;顺序即界面次序 */
export const BOND_METERS: { key: BondMeterKey; label: string; short: string }[] = [
  { key: 'fate', label: '缘分', short: '缘分尚浅' },
  { key: 'trust', label: '信任', short: '信任不足' },
  { key: 'accord', label: '契合', short: '道心未契' }
]

export interface BondMeterRow {
  key: BondMeterKey
  label: string
  /** 当前值,0~100 */
  value: number
  /** 当前值的条长百分比 */
  pct: number
  /**
   * 下一阶的门槛在条上的位置,0~100。
   * 没有下一阶(已至道侣)时为 null —— 此时不画刻度,不给人一个不存在的目标。
   */
  gatePct: number | null
  /** 这一根是否已过下一阶的线;无下一阶时为 true */
  met: boolean
}

/**
 * 某一阶推进到下一阶时,三条各自的线与当前值的对照。
 *
 * @param values 当前三条值
 * @param stage 当前缘阶
 */
export function bondMeterRows(values: Record<BondMeterKey, number>, stage: BondStage): BondMeterRow[] {
  const next = nextStageGate(stage)
  return BOND_METERS.map(m => {
    const raw = values[m.key]
    const value = Number.isFinite(raw) ? Math.max(0, Math.min(BOND_METER_CAP, Math.round(raw))) : 0
    const gate = next ? next[m.key] : null
    return {
      key: m.key,
      label: m.label,
      value,
      pct: (value / BOND_METER_CAP) * 100,
      gatePct: gate === null ? null : (gate / BOND_METER_CAP) * 100,
      met: gate === null ? true : value >= gate
    }
  })
}

/** 当前阶的下一阶门槛;已是最高阶时为 null */
export function nextStageGate(stage: BondStage): Record<BondMeterKey, number> | null {
  const g = STAGE_GATES.find(x => stageIndex(x.stage) === stageIndex(stage) + 1)
  if (!g) return null
  return { fate: g.fate, trust: g.trust, accord: g.accord }
}
