import { STAGE_NAMES, STAGE_ORDER, stageIndex, type BondStage } from '@/data/daolu'

/**
 * 道侣缘阶形制。
 *
 * 道侣有七阶(素昧平生 → 道侣),而界面此前把阶名写成一行小字:
 * 「知交」与「同行」长得一模一样,玩家得读名字才知道走到了哪一步。
 * 关系推进是本作里唯一「只进不退、由选择累积」的一条线,它该有可数的形制。
 *
 * 这一层给三样,都不需要新数据:
 *   阶点(pips):一阶一点,七阶七点 —— 数得出来,不必读阶名。
 *   缘纹(crest):每阶一枚自己的线纹,形状可数;最上阶(道侣)另有外环。
 *   缘色(tone):转发既有语义色(逐阶由靛到朱),不新增 token。
 *
 * 阈值不另立:一律取 `data/daolu` 的 `STAGE_ORDER` —— 那里已经是唯一事实源。
 */

/** 缘阶形制的色相:逐阶由冷到暖(靛 → 青 → 朱),全部是既有语义色 */
const TONES: Record<BondStage, string> = {
  none: 'var(--color-ink-faint)',
  met: 'var(--color-azure)',
  known: 'var(--color-azure)',
  together: 'var(--color-jade)',
  confidant: 'var(--color-violet-ink)',
  pledged: 'var(--color-gold-ink)',
  daolv: 'var(--color-cinnabar)'
}

/** 每阶的缘纹类名后缀;与阶名一一对应,不按序数猜 */
const GLYPHS: Record<BondStage, string> = {
  none: 'none',
  met: 'met',
  known: 'known',
  together: 'together',
  confidant: 'confidant',
  pledged: 'pledged',
  daolv: 'daolv'
}

export interface BondMark {
  /** 阶序:0 素昧平生 … 6 道侣 */
  rank: number
  /** 阶点枚数 = rank + 1;素昧平生也有一点(关系已存在,只是还没走近) */
  pips: number
  /** 是否最上阶(道侣) —— 独有外环 */
  top: boolean
  /** 缘纹类名后缀 */
  glyph: string
  /** 缘色 */
  tone: string
  /** 读屏与 title 的说法:复用 data/daolu 的阶名 */
  label: string
}

/** 阶序上限,与 `STAGE_ORDER` 同源 */
export const BOND_TOP_RANK = STAGE_ORDER.length - 1

/**
 * 按阶取形制。认不出的阶(坏档里写了个野名)一律按「素昧平生」处理 ——
 * 关系值本就是可以重来的一层,画错一阶比画不出更糟。
 */
export function bondMark(stage: BondStage | string): BondMark {
  const idx = stageIndex(stage as BondStage)
  const rank = idx < 0 ? 0 : idx
  const real = STAGE_ORDER[rank] ?? 'none'
  return {
    rank,
    pips: rank + 1,
    top: rank >= BOND_TOP_RANK,
    glyph: GLYPHS[real],
    tone: TONES[real],
    label: STAGE_NAMES[real]
  }
}
