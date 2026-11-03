import { branchesFor, gongfaBranchDef, type GongfaBranchDef } from '@/data/gongfaBranches'
import { gongfaDef } from '@/data/gongfa'
import { qualityDef } from '@/data/qualities'
import { qualityAuraByRank, type QualityAura } from './qualityAura'
import { qualityTierByRank } from './qualityTier'

/**
 * 悟道分支形制。
 *
 * 分支是「不可更改、转世不失」的一次抉择 —— 比一次强化、一次炼器都重。
 * 而界面此前把三个分支排成一模一样的按钮:同一行字、同一个边框、同一句「择此道 →」,
 * 玩家得逐个读词条才知道它们不是同一件东西。
 *
 * 这一层给分支三样形制,都不需要新数据:
 *   道纹槽位(slot):同一门功法的第 1/2/3 条分支,各用一种线纹。
 *                    以**序号**定位,不按分支名 —— 分支名会重名(「开天」在四门功法里各有其一),
 *                    按名字画纹会把两门功法的分支画成同一个。
 *   品阶色(tone):取所属功法的品阶色。分支长在这门功法上,颜色理应跟着它走。
 *   份量(aura):沿用品阶光环 —— 天品以上功法的分支,与天品以上的物件同一套形制。
 *
 * 铁律与既有形制一致:只在最上档给「重」的形制(见 aura),分支本身一律可数。
 */

/** 分支道纹槽位:同一门功法的第几条 */
export type BranchSlot = 1 | 2 | 3 | 4

export interface BranchMark {
  /** 第几条分支(1 起) */
  slot: BranchSlot
  /** 道纹槽位的 CSS 类后缀 */
  glyph: string
  /** 品阶色:取所属功法 */
  tone: string
  /** 品阶光环:形制强弱与功法同档 */
  aura: QualityAura
  /** 读屏与 title 的说法 */
  label: string
}

/**
 * 同一门功法最多几条分支。超过 4 条时回到第 1 槽 ——
 * 宁可复用一条纹样,也不画出第 5 种没人登记过的形状。
 */
export const BRANCH_SLOT_MAX = 4

/** 序号 → 槽位;坏值回到 1 */
export function branchSlotOf(index: number): BranchSlot {
  if (!Number.isFinite(index) || index < 1) return 1
  return ((Math.min(index, BRANCH_SLOT_MAX) - 1) + 1) as BranchSlot
}

/**
 * 一条分支的形制。分支取不到所属功法时返回 undefined ——
 * 坏档里写了野分支 id,调用点据此不挂形制,而不是挂一份假的。
 */
export function branchMark(def: GongfaBranchDef): BranchMark | undefined {
  const gongfa = gongfaDef(def.gongfaId)
  if (!gongfa) return undefined
  const siblings = branchesFor(def.gongfaId)
  const idx = siblings.findIndex(b => b.id === def.id)
  if (idx < 0) return undefined
  const slot = branchSlotOf(idx + 1)
  const rank = qualityDef(gongfa.quality).rank
  return {
    slot,
    glyph: `branch-${slot}`,
    tone: qualityDef(gongfa.quality).color,
    aura: qualityAuraByRank(rank),
    label: `${def.name}(第${slot}道)`
  }
}

/** 按分支 id 取形制;认不出就是 undefined */
export function branchMarkOf(branchId: string): BranchMark | undefined {
  const def = gongfaBranchDef(branchId)
  return def ? branchMark(def) : undefined
}

/** 与 branchMark 同一套浓淡(边框/底色);给分支按钮上色用 */
export function branchTier(qualityId: Parameters<typeof qualityDef>[0]): { border: number; bg: number } {
  return qualityTierByRank(qualityDef(qualityId).rank)
}
