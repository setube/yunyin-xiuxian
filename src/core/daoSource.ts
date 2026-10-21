/**
 * 道源开销的纯判据。
 *
 * 天界各处此前各写一句「道源不足 X」:只报总价,不报实际还差多少,
 * 而玩家在卡面上明明已经看见余额。这里让按钮、服务拒因与瞬时扣款失败
 * 共用同一份差额,口径与资源类 subClamp 同向。
 */
import type { GNum } from '@/types'
import { gn, gte, subClamp } from '@/utils/gnum'
import { formatGN } from '@/utils/format'

export interface DaoSourceShortfall {
  /** 道源尚差;足够时为 0 */
  short: GNum
  /** 可直接放进按钮与 toast 的拒因;足够时为 null */
  reason: string | null
}

/** 界面用的中文差额:只给按钮一行,不带「道源」前缀由调用方补 */
export function daoSourceShortText(cost: number, balance: number): string {
  return formatGN(daoSourceShortfall(cost, balance).short)
}

/** 按道源总价与当前余额算实际差额 */
export function daoSourceShortfall(cost: number, balance: number): DaoSourceShortfall {
  const need = Math.max(0, Math.floor(cost))
  const short = subClamp(gn(need), gn(Math.max(0, Math.floor(balance))))
  return {
    short,
    reason: gte(gn(balance), gn(need)) ? null : `道源尚差 ${formatGN(short)}`
  }
}
