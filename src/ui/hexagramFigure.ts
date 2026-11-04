import type { HexagramReading } from '@/core/divination'

/**
 * 卦画形制。
 *
 * 卦画原来是六行文字条(「▬▬▬」「▬ ▬ ○ 动」),而且**自上而下照着 lines 数组铺**:
 *   lines 自下而上(初爻在前),页面却从头往下排 —— 整幅卦画是倒着的。
 *   「下卦为身、上卦为境」这句话,在倒着的图上正好读反。
 *   之卦更只剩一个卦名,卦象本身没有画出来 —— 事要从哪里转,看不见。
 *
 * 这一层只做三件事:
 *   次序(lines):翻成自上而下(上爻在前),与页面渲染同序;倒竖的根源就此只在一处。
 *   爻题(label):初九、六二…… 依阳爻称九、阴爻称六的古法;
 *                动爻另记 ○(老阳)、×(老阴),与「三背/零背为动爻」的摇法一致。
 *   之内(changed):动爻反向即之卦之爻,与 reading.changed 同源。
 *
 * 铁律:爻值仍取 core/divination 的 reading,这里只换摆法与记号,不另算一卦。
 */

/** 一爻在盘上的样子 */
export interface HexLine {
  /** 爻位 1(初)~6(上) */
  position: number
  /** 阳爻为 true,阴爻为 false */
  yang: boolean
  /** 是否动爻 */
  changing: boolean
  /** 属上卦(外,境)还是下卦(内,身) */
  part: 'upper' | 'lower'
  /** 爻题:初九、六二、上六…… */
  label: string
  /** 动爻的古记号:阳动 ○、阴动 ×;不动为空 */
  mark: string
}

/** 一幅卦画 */
export interface HexFigure {
  /** **自上而下**排好的六爻,上爻在前 —— 页面照此顺序直接铺 */
  lines: HexLine[]
  /** 之卦之爻,同序;六爻不动为 null */
  changed: HexLine[] | null
  /** 之卦卦名;六爻不动为 null。与 changed 同源,省得模板再读一遍 reading */
  changedName: string | null
}

/** 爻位名:初、二、三、四、五、上 */
const POSITION_NAMES = ['初', '二', '三', '四', '五', '上'] as const

/**
 * 爻题。古法:阳爻称九、阴爻称六;初爻与上爻把位名放在前(初九、上六),
 * 中间四爻把位名放在后(九二、六三)。
 */
function lineLabel(position: number, yang: boolean): string {
  const num = yang ? '九' : '六'
  const name = POSITION_NAMES[position - 1] ?? ''
  return position === 1 || position === 6 ? `${name}${num}` : `${num}${name}`
}

/**
 * 由自下而上的六爻与动爻位排出卦画。
 *
 * @param lines 自下而上,1 阳 / 0 阴(core/divination 的 reading.lines)
 * @param changingAt 动爻位,1~6
 */
export function hexLines(lines: readonly number[], changingAt: readonly number[]): HexLine[] {
  const bottomUp: HexLine[] = lines.map((v, i) => {
    const position = i + 1
    const yang = v === 1
    const changing = changingAt.includes(position)
    return {
      position,
      yang,
      changing,
      part: position <= 3 ? 'lower' : 'upper',
      label: lineLabel(position, yang),
      mark: changing ? (yang ? '○' : '×') : ''
    }
  })
  // 卦画自上而下:上爻在最上
  return bottomUp.reverse()
}

/** 之卦之爻:动爻反向,其余不动 */
export function changedLines(lines: readonly number[], changingAt: readonly number[]): HexLine[] {
  return hexLines(
    lines.map((v, i) => (changingAt.includes(i + 1) ? (v === 1 ? 0 : 1) : v)),
    []
  )
}

/**
 * 一幅卦画:本卦 + 之卦。
 *
 * 之卦只用 reading.changed 是否成立来判断有没有 —— 与页头那枚「之某」同源,
 * 不各算一遍。
 */
export function hexFigure(reading: HexagramReading): HexFigure {
  return {
    lines: hexLines(reading.lines, reading.changingAt),
    changed: reading.changed ? changedLines(reading.lines, reading.changingAt) : null,
    changedName: reading.changed ? reading.changed.name : null
  }
}

/** 有几爻在动 —— 「动爻越多,卦力越盛」这句的总数 */
export function movingCount(lines: readonly HexLine[]): number {
  return lines.filter(l => l.changing).length
}
