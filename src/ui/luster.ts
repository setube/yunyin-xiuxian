import type { QualityId } from '@/types'
import { qualityDef } from '@/data/qualities'

/**
 * 高级物的「质感层」。品阶视觉已经有三级:
 *   `qualityTier`(三档浓淡)→ `qualityAura`(角饰/外发光/流光)→ 本模块(最上档的形制)。
 *
 * 这一层为什么存在:前两级回答的是「这件有多稀有」,玩家读到的是**信息**。
 * 而玩家攒到一件顶级物时想要的是**心里一喜** —— 那是形制,不是数值。
 * 故本模块只管形制:它给调用点一组可挂的类名与一句话,色值一律走 CSS 的 `--luster-tone`。
 *
 * 三条铁律(都有判据钉住,见 luster.spec.ts):
 *   1. 只在最上档出现。每一档都加一层,等于每档都没有 —— 稀有感来自**落差**,不是来自层数。
 *   2. 不抢内容。图标、名字、数值的可读性优先于任何特效;特效层一律 pointer-events: none。
 *   3. 尊重减少动效。静态形制必须自己站得住,动效只是加成。
 */

/** 质感档:只在最上档返回,其余为 null —— 调用点据此决定挂不挂类 */
export interface Luster {
  /** 卡面:四角御纹(静态,与品阶角饰的位置错开) */
  cornice: boolean
  /** 卡面:斜向流光(动效,减少动效时退化为静态高光) */
  sheen: boolean
  /** 详情:整幅框(嵌边 + 顶饰) */
  frame: boolean
  /** 详情:标题字面(字距 + 描边) */
  title: boolean
  /** 读屏用:与 QualitySeal 同一套说法,不另造词 */
  label: string
}

const LUSTERED: Luster = { cornice: true, sheen: true, frame: true, title: true, label: '神品' }

/** 最上档的 rank;`qualityAuraByRank` 与 `qualityTierByRank` 同源,不另立阈值。导出供判据钉住 */
export const DIVINE_TOP_RANK = qualityDef('divine').rank

/**
 * 按品阶判质感档。非最上档一律 null。
 *
 * 丹药的「道品」(rank 9)不在 `QualityId` 联合里,走 rank 入口。
 */
export function lusterOf(quality: QualityId): Luster | null {
  return qualityDef(quality).rank >= DIVINE_TOP_RANK ? LUSTERED : null
}

export function lusterByRank(rank: number): Luster | null {
  return Number.isFinite(rank) && rank >= DIVINE_TOP_RANK ? LUSTERED : null
}
