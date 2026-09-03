/**
 * 终局世界模拟器(Phase 20)
 * 每个特殊世界发布前必须通过六项守恒条件 —— buildSim 成为终局的自动裁判
 */
import type { CelestialWorldDef, CombatantSnap } from '@/types'
import { gn } from '@/utils/gnum'
import { mulberry32, RandomService } from '@/utils/random'
import { CELESTIAL_WORLDS } from '@/data/endgame'
import { BUILD_PROFILES, buildSnap, type BuildProfile } from './buildSim'
import { randomBuild } from './buildSearch'
import { celestialDepthScale, mergeRules, runGauntlet, worldFoeSnap, type ReferenceStats } from './gauntlet'

/** 模拟参照属性(与 buildSim 基准一致) */
export const SIM_REFERENCE: ReferenceStats = {
  attack: gn(100),
  defense: gn(55),
  maxHp: gn(1400)
}

function worldFoes(world: CelestialWorldDef, snap: CombatantSnap): CombatantSnap[] {
  // 词条对称与实战同口径:审计基准若不随被测构筑加厚,厚构筑会被高估
  const depth = celestialDepthScale(snap.mods)
  const foes: CombatantSnap[] = []
  for (let i = 0; i < world.fights - 1; i += 1) {
    foes.push(worldFoeSnap(world.foes[i % world.foes.length]!, SIM_REFERENCE, 1, depth))
  }
  foes.push(worldFoeSnap(world.guardian, SIM_REFERENCE, 1, depth))
  return foes
}

/** 某构筑在某世界的通关率 */
export function worldClearRate(world: CelestialWorldDef, snap: CombatantSnap, runs: number, seed: number): number {
  const rng = new RandomService(mulberry32(seed))
  const foes = worldFoes(world, snap)
  let clears = 0
  for (let i = 0; i < runs; i += 1) {
    if (runGauntlet(snap, foes, world.rules, world.healBetweenPct, rng).cleared) clears += 1
  }
  return clears / runs
}

export interface WorldAuditRow {
  world: CelestialWorldDef
  /** 六大流派通关率 */
  byStyle: { profile: BuildProfile; clearRate: number }[]
  bestStyleId: string
  worstStyleId: string
  viableCount: number
  /** 随机构筑扫描的最高通关率 */
  randomBest: number
}

export function auditWorld(world: CelestialWorldDef, randomN = 120): WorldAuditRow {
  const byStyle = BUILD_PROFILES.map((profile, i) => ({
    profile,
    clearRate: worldClearRate(world, buildSnap(profile), 25, 5000 + i * 37)
  }))
  const sorted = [...byStyle].sort((a, b) => b.clearRate - a.clearRate)
  // 随机扫描:8 次粗筛 → 前五名 30 次精测,消除小样本全胜噪声
  const rng = new RandomService(mulberry32(world.id.length * 7919))
  const coarse: { snap: CombatantSnap; rate: number }[] = []
  for (let i = 0; i < randomN; i += 1) {
    const rb = randomBuild(rng, i)
    coarse.push({ snap: rb.snap, rate: worldClearRate(world, rb.snap, 8, 9000 + i) })
  }
  coarse.sort((a, b) => b.rate - a.rate)
  let randomBest = 0
  for (let i = 0; i < Math.min(5, coarse.length); i += 1) {
    const precise = worldClearRate(world, coarse[i]!.snap, 30, 40000 + i * 13)
    if (precise > randomBest) randomBest = precise
  }
  return {
    world,
    byStyle,
    bestStyleId: sorted[0]!.profile.id,
    worstStyleId: sorted[sorted.length - 1]!.profile.id,
    viableCount: byStyle.filter(x => x.clearRate >= 0.35).length,
    randomBest
  }
}

export function auditAllWorlds(): WorldAuditRow[] {
  return CELESTIAL_WORLDS.map(w => auditWorld(w))
}

/**
 * 跨界通吃检测:同一随机构筑对全部四天的通关率下限
 * 单天存在高通率答案是终局 farm 的正反馈;要防的是四天皆 ≥90% 的万金油
 */
export function crossWorldUniversals(n = 120): { count: number; worstCaseBest: number } {
  const rng = new RandomService(mulberry32(424242))
  const candidates: { snap: CombatantSnap; minRate: number }[] = []
  for (let i = 0; i < n; i += 1) {
    const rb = randomBuild(rng, i)
    let minRate = 1
    for (const world of CELESTIAL_WORLDS) {
      const rate = worldClearRate(world, rb.snap, 6, 70000 + i * 11)
      minRate = Math.min(minRate, rate)
      if (minRate === 0) break
    }
    candidates.push({ snap: rb.snap, minRate })
  }
  candidates.sort((a, b) => b.minRate - a.minRate)
  // 粗筛前十精测
  let count = 0
  let worstCaseBest = 0
  for (let i = 0; i < Math.min(10, candidates.length); i += 1) {
    let minRate = 1
    for (const world of CELESTIAL_WORLDS) {
      minRate = Math.min(minRate, worldClearRate(world, candidates[i]!.snap, 20, 80000 + i * 17))
    }
    worstCaseBest = Math.max(worstCaseBest, minRate)
    if (minRate >= 0.9) count += 1
  }
  return { count, worstCaseBest }
}

export { mergeRules }
