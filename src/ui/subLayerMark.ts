import { SUB_NAMES } from '@/data/realms'
import { SUB_LEVELS } from '@/data/constants'

/**
 * 小境界层数的形制。
 *
 * 「一层 … 九层 · 圆满」这十档是全作最核心的进度读数:修为攒到当前层满即小进阶,
 * 攒到「圆满」才够格冲大关。而界面上它一直只是两个字 ——
 * 修炼页顶上一行「三层」、顶栏一行「金丹·三层」。
 *
 * 两处都缺同一件事:**这一层在这十档里排到哪**。同样是「三层」,
 * 从一层到三层走了一半的路,从七层到三层则已经是往回退过一世;
 * 而「圆满」离大关只差一次突破 —— 这些都得自己拿两个字去比。
 *
 * 形制沿用全站既有的那一套(与 `ui/realmProgress`、`ui/worldProgress` 同一条思路):
 *   十档就是十格,已满几格;到「圆满」整排转实朱 —— 那是「够格冲大关了」的信号,
 *   与「还差几层」是两种状态,该分开看。
 *
 * 门槛全部取自 `data/realms` 的 `SUB_NAMES` 与 `data/constants` 的 `SUB_LEVELS`,不另立。
 *
 * **只接修炼页,不接顶栏**。顶栏那一行「金丹·三层」是扫一眼的摘要,而它的可用宽度已经被
 * 寿元与「N 世」占住,且 layout-check 钉着「320 宽不许折行、境界名局促时先省略」——
 * 十格刻度约 58px,挤进去只会把境界名压成省略号,换来一枚扫一眼也数不清的点阵。
 * 形制要放在玩家真正做决定的地方:修为攒满、要不要冲大关,都在修炼页。
 */

/** 小境界层数刻度 */
export interface SubLayerMark {
  /** 当前层序,0 起(0 = 一层);夹到 0~末档 */
  index: number
  /** 总档数,取自 SUB_LEVELS */
  total: number
  /** 是否已至「圆满」 */
  complete: boolean
  /** 还差几档到圆满;已圆满为 0 */
  toComplete: number
  /** 当前档的原文名(「三层」/「圆满」),供读屏与 title 用 */
  label: string
}

/**
 * 一境之内走到第几档。
 *
 * @param sub 当前小境界序号(0 起);坏值按一层处理 —— 形制是加成,判不出时宁可不加。
 */
export function subLayerMark(sub: number): SubLayerMark {
  const total = Math.max(1, Math.floor(SUB_LEVELS))
  const index = Number.isFinite(sub) ? Math.max(0, Math.min(total - 1, Math.floor(sub))) : 0
  return {
    index,
    total,
    complete: index >= total - 1,
    toComplete: total - 1 - index,
    label: SUB_NAMES[Math.min(index, SUB_NAMES.length - 1)] ?? ''
  }
}

/** 层数刻度:已满的格为 true。格数随 SUB_LEVELS 变,模板不再自己数 */
export function subLayerPips(mark: SubLayerMark): boolean[] {
  return Array.from({ length: mark.total }, (_, i) => i <= mark.index)
}
