/**
 * 装备生成与数值解析 —— Template + 随机品质 + 随机词条 → Instance
 */
import type { AnyStatKey, EquipmentInstance, EquipSlot, GNum, QualityDef, StatMods } from '@/types'
import type { RandomService } from '@/utils/random'
import { uid } from '@/utils/id'
import { gnZero, mulN, add } from '@/utils/gnum'
import { AFFIXES, affixDef, affixValue } from '@/data/affixes'
import { EQUIPMENT_TEMPLATES, equipmentTemplate } from '@/data/equipment'
import { QUALITIES, qualityDef } from '@/data/qualities'
import { EQUIP_BASE_FACTOR, EQUIP_LEVEL_BONUS, EQUIP_QUALITY_FLAT_EXP, QUALITY_TIER_SHIFT } from '@/data/constants'
import { powerScale } from './formulas'

export interface GenOptions {
  slot?: EquipSlot
  minQualityRank?: number
  /** 气运(提高高品质权重) */
  luck?: number
}

/** 品质随机:层级越高、气运越高,高品质权重越大 */
export function rollQuality(tier: number, rng: RandomService, opts: GenOptions = {}): QualityDef {
  const luck = opts.luck ?? 0
  const floor = opts.minQualityRank ?? 0
  const pool = QUALITIES.filter(q => q.rank >= floor)
  return rng.weighted(pool, q => {
    if (q.rank === 0) return q.weight
    const tierBoost = Math.pow(QUALITY_TIER_SHIFT, (tier - 1) * Math.min(q.rank, 4) * 0.35)
    const luckBoost = 1 + luck * (q.rank >= 3 ? 1.5 : 0.5)
    return q.weight * tierBoost * luckBoost
  })
}

/** 生成一件装备实例 */
export function generateEquipment(tier: number, rng: RandomService, opts: GenOptions = {}): EquipmentInstance {
  const eligible = EQUIPMENT_TEMPLATES.filter(
    t => t.minTier <= tier && (opts.slot === undefined || t.slot === opts.slot) && t.slot !== 'artifact'
  )
  // 优先掉落接近当前层级的模板
  const sorted = [...eligible].sort((a, b) => b.minTier - a.minTier)
  const top = sorted.slice(0, Math.min(6, sorted.length))
  const template = rng.weighted(top, t => 1 + t.minTier)

  const quality = rollQuality(tier, rng, opts)
  const [minA, maxA] = quality.affixes
  const affixCount = rng.int(minA, maxA)

  const chosen: { id: string; roll: number }[] = []
  const used = new Set<string>()
  let guard = 0
  while (chosen.length < affixCount && guard < 50) {
    guard += 1
    const candidates = AFFIXES.filter(
      a =>
        !used.has(a.id) &&
        (a.minRank === undefined || quality.rank >= a.minRank) &&
        (a.slots === undefined || a.slots.includes(template.slot))
    )
    if (candidates.length === 0) break
    const picked = rng.weighted(candidates, a => a.weight)
    used.add(picked.id)
    chosen.push({ id: picked.id, roll: rng.next() })
  }

  return {
    uid: uid(),
    templateId: template.id,
    quality: quality.id,
    tier,
    level: 0,
    affixes: chosen
  }
}

export interface ResolvedEquipStats {
  flats: { attack: GNum; defense: GNum; maxHp: GNum }
  mods: StatMods
  /** 词条展示行 */
  affixLines: { id: string; name: string; desc: string }[]
}

/** 解析装备实例的实际数值 */
export function resolveEquipStats(inst: EquipmentInstance): ResolvedEquipStats {
  const template = equipmentTemplate(inst.templateId)
  const flats = { attack: gnZero(), defense: gnZero(), maxHp: gnZero() }
  const mods: StatMods = {}
  const affixLines: { id: string; name: string; desc: string }[] = []
  if (!template) return { flats, mods, affixLines }

  const q = qualityDef(inst.quality)
  const scale = powerScale(inst.tier)
  // 品质对平铺按 EQUIP_QUALITY_FLAT_EXP 压缩:高品质的价值主要体现在词条数量上,
  // 而不是把平铺数值再翻几倍(Phase 33.2,详见常量处注释)
  const factor = EQUIP_BASE_FACTOR * Math.pow(q.mult, EQUIP_QUALITY_FLAT_EXP) * (1 + inst.level * EQUIP_LEVEL_BONUS)

  for (const key of ['attack', 'defense', 'maxHp'] as const) {
    const weight = template.base[key]
    if (weight) flats[key] = add(flats[key], mulN(scale, weight * factor))
  }
  if (template.fixedMods) {
    for (const k in template.fixedMods) {
      const key = k as AnyStatKey
      mods[key] = (mods[key] ?? 0) + (template.fixedMods[key] ?? 0)
    }
  }
  for (const roll of inst.affixes) {
    const def = affixDef(roll.id)
    if (!def) continue
    const value = affixValue(def, roll.roll)
    mods[def.key] = (mods[def.key] ?? 0) + value / 100
    affixLines.push({ id: def.id, name: def.name, desc: def.desc.replace('{v}', String(value)) })
  }
  return { flats, mods, affixLines }
}
