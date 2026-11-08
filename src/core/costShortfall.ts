/**
 * 「灵石 + 器灵尘」两样各差多少 —— 强化/重铸/词条转移共用同一份口径。
 *
 * 这段算式原先在 reforge.reforgeShortfall 与 affixTransfer.transferShortfall 里各写了一遍,
 * 逐字相同(连 `short` 的三元链都一样)。两条路径都拿它决定置灰、价签与拒因:
 * 抄两份时若只改一处,同一种「两样都缺」的场景会在两处给出不同的首选拒因。
 *
 * 抽成纯函数而不读 store:余额由调用方取来传入,这样它可以被单测直接喂各种边界,
 * 也让两个模块的导出签名保持不变。
 */
import type { GNum } from '@/types'
import { gte, gnZero, subClamp } from '@/utils/gnum'

export interface TwoPartShortfall {
  /** 优先报的那一样;两样都缺时先报灵石 */
  short: 'stone' | 'dust' | null
  /** 灵石还差多少(够则为 0) */
  stone: GNum
  /** 器灵尘还差多少(够则为 0) */
  dust: number
}

/**
 * @param cost     这一下的总价
 * @param balance  当前灵石
 * @param dustOwn  当前器灵尘
 */
export function twoPartShortfall(cost: { stone: GNum; dust: number }, balance: GNum, dustOwn: number): TwoPartShortfall {
  // 与原实现逐字同义:够就给 0,不够才做钳到非负的减法
  const stone = gte(balance, cost.stone) ? gnZero() : subClamp(cost.stone, balance)
  const dust = dustOwn >= cost.dust ? 0 : Math.max(0, cost.dust - dustOwn)
  return {
    short: stone.m > 0 ? 'stone' : dust > 0 ? 'dust' : null,
    stone,
    dust
  }
}
