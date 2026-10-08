/**
 * 丹药(消耗品)增益的时长上限 —— 封顶规则与三档文案的依据。
 *
 * 起因(承接 xian ISS-232 的思路,适配云隐自己的 addBuff 叠法):
 * 云隐丹药的叠加是"加上"(见 stores/cultivation.ts 的 addBuff),吃得比时长勤就能无限攒。
 * 那等于把"限时加速"按材料成本换成"半常驻","什么时候吃"这个决策随之消失,
 * "药效过去"这个节拍也感受不到了。
 *
 * 现在给**凡丹药能给的增益**加上这条上限:最长只能攒到"一次服药的两倍时长",
 * 到顶之后再服只延续到上限 —— "连吃两颗把时间顶满"的顺手感还在,囤积则被封在一次服药节奏之内。
 *
 * 口径写在装配这一层、由 data/pills 推导,而不是逐个 def 手写:新增一味丹只要挂上 buffId,
 * 上限自动生效 —— 少一处"记得改"的地方。
 *
 * 上限只对"丹药能给的增益"生效:凡在 PILLS 挂过 buffId 的都算(含造化丹给的 bless_daoyun,
 * 那一味同时也能由事件/奇缘给出,但该状态的总时长同样封顶 —— 与 xian 同口径)。
 * 事件祝福 / 闭关 / 重伤这类非攒积来源不在此列,免得上限被无意扩大到一次性内容。
 * 判据见 core/buffCap.spec.ts 与 stores/cultivation.spec.ts。
 */
import { buffDef } from '@/data/buffs'
import { PILLS } from '@/data/pills'
import type { BuffInstance } from '@/types'

/** 丹药增益的时长上限倍数:单颗时长的几倍封顶 */
export const CONSUMABLE_BUFF_CAP_MULT = 2

/**
 * 凡能被丹药施加的增益 id —— 上限只对它们生效(事件祝福 / 闭关 / 惩罚不在此列)。
 * 静态字面查找表(Record):仅在模块装载时由 data/pills 构建一次,之后只做成员查询。
 */
const CONSUMABLE_LOOKUP: Record<string, true> = {}
for (const p of PILLS) {
  if (p.buffId) CONSUMABLE_LOOKUP[p.buffId] = true
}

/** 这条增益是不是"丹药能给"的(受封顶管) */
export function isConsumableBuff(defId: string): boolean {
  return CONSUMABLE_LOOKUP[defId] === true
}

/** 某条增益的时长上限(秒);不受上限管的返回 `undefined` */
export function buffCapSec(defId: string): number | undefined {
  const def = buffDef(defId)
  return def && isConsumableBuff(defId) ? def.durationSec * CONSUMABLE_BUFF_CAP_MULT : undefined
}

/**
 * 此刻再服一次,这一颗会被上限怎么对待 —— 给"服药"那条路用(usePill 服前调用)。
 *
 *   `full`    已经顶到上限:一点也加不上去,这一颗**白费**;
 *   `partial` 加上去会越过上限:只延续到顶,剩余的那一截被削掉;
 *   `none`    不受影响,足额兑现。
 *
 * 为什么要在界面上说:上限是"相对服药那一刻"封的,于是贴着上限连服时,
 * 每一颗实际只延续几十秒 —— 玩家看到的是"药吃了,时间几乎没动",若不说清楚,
 * 下一个结论就是"这游戏坏了"。容差 0.5 秒:剩余时间以毫秒在走,差半秒不算到顶。
 */
export type BuffOverflow = 'none' | 'partial' | 'full'

export function buffOverflowOf(
  buffs: readonly BuffInstance[],
  defId: string,
  now: number
): BuffOverflow {
  const def = buffDef(defId)
  const cap = buffCapSec(defId)
  if (!def || cap === undefined) return 'none'
  const instance = buffs.find(b => b.defId === defId)
  const remain = instance ? Math.max(0, (instance.endsAt - now) / 1000) : 0
  if (remain >= cap - 0.5) return 'full'
  return remain + def.durationSec > cap ? 'partial' : 'none'
}
