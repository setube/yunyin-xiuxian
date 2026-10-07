/**
 * Meta 演化模拟(Phase 25)—— 规则系统对「版本变化」是否稳定
 * 循环:找出当前最强流派 → 削其词条 → 重测。
 * 健康的系统:最优解温和轮换、始终多解;病态的系统:每次削弱都催生新的近必胜
 */
import type { CombatantSnap, StatMods } from '@/types'
import { mulberry32, RandomService } from '@/utils/random'
import { CELESTIAL_WORLDS } from '@/data/endgame'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { worldFoes } from './celestialSim'
import { runGauntlet } from './gauntlet'

export interface MetaRound {
  round: number
  /** 本轮开测前被削弱的流派(第 1 轮为 null) */
  nerfed: string | null
  topStyle: string
  topRate: number
  secondRate: number
  viable: number
}

/** 某流派(可带累计削弱系数)的四天平均通关率 */
function avgClearRate(snap: CombatantSnap, runs: number, seedBase: number): number {
  let sum = 0
  for (let w = 0; w < CELESTIAL_WORLDS.length; w += 1) {
    const world = CELESTIAL_WORLDS[w]!
    // 与 celestialSim.worldFoes / production expedition 同一口径:守关者按本流派形状
    // 算道之理解判定(厚构筑会被加厚),否则厚筑流派的通关率会被系统性高估。
    const rng = new RandomService(mulberry32(seedBase + w * 131))
    const foes = worldFoes(world, snap)
    let clears = 0
    for (let r = 0; r < runs; r += 1) {
      if (runGauntlet(snap, foes, world.rules, world.healBetweenPct, rng).cleared) clears += 1
    }
    sum += clears / runs
  }
  return sum / CELESTIAL_WORLDS.length
}

function nerfMods(mods: StatMods, factor: number): StatMods {
  const out: StatMods = {}
  for (const k in mods) {
    const key = k as keyof StatMods
    out[key] = (mods[key] ?? 0) * factor
  }
  return out
}

/**
 * 演化 N 轮:每轮把上一轮的最强流派全词条 ×0.75(累计),观察 Meta 是否温和轮换
 */
export function runMetaEvolution(rounds = 5, runsPerWorld = 8): MetaRound[] {
  const nerfLevel = new Map<string, number>()
  const result: MetaRound[] = []
  let lastTop: string | null = null
  for (let round = 1; round <= rounds; round += 1) {
    const rates = BUILD_PROFILES.map((p, i) => {
      const factor = Math.pow(0.75, nerfLevel.get(p.id) ?? 0)
      const base = buildSnap(p)
      const snap: CombatantSnap = factor === 1 ? base : { ...base, mods: nerfMods(base.mods, factor) }
      return { id: p.id, name: p.name, rate: avgClearRate(snap, runsPerWorld, 88000 + round * 977 + i * 17) }
    }).sort((a, b) => b.rate - a.rate)
    result.push({
      round,
      nerfed: lastTop,
      topStyle: rates[0]!.name,
      topRate: rates[0]!.rate,
      secondRate: rates[1]!.rate,
      viable: rates.filter(r => r.rate >= 0.3).length
    })
    lastTop = rates[0]!.name
    nerfLevel.set(rates[0]!.id, (nerfLevel.get(rates[0]!.id) ?? 0) + 1)
  }
  return result
}
