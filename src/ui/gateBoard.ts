import { GATES, type GateDef, type GateId } from '@/data/qimen'

/**
 * 奇门九宫盘形制。
 *
 * 八门各居洛书一宫(中五无门),而界面此前把它们平铺成一列文字:
 * 「坎一北休门、艮八东北生门……」—— 九宫这件事是**位置**信息,竖排读不出来。
 *
 * 这一层把九宫画出来:
 *   宫位(layout):3×3 的洛书格,按「四正 + 四隅」摆位,中宫无门。
 *   吉凶(kind):吉/平/凶三档,用**形状**而不是只靠颜色 —— 吉为实线框、平为虚线、凶为双线,
 *                色弱玩家也能分开。
 *   落宫(seat):每门在盘上的行列,供界面直接摆格。
 *
 * 铁律:九宫是唯一事实源(data/qimen 的 palace),这里只做「宫 → 行列」的排布换算。
 * 洛书排布:上排 4 9 2、中排 3 5 7、下排 8 1 6(横竖斜皆十五)。
 */

/** 洛书九宫的固定排布:每行三宫,值即宫位号 */
export const LUOSHU_LAYOUT: readonly (readonly number[])[] = [
  [4, 9, 2],
  [3, 5, 7],
  [8, 1, 6]
]

/** 盘上一格:宫位 + 该宫的门(中宫无门时为 undefined) */
export interface PalaceCell {
  /** 宫位 1~9 */
  palace: number
  /** 行 0~2 / 列 0~2 */
  row: number
  col: number
  /** 该宫的门;中五无门时为 undefined */
  gate: GateDef | undefined
}

/**
 * 九宫盘。按 LUOSHU_LAYOUT 逐格填门 —— 门的 palace 是唯一事实源,
 * 盘的排布只决定它落在哪一行哪一列。
 */
export function palaceBoard(): PalaceCell[] {
  const byPalace = new Map<number, GateDef>(GATES.map(g => [g.palace, g]))
  const out: PalaceCell[] = []
  LUOSHU_LAYOUT.forEach((row, r) => {
    row.forEach((palace, c) => {
      out.push({ palace, row: r, col: c, gate: byPalace.get(palace) })
    })
  })
  return out
}

/** 吉凶档:吉 / 平 / 凶;认不出的门按「平」处理(宁可不加,不加错) */
export type GateKind = '吉' | '平' | '凶'

const KIND_ORDER: readonly GateKind[] = ['吉', '平', '凶']

/**
 * 吉凶的形制标记:不靠色,靠线。
 *   吉 → 实线框    平 → 虚线框    凶 → 双线框
 * 色弱玩家靠边框形态即可分开,与 CSS 里的 .gate-kind-* 同源。
 */
export function gateKindMark(kind: string): { kind: GateKind; shape: string; label: string } {
  const real = KIND_ORDER.includes(kind as GateKind) ? (kind as GateKind) : '平'
  const shape = real === '吉' ? 'solid' : real === '凶' ? 'double' : 'dashed'
  return { kind: real, shape, label: `${real}门` }
}

/** 八门各居一宫且互不重复;用于判据核对盘面不塌成比目鱼 */
export function gateSeats(): { gate: GateDef; row: number; col: number }[] {
  return palaceBoard()
    .filter((c): c is PalaceCell & { gate: GateDef } => c.gate !== undefined)
    .map(c => ({ gate: c.gate, row: c.row, col: c.col }))
}

/** 按 id 取门在盘上的落位;认不出返回 undefined */
export function seatOf(id: GateId | string): { row: number; col: number } | undefined {
  const cell = palaceBoard().find(c => c.gate?.id === id)
  return cell ? { row: cell.row, col: cell.col } : undefined
}
