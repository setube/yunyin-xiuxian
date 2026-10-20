/**
 * 主页状态行 —— 只报玩家此刻真正处在的状态。
 *
 * 「闭关」是一条有时限、禁历练的增益,不是默认挂机。把静修一律写成闭关,
 * 玩家会以为自己已经封洞、出不去,或者反过来觉得闭关按钮没生效。
 */
export interface HomePresence {
  dead: boolean
  /** 正在秘境中(秘境不推进历练会话,主页此前会写成「修炼中」) */
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
  // 秘境与远征都不是「历练会话」,却都占着玩家本体 —— 写「修炼中」等于说他在家打坐
  if (p.exploringSecret) return '探秘中'
  if (p.expedition) return '远征中'
  if (p.adventuring) return `历练中 · ${p.regionName}`
  if (p.injured) return '疗伤中'
  if (p.retreating) return '闭关中'
  if (p.expFull) return '修为已满'
  return '修炼中'
}
