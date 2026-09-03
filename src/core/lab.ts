/**
 * 修士实验室(Phase 26)—— 反事实换装推演
 * 原则:回答「换了以后局面会怎样」,不回答「该不该换」。
 * 天界敌人与你等比,三维变化自动抵消——推演读数只体现构筑形状,与天界规则一致
 */
import type { AnyStatKey, CombatantSnap, StatMods } from '@/types'
import { add, subClamp } from '@/utils/gnum'
import { mulberry32, RandomService } from '@/utils/random'
import { CELESTIAL_WORLDS } from '@/data/endgame'
import { equipmentTemplate } from '@/data/equipment'
import { STAT_NAMES } from '@/ui/statNames'
import { buildPlayerSnap } from './playerSnap'
import { detectBuild, type BuildDetection } from './buildDetect'
import { resolveEquipStats } from './equipGen'
import { celestialDepthScale, mergeRules, runGauntlet, worldFoeSnap } from './gauntlet'
import { currentDaoRules } from './endgameService'
import { useInventoryStore } from '@/stores/inventory'

export interface WhatIfWorldRow {
  name: string
  seal: string
  beforeText: string
  afterText: string
  /** 变好 / 变差 / 持平(供染色) */
  trend: 'up' | 'down' | 'flat'
}

export interface WhatIfReport {
  buildBefore: BuildDetection | null
  buildAfter: BuildDetection | null
  worlds: WhatIfWorldRow[]
  /** 主要词条变化(绝对值最大前四) */
  modChanges: { label: string; delta: number }[]
}

const RANK_TEXT = ['九死一生', '凶险', '胜负各半', '略占上风', '稳操胜券'] as const

function rateRank(rate: number): number {
  return rate >= 0.85 ? 4 : rate >= 0.6 ? 3 : rate >= 0.4 ? 2 : rate >= 0.15 ? 1 : 0
}

function applyModDelta(base: StatMods, source: StatMods | undefined, sign: 1 | -1): StatMods {
  if (!source) return base
  const out: StatMods = { ...base }
  for (const k in source) {
    const key = k as AnyStatKey
    out[key] = (out[key] ?? 0) + sign * (source[key] ?? 0)
  }
  return out
}

function worldRate(world: (typeof CELESTIAL_WORLDS)[number], snap: CombatantSnap, seed: number): number {
  const ref = { attack: snap.attack, defense: snap.defense, maxHp: snap.maxHp }
  // 词条对称与实战同口径,否则推演读数会比真打更乐观
  const depth = celestialDepthScale(snap.mods)
  const foes: CombatantSnap[] = []
  for (let i = 0; i < world.fights - 1; i += 1) foes.push(worldFoeSnap(world.foes[i % world.foes.length]!, ref, 1, depth))
  foes.push(worldFoeSnap(world.guardian, ref, 1, depth))
  const rules = mergeRules(currentDaoRules(), world.rules)
  const rng = new RandomService(mulberry32(seed))
  let clears = 0
  for (let i = 0; i < 6; i += 1) {
    if (runGauntlet(snap, foes, rules, world.healBetweenPct, rng).cleared) clears += 1
  }
  return clears / 6
}

/**
 * 若装备此件(替换同部位当前佩戴),四天局面各会怎样。
 * 近似:词条与平铺数值按增减量修正快照,忽略百分比乘区的二阶项——推演给档位,不给假精确
 */
export function whatIfEquip(uid: string): WhatIfReport | null {
  const inventory = useInventoryStore()
  const item = inventory.findItem(uid)
  const template = item ? equipmentTemplate(item.templateId) : undefined
  if (!item || !template) return null
  const currentUid = inventory.equipped[template.slot]
  if (currentUid === uid) return null

  const before = buildPlayerSnap()
  const gain = resolveEquipStats(item)
  let mods = applyModDelta(before.mods, gain.mods, 1)
  let attack = add(before.attack, gain.flats.attack)
  let defense = add(before.defense, gain.flats.defense)
  let maxHp = add(before.maxHp, gain.flats.maxHp)
  const currentItem = currentUid ? inventory.findItem(currentUid) : undefined
  if (currentItem) {
    const lose = resolveEquipStats(currentItem)
    mods = applyModDelta(mods, lose.mods, -1)
    attack = subClamp(attack, lose.flats.attack)
    defense = subClamp(defense, lose.flats.defense)
    maxHp = subClamp(maxHp, lose.flats.maxHp)
  }
  const after: CombatantSnap = { ...before, mods, attack, defense, maxHp }

  const worlds: WhatIfWorldRow[] = CELESTIAL_WORLDS.map((w, i) => {
    const rb = rateRank(worldRate(w, before, 660000 + i * 97))
    const ra = rateRank(worldRate(w, after, 660000 + i * 97))
    return {
      name: w.name,
      seal: w.seal,
      beforeText: RANK_TEXT[rb]!,
      afterText: RANK_TEXT[ra]!,
      trend: ra > rb ? 'up' : ra < rb ? 'down' : 'flat'
    }
  })

  const deltas: { label: string; delta: number }[] = []
  const keys = new Set([...Object.keys(before.mods), ...Object.keys(after.mods)])
  for (const k of keys) {
    const key = k as AnyStatKey
    const d = (after.mods[key] ?? 0) - (before.mods[key] ?? 0)
    if (Math.abs(d) > 0.005) deltas.push({ label: STAT_NAMES[key] ?? key, delta: Math.round(d * 1000) / 1000 })
  }
  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return {
    buildBefore: detectBuild(before.mods),
    buildAfter: detectBuild(after.mods),
    worlds,
    modChanges: deltas.slice(0, 4)
  }
}
