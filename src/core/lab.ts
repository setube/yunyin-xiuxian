/**
 * 修士实验室:反事实换装推演。只回答「换了以后局面会怎样」,不回答「该不该换」。
 * 与实战同口径:敌人按本界锚点定标,玩家的基础三维与构筑厚度都体现在读数里。
 */
import type { AnyStatKey, CombatantSnap, StatMods } from '@/types'
import { add, subClamp } from '@/utils/gnum'
import { mulberry32, RandomService } from '@/utils/random'
import { CELESTIAL_WORLDS } from '@/data/endgame'
import { equipmentTemplate } from '@/data/equipment'
import { STAT_NAMES } from '@/data/statNames'
import { buildPlayerSnap } from './playerSnap'
import { detectBuild, type BuildDetection } from './buildDetect'
import { resolveEquipStats } from './equipGen'
import { celestialAnchor, celestialFoeCaliber, mergeRules, runGauntlet, worldFoeSnap, type CelestialJudgement } from './gauntlet'
import { currentDaoRules } from './endgameService'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'

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



/**
 * `judgement` 由调用方传入并**前后共用**,不在函数内按各自身快照重算。
 *
 * 原先两次调用各传 before / after 的 mods,而 `celestialJudgement` 的加厚与增伤
 * 是按玩家词条厚度(`modDepth`)算的 —— 换上更厚的装备,敌人也跟着变厚。
 * 实测终局档:before depth 2.80 → 加厚 1.077、after depth 3.20 → 1.231,
 * 同一次「换了会怎样」的推演里,前后对比的根本不是同一个敌人。
 * 那会让读数系统性偏向「换了没变好」,正是上面那句注释想避免的事。
 */
function worldRate(
  world: (typeof CELESTIAL_WORLDS)[number],
  snap: CombatantSnap,
  judgement: CelestialJudgement,
  seed: number
): number {
  const ref = celestialAnchor(world.anchorTier)
  const foes: CombatantSnap[] = []
  for (let i = 0; i < world.fights - 1; i += 1) foes.push(worldFoeSnap(world.foes[i % world.foes.length]!, ref, 1, judgement))
  foes.push(worldFoeSnap(world.guardian, ref, 1, judgement))
  const rules = mergeRules(currentDaoRules(), world.rules)
  const rng = new RandomService(mulberry32(seed))
  let clears = 0
  for (let i = 0; i < 6; i += 1) {
    if (runGauntlet(snap, foes, rules, world.healBetweenPct, rng).cleared) clears += 1
  }
  return clears / 6
}

/** 若装备此件(替换同部位当前佩戴),四天局面各会怎样。按增减量修正快照,忽略百分比乘区的二阶项 */
export function whatIfEquip(uid: string): WhatIfReport | null {
  const inventory = useInventoryStore()
  const item = inventory.findItem(uid)
  const template = item ? equipmentTemplate(item.templateId) : undefined
  if (!item || !template) return null
  const currentUid = inventory.equipped[template.slot]
  if (currentUid === uid) return null

  const before = buildPlayerSnap(true)
  const gain = resolveEquipStats(item)
  const currentItem = currentUid ? inventory.findItem(currentUid) : undefined
  const lose = currentItem ? resolveEquipStats(currentItem) : undefined

  // 词条直接取增量:器魂是叠加上去的一层(见 stores/player 的 celestialStats),不做压缩后取差
  const mods: StatMods = { ...before.mods }
  for (const k of new Set([...Object.keys(gain.mods), ...Object.keys(lose?.mods ?? {})])) {
    const key = k as AnyStatKey
    const d = (gain.mods[key] ?? 0) - (lose?.mods[key] ?? 0)
    if (d !== 0) mods[key] = (mods[key] ?? 0) + d
  }

  let attack = add(before.attack, gain.flats.attack)
  let defense = add(before.defense, gain.flats.defense)
  let maxHp = add(before.maxHp, gain.flats.maxHp)
  if (lose) {
    attack = subClamp(attack, lose.flats.attack)
    defense = subClamp(defense, lose.flats.defense)
    maxHp = subClamp(maxHp, lose.flats.maxHp)
  }
  const after: CombatantSnap = { ...before, mods, attack, defense, maxHp }

  // 敌人标定一次、前后共用:玩家问的是「现在这身换成它会怎样」,对手不该跟着换
  const judgementOf = (w: (typeof CELESTIAL_WORLDS)[number]): CelestialJudgement =>
    celestialFoeCaliber(usePlayerStore().major, before.mods, w.anchorTier).judgement

  const worlds: WhatIfWorldRow[] = CELESTIAL_WORLDS.map((w, i) => {
    const j = judgementOf(w)
    const rb = rateRank(worldRate(w, before, j, 660000 + i * 97))
    const ra = rateRank(worldRate(w, after, j, 660000 + i * 97))
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
