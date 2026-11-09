/** 道源/道果认知服务:展示层文案与一次性教学标记,不改经济 */
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

/** 道源用途(标签) */
export const DAO_SOURCE_USAGES = ['叩问诸界', '天道试炼', '献祭杂物', '凝聚道果']
/** 道果用途(标签) */
export const DAO_FRUIT_USAGES = ['提升长期收益']

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
    intro: '真仙后的终局资源 · 灵草仅仙品起可献祭',
    usages: DAO_SOURCE_USAGES,
    gains: ['破界', '天道试炼', '天道挑战', '天道熔炉'],
    lifecycle: '本世使用 · 可凝为道果'
  }
}

export function daoFruitDialog(): ResourceDialogData {
  return {
    name: '道果',
    role: DAO_FRUIT_ROLE,
    roleTone: 'permanent',
    intro: '跨世成长资源',
    usages: DAO_FRUIT_USAGES,
    gains: ['道源凝聚', '终局奖励'],
    lifecycle: `跨世保留 · 每枚至多 修行 +${formatPercent(DAO_FRUIT_CULT_BONUS)} · 道躯 +${formatPercent(DAO_FRUIT_COMBAT_BONUS)} · 边际渐减`
  }
}

/** 有效道果不四舍五入成整数 */
export function fruitCountLabel(n: number): string {
  const rounded = Math.round(n * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${text} 枚`
}

/** 凝聚一枚道果后有效道果的边际收益 */
export function fruitMarginalInfo(want = 1): {
  total: number
  effective: number
  nextEffective: number
  deltaPct: string
} {
  const player = usePlayerStore()
  const fruit = player.reincarnation.daoFruit
  const n = Number.isFinite(want) && want > 0 ? Math.floor(want) : 1
  const eff = effectiveDaoFruit(fruit)
  const nextEff = effectiveDaoFruit(fruit + n)
  const delta = ((nextEff - eff) / Math.max(1, eff)) * 100
  return { total: fruit, effective: eff, nextEffective: nextEff, deltaPct: delta.toFixed(2) }
}

/**
 * 道果软上限文案:现算「再凝一枚」的有效收益与修行两个百分比,不写「微乎其微」这类硬编码断言。
 * 同源:DAO_FRUIT_SOFT_EXP(effectiveDaoFruit = 道果^0.9)。
 */
export function fruitSoftCapText(total: number): string {
  if (total <= 0) return '尚未凝得道果'
  const eff = effectiveDaoFruit(total)
  const next = effectiveDaoFruit(total + 1)
  const marginalEff = next - eff
  const effPct = (marginalEff / eff) * 100
  const cultPct = marginalEff * DAO_FRUIT_CULT_BONUS * 100
  return `道果已 ${total} 枚 · 再凝一枚 有效收益 +${effPct.toFixed(1)}% · 修行 +${cultPct.toFixed(1)}%`
}

// ---------- S4/S5 首次教学 ----------

/** 首次进入天界教学(一次性) */
export function shouldShowEndgameTutorial(): boolean {
  const endgame = useEndgameStore()
  if (endgame.endgameTutorialSeen) return false
  return usePlayerStore().major >= WORLD_BREAK_MAJOR
}

export function markEndgameTutorialSeen(): void {
  useEndgameStore().endgameTutorialSeen = true
}

/** 已见只在玩家关掉说明时置(dismissFruitTutorial);凝果、开窗都不置,否则说明显示中刷新或按返回即永久丢失 */
export function shouldShowFruitTutorial(): boolean {
  const endgame = useEndgameStore()
  if (endgame.daoFruitTutorialSeen) return false
  return true
}

export function markFruitTutorialSeen(): void {
  useEndgameStore().daoFruitTutorialSeen = true
}

/** 道果说明打开后这段时间内的关闭不作数:「知道了」盖在「道果 +1」上,连点第二下会关掉一次性说明 */
export const FRUIT_TUTORIAL_CLOSE_GUARD_MS = 400

export function fruitTutorialClosable(openedAt: number, now: number): boolean {
  return now - openedAt >= FRUIT_TUTORIAL_CLOSE_GUARD_MS
}

/** 道果说明的关闭请求:保护期内不作数;作数才置已见 */
export function dismissFruitTutorial(openedAt: number, now: number): boolean {
  if (!fruitTutorialClosable(openedAt, now)) return false
  markFruitTutorialSeen()
  return true
}

// ---------- S6 行为埋点 ----------

export interface ResourceCognitionStats {
  daoSource: number
  daoFruit: number
  /** 是否见过终局教学 */
  tutorialSeen: boolean
  /** 是否关掉过道果说明;凝果不算 */
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
