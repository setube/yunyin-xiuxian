/** 道源开销的纯判据:按钮、服务拒因与瞬时扣款失败共用同一份差额,口径与资源类 subClamp 同向 */
import type { GNum } from '@/types'
import { gn, gte, subClamp } from '@/utils/gnum'
import { formatGap } from '@/utils/format'

export interface DaoSourceShortfall {
  /** 道源尚差;足够时为 0 */
  short: GNum
  /** 按钮与 toast 用的拒因;足够时为 null */
  reason: string | null
}

/** 按钮用差额文本;不带「道源」前缀,由调用方补 */
export function daoSourceShortText(cost: number, balance: number): string {
  return formatGap(daoSourceShortfall(cost, balance).short)
}

export function daoSourceShortfall(cost: number, balance: number): DaoSourceShortfall {
  const need = Math.max(0, Math.floor(cost))
  const short = subClamp(gn(need), gn(Math.max(0, Math.floor(balance))))
  return {
    short,
    reason: gte(gn(balance), gn(need)) ? null : `道源尚差 ${formatGap(short)}`
  }
}
