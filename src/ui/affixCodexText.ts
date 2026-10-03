/**
 * 词条图的字面 —— 名、效果、数值区间、部位、品质门槛。
 *
 * 全部从 data/affixes 与 data/qualities 现算,不在表里抄第二份数:
 * 区间的一端就是 affixValue(roll=0)、另一端 affixValue(roll=1),
 * 即掉落装备上真正会出现的那两头;改词条数值,这里自动跟上。
 */
import type { AffixDef } from '@/types'
import { affixValue } from '@/data/affixes'
import { QUALITIES } from '@/data/qualities'
import { EQUIP_SLOT_NAMES } from '@/data/equipment'
import { AFFIX_RARITY_META } from './statNames'

/** 效果整句:把 {v} 填上「低端~高端」(定值词条两端相等时只写一个数) */
export function affixRangeText(def: AffixDef): string {
  const lo = affixValue(def, 0)
  const hi = affixValue(def, 1)
  return def.desc.replace('{v}', lo === hi ? String(lo) : `${lo}~${hi}`)
}

/** 数值区间两头(供「数值区间 lo ~ hi」一行) */
export function affixRangeEnds(def: AffixDef): { lo: number; hi: number } {
  return { lo: affixValue(def, 0), hi: affixValue(def, 1) }
}

/** 可出的部位:不设 slots = 全部位;设了则按装备部位列名 */
export function affixSlotsText(def: AffixDef): string {
  if (!def.slots || def.slots.length === 0) return '全部位'
  return def.slots.map(s => EQUIP_SLOT_NAMES[s] ?? s).join('·')
}

/** 品质门槛:需第几品起;minRank 未设 = 无门槛 */
export function affixRankText(def: AffixDef): string | null {
  if (def.minRank === undefined) return null
  return `需${QUALITIES.find(q => q.rank === def.minRank)?.name ?? `${def.minRank} 品`}起`
}

/** 稀有度章与品位色 —— 直接喂 id 或整条定义都行 */
export function affixRarityLabel(def: AffixDef | AffixDef['rarity']): string {
  const r = typeof def === 'string' ? def : def.rarity
  return AFFIX_RARITY_META[r]?.name ?? String(r)
}

export function affixRarityColor(def: AffixDef | AffixDef['rarity']): string {
  const r = typeof def === 'string' ? def : def.rarity
  return AFFIX_RARITY_META[r]?.color ?? 'currentColor'
}
