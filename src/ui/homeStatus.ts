import { BUSY_REASON } from '@/core/endgameActivity'

/** 主页状态行:只报此刻真实状态。「闭关」是有时限、禁历练的增益,不是默认挂机,静修不写成闭关。 */
export interface HomePresence {
  dead: boolean
  /** 正在秘境中(不推进历练会话) */
  exploringSecret: boolean
  /** 正在真仙远征中(同上) */
  expedition: boolean
  /** 正在历练会话中(与闭关互斥,由探索入口守卫) */
  adventuring: boolean
  regionName: string
  injured: boolean
  retreating: boolean
  expFull: boolean
}

export function homeStatusText(p: HomePresence): string {
  if (p.dead) return '陨落'
  // 三种在途写法与 core/endgameActivity 拒因同词,修为圆满与离线卷轴(ui/cultivationText)同词。
  if (p.exploringSecret) return BUSY_REASON.secretRealm
  if (p.expedition) return BUSY_REASON.expedition
  if (p.adventuring) return `历练在途 · ${p.regionName}`
  if (p.injured) return '疗伤中'
  if (p.retreating) return BUSY_REASON.retreat
  if (p.expFull) return '修为已至圆满'
  return '修炼中'
}
