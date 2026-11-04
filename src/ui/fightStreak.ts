/**
 * 连战逐场形制。
 *
 * 远征与天道试炼都是「一场接一场」:携带气血进入下一场,场间按规则回复。
 * 而无论是战报弹窗还是进行中的远征面板,这一串场次此前只有两种形态 ——
 * 一行文字「第 3 战 · 妖将 · 胜」「12回合 · 余血 42%」,胜用墨、负用朱。
 *
 * 可这一段里真正决定「还能不能走下一重」的,是**余血的走势**:
 * 一场比一场薄,说明快到极限;哪一场突然见底,那就是险关。
 * 文字把它写成了十个互不相干的百分数,玩家得自己在脑子里连成一条线。
 *
 * 这一层只做一件事:把每场的余血落成一根柱,再标出负的那一场。
 * 数据早就在 `rows[].hpLeftPct` 里,不新增任何字段。
 */

/** 一场战果 */
export interface FightRow {
  win: boolean
  /** 战后气血比例 0~1 */
  hpLeftPct: number
  rounds: number
}

export interface FightMark {
  /** 第几场,从 1 起 */
  index: number
  /** 战后气血比例,夹到 0~1 */
  hpPct: number
  /** 柱高百分比;恒以满血为顶 */
  barPct: number
  win: boolean
  /**
   * 是否本串最险的一场(余血最少的那场,只在有败绩时标)。
   * 全胜时返回 false —— 「最险」在没输过的串里没有意义。
   */
  worst: boolean
}

/**
 * 逐场形制。
 *
 * 柱高以**满血**为顶,不按本串最大值归一 —— 与天劫不同:
 * 天劫是一波一波往下掉,开头必然接近满值,归一才看得出落差;
 * 连战记的是「打完这一场还剩多少」,绝对值本身就有意义
 * (余血 90% 与 20% 的差别,不该被「本串最高」抹平)。
 */
export function fightMarks(rows: readonly FightRow[]): FightMark[] {
  const marks: FightMark[] = rows.map((r, i) => {
    const hp = Number.isFinite(r.hpLeftPct) ? Math.max(0, Math.min(1, r.hpLeftPct)) : 0
    return { index: i + 1, hpPct: hp, barPct: hp * 100, win: r.win === true, worst: false }
  })
  const lost = marks.filter(m => !m.win)
  if (lost.length > 0) {
    // 有败绩时,「最险」指败下来的那一场里余血最少的那场
    const worst = lost.reduce((a, b) => (b.hpPct < a.hpPct ? b : a))
    const target = marks.find(m => m.index === worst.index)
    if (target) target.worst = true
  }
  return marks
}

/** 全胜与否 —— 两处摘要都要报这一句 */
export function allWon(rows: readonly FightRow[]): boolean {
  return rows.length > 0 && rows.every(r => r.win === true)
}

/** 最低余血的那一场(不限胜败);无场次时 null */
export function thinnest(marks: readonly FightMark[]): FightMark | null {
  if (marks.length === 0) return null
  return marks.reduce((a, b) => (b.hpPct < a.hpPct ? b : a))
}
