/**
 * 道源/道果认知服务(Phase 30.9)
 *
 * 目标:让玩家在第一次看到道源/道果时,就知道
 *   道源 = 「此世消耗」的终局行动资源
 *   道果 = 「永久积累」的跨世成长资源
 *
 * 原则:不改经济,只改认知——名称语义/用途说明/即时因果解释/
 *       首次教学/软上限白话。全部为展示层与一次性标记。
 */
import { useEndgameStore } from '@/stores/endgame'
import { WORLD_BREAK_MAJOR } from '@/data/realms'
import { usePlayerStore } from '@/stores/player'
import { DAO_FRUIT_COMBAT_BONUS, DAO_FRUIT_CULT_BONUS } from '@/data/constants'
import { formatPercent } from '@/utils/format'
import { effectiveDaoFruit } from './statsCalc'

// ---------- S1 生命周期语义 ----------

/** 道源:本世消耗的终局行动资源 */
export const DAO_SOURCE_ROLE = '此世消耗' as const
/** 道果:跨世保留的长期成长资源 */
export const DAO_FRUIT_ROLE = '永久积累' as const

/** 道源用途一句话 */
export const DAO_SOURCE_USAGES = ['叩问天界诸界', '参加天道试炼', '献祭前尘杂物', '凝聚道果']
/** 道果用途一句话 */
export const DAO_FRUIT_USAGES = ['提升转世后的长期收益', '跨世保留,永不磨灭']

// ---------- S2 资源说明(弹窗内容,纯数据) ----------

export interface ResourceDialogData {
  name: string
  role: string
  /** 生命周期标签颜色语义 */
  roleTone: 'action' | 'permanent'
  intro: string
  usages: string[]
  gains: string[]
  lifecycle: string
}

export function daoSourceDialog(): ResourceDialogData {
  return {
    name: '道源',
    role: DAO_SOURCE_ROLE,
    roleTone: 'action',
    intro: '真仙之后用于叩问天道的资源。灵草唯仙品起可献祭;凡/灵品只走坊市换灵石。',
    usages: DAO_SOURCE_USAGES,
    gains: ['破界', '天道试炼', '天道挑战', '天道熔炉'],
    lifecycle: '本世使用,可通过凝道果转化为永久成长。'
  }
}

export function daoFruitDialog(): ResourceDialogData {
  return {
    name: '道果',
    role: DAO_FRUIT_ROLE,
    roleTone: 'permanent',
    intro: '跨越轮回仍不磨灭的修行成果。',
    usages: DAO_FRUIT_USAGES,
    gains: ['道源凝聚', '终局奖励'],
    lifecycle: `跨世保留。每枚至多:修行 +${formatPercent(DAO_FRUIT_CULT_BONUS)},道躯 +${formatPercent(DAO_FRUIT_COMBAT_BONUS)};边际渐减(effectiveDaoFruit=道果^0.9)。`
  }
}

/** 有效道果不四舍五入成整数。7.9 枚与 8 枚乘出来的修行不是同一笔。 */
export function fruitCountLabel(n: number): string {
  const rounded = Math.round(n * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${text} 枚`
}

/** 本次凝聚一枚道果后,当前有效道果收益变化(白话:边际收益) */
export function fruitMarginalInfo(): { total: number; effective: number; nextEffective: number; deltaPct: string } {
  const player = usePlayerStore()
  const fruit = player.reincarnation.daoFruit
  const eff = effectiveDaoFruit(fruit)
  const nextEff = effectiveDaoFruit(fruit + 1)
  const delta = ((nextEff - eff) / Math.max(1, eff)) * 100
  return { total: fruit, effective: eff, nextEffective: nextEff, deltaPct: delta.toFixed(2) }
}

/**
 * 道果软上限白话文案 —— 如实报出「再凝一枚」的真实边际,不再堆一个夸大的字眼。
 *
 * 边际永远存在,且直接源自 DAO_FRUIT_SOFT_EXP(effectiveDaoFruit = 道果^0.9):
 * 即便 20 枚以后,再凝一枚仍带来约 +4.5% 有效收益(≈+2% 修行),并非「微乎其微」。
 * 故文案不设「已逾二十即微乎其微」这种与数据对不上的硬编码断言,而是从
 * effectiveDaoFruit 现算两个百分比(有效收益、修行)写出来 —— 改指数即同步变真。
 */
export function fruitSoftCapText(total: number): string {
  if (total <= 0) return '尚未凝得道果。'
  const eff = effectiveDaoFruit(total)
  const next = effectiveDaoFruit(total + 1)
  const marginalEff = next - eff
  const effPct = (marginalEff / eff) * 100
  const cultPct = marginalEff * DAO_FRUIT_CULT_BONUS * 100
  return `道果已 ${total} 枚:再凝一枚,有效收益 +${effPct.toFixed(1)}%,修行 +${cultPct.toFixed(1)}%——收益渐减,仍属永久。`
}

// ---------- S4/S5 首次教学 ----------

/** 首次进入天界教学(一次性) */
export function shouldShowEndgameTutorial(): boolean {
  const endgame = useEndgameStore()
  if (endgame.endgameTutorialSeen) return false
  // 触发条件:未见过教学,且已登真仙(随天界解锁)
  return usePlayerStore().major >= WORLD_BREAK_MAJOR
}

export function markEndgameTutorialSeen(): void {
  useEndgameStore().endgameTutorialSeen = true
}

/** 首次凝道果(condenseDaoFruit 成功后调用),返回是否是首次 */
export function shouldShowFruitTutorial(): boolean {
  const endgame = useEndgameStore()
  if (endgame.daoFruitTutorialSeen) return false
  return true
}

export function markFruitTutorialSeen(): void {
  useEndgameStore().daoFruitTutorialSeen = true
}

// ---------- S6 行为埋点(轻量) ----------

export interface ResourceCognitionStats {
  /** 道源总数 */
  daoSource: number
  /** 道果总数 */
  daoFruit: number
  /** 是否见过终局教学 */
  tutorialSeen: boolean
  /** 是否见过道果教学 */
  fruitSeen: boolean
  /** 是否打开过资源说明 */
  dialogSeen: boolean
}

export function cognitionStats(): ResourceCognitionStats {
  const endgame = useEndgameStore()
  const player = usePlayerStore()
  return {
    daoSource: endgame.daoSource,
    daoFruit: player.reincarnation.daoFruit,
    tutorialSeen: endgame.endgameTutorialSeen,
    fruitSeen: endgame.daoFruitTutorialSeen,
    dialogSeen: endgame.resourceDialogSeen
  }
}

export function markResourceDialogSeen(): void {
  useEndgameStore().resourceDialogSeen = true
}
