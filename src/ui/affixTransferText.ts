/**
 * 词条转移(议题 #22)界面文案:只报状态、结果、代价。
 * 长度 spec 钉:affixTransferText.spec(状态 ≤8 字、按钮 2~6 字、提示 ≤12 字)。缺料写「不足」,与重铸、封存同词。
 */
import type { AffixRoll, AnyStatKey, GNum, StatMods } from '@/types'
import { resourceShortText } from './resourceShortText'
import { affixDef, affixValue } from '@/data/affixes'
import { QUALITIES } from '@/data/qualities'
import { formatGN } from '@/utils/format'
import { STAT_NAMES, signedPercent } from '@/data/statNames'
import type { TransferBlock, TransferShort } from '@/core/affixTransfer'

/** 原因码 → 标签。rank 另由 transferBlockText 补上「需某品」 */
const BLOCK_TEXT: Record<Exclude<TransferBlock, 'rank'>, string> = {
  same: '同一件',
  noAffix: '词条无效',
  noTemplate: '目标无效',
  slot: '部位不符',
  dup: '已有此条',
  noLanding: '位置无效',
  full: '词条已满',
  stack: '属性重叠',
  sealFull: '不可封存'
}

export const TRANSFER_LABELS = {
  entry: '转移词条',
  back: '返回',
  out: '转出',
  into: '转入',
  slot: '位置',
  result: '结果',
  change: '更换',
  view: '前往',
  noAffix: '暂无词条',
  noTarget: '暂无目标',
  equipped: '已装备',
  append: '新增',
  replace: '顶替',
  newTag: '新',
  sealed: '已封存',
  seal: '同时封存',
  sealKeep: '沿用封存',
  sealFull: BLOCK_TEXT.sealFull,
  delta: '目标',
  sourceLose: '源件失去',
  cost: '花费',
  go: '转 移',
  confirm: '确认转移',
  cancel: '再想想',
  pendingAffix: '未选词条',
  pendingTarget: '未选目标',
  pendingSlot: '未选位置',
  gone: '未找到装备'
} as const

/** 挡住这次转移的原因;品质不足时写明要哪一品 */
export function transferBlockText(block: TransferBlock, affixId: string): string {
  if (block !== 'rank') return BLOCK_TEXT[block]
  const minRank = affixDef(affixId)?.minRank ?? 0
  const q = QUALITIES.find(x => x.rank === minRank)
  return q ? `需${q.name}` : '品质不足'
}

/** 缺哪样报哪样;给了实际差额写「尚差 N」 */
export function transferShortText(short: Exclude<TransferShort, null>, gap?: { stone: string; dust: number }): string {
  return resourceShortText(short, gap)
}

export function transferDoneToast(name: string): string {
  return `「${name}」已转入`
}

export function transferShowAllText(n: number): string {
  return `全部 ${n} 件`
}

export function transferStoneText(stone: GNum): string {
  return `灵石 ${formatGN(stone)}`
}

export function transferCountText(before: number, after: number, cap: number): string {
  return `${before} → ${after} / ${cap} 条`
}

/** 词条整句:「名」+ 效果(数值已代入);重名词条靠效果句分开 */
export function transferAffixText(roll: AffixRoll): string {
  const def = affixDef(roll.id)
  if (!def) return roll.id
  return `「${def.name}」${def.desc.replace('{v}', String(affixValue(def, roll.roll)))}`
}

/** 落地前后这一件自身的属性变化:只列变了的,按变动幅度降序 */
export function transferDeltaText(before: StatMods, after: StatMods): string {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)] as AnyStatKey[])
  return [...keys]
    .map(k => ({ k, d: (after[k] ?? 0) - (before[k] ?? 0) }))
    .filter(x => Math.abs(x.d) > 1e-9)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .map(x => `${STAT_NAMES[x.k] ?? x.k} ${signedPercent(x.d)}`)
    .join(' · ')
}
