/**
 * 随机构筑搜索(Phase 19)
 * 在可达词条空间内随机生成大量构筑批量对战:
 * ① 寻找人类没想到的 Emergent Build ② 万金油/陷阱构筑检测 ③ 战力-胜率相关性
 */
import type { CombatantSnap, StatMods, AnyStatKey } from '@/types'
import { gn, toNum } from '@/utils/gnum'
import { mulberry32, RandomService } from '@/utils/random'
import { ARTIFACTS } from '@/data/artifacts'
import { resolveCombat } from './combat'
import { powerScore } from './formulas'
import { detectBuild } from './buildDetect'
import { ENEMY_ARCHETYPES, WALL_IDS } from './buildSim'

/** 可随机的词条空间(上限 ≈ 中期成型构筑的可达值) */
const KEY_RANGES: [AnyStatKey, number][] = [
  ['lowHpDamage', 1.0],
  ['lowHpReduction', 0.5],
  ['fullHpDamage', 0.6],
  ['firstStrike', 0.8],
  ['shieldOnStart', 0.5],
  ['shieldPower', 0.5],
  ['counterRate', 0.6],
  ['counterDamage', 1.5],
  ['comboRate', 0.55],
  ['comboDamage', 0.8],
  ['lifesteal', 0.15],
  ['regenPerRound', 0.04],
  ['overhealShield', 1.0],
  ['dodgeRate', 0.18],
  ['critRate', 0.3],
  ['critDamage', 0.8],
  ['damageReduction', 0.25],
  ['damageBonus', 0.3],
  ['armorPen', 0.3],
  ['executeDamage', 0.5],
  ['stunRate', 0.15],
  ['speed', 0.35]
]

const BASE = { attack: 100, defense: 55, maxHp: 1400 }

export interface RandomBuild {
  idx: number
  snap: CombatantSnap
  mods: StatMods
  power: number
}

export function randomBuild(rng: RandomService, idx: number): RandomBuild {
  const mods: StatMods = {}
  const keyCount = rng.int(3, 6)
  const pool = [...KEY_RANGES]
  for (let i = 0; i < keyCount && pool.length > 0; i += 1) {
    const [key, max] = pool.splice(rng.int(0, pool.length - 1), 1)[0]!
    // 中期成型档:词条取上限的 30%~80%(极限毕业档另行统计,见 spec 输出)
    mods[key] = Math.round(rng.float(0.3, 0.8) * max * 100) / 100
  }
  // 属性预算守恒:三维只能偏科,不能同时拉满(对应真实装备槽位约束)
  let sa = rng.float(0.7, 1.45)
  let sd = rng.float(0.7, 1.45)
  let sh = rng.float(0.7, 1.45)
  const budget = Math.cbrt(sa * sd * sh)
  sa /= budget
  sd /= budget
  sh /= budget
  const atk = gn(BASE.attack * sa)
  const def = gn(BASE.defense * sd)
  const hp = gn(BASE.maxHp * sh)
  const art = rng.chance(0.7) ? rng.pick(ARTIFACTS.filter(a => a.fromTier <= 12)) : null
  return {
    idx,
    mods,
    power: toNum(powerScore(atk, def, hp)),
    snap: {
      name: `构筑#${idx}`,
      icon: 'user',
      isPlayer: true,
      attack: atk,
      defense: def,
      maxHp: hp,
      speed: 1 + (mods.speed ?? 0),
      mods,
      skills: [{ name: '杂学杀招', mult: 1.7, rate: 0.25 }],
      artifacts: art ? [{ def: art, level: 2 }] : []
    }
  }
}

export interface SearchResult {
  build: RandomBuild
  cells: number[]
  avg: number
  /** 万金油:≥70% 场景胜率 ≥98% */
  universal: boolean
  /** 陷阱:所有场景胜率 <30% */
  trap: boolean
  identity: string
}

export interface SearchReport {
  results: SearchResult[]
  universals: SearchResult[]
  traps: SearchResult[]
  /** 战力 vs 平均胜率 的皮尔逊相关系数 */
  powerCorrelation: number
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  const mx = xs.reduce((s, x) => s + x, 0) / n
  const my = ys.reduce((s, y) => s + y, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i += 1) {
    const a = xs[i]! - mx
    const b = ys[i]! - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  return num / Math.sqrt(dx * dy)
}

export function searchBuilds(n = 1000, fightsPerArch = 20, seed = 20260830): SearchReport {
  const rng = new RandomService(mulberry32(seed))
  const results: SearchResult[] = []
  for (let i = 0; i < n; i += 1) {
    const build = randomBuild(rng, i)
    const cells: number[] = []
    for (const arch of ENEMY_ARCHETYPES) {
      let wins = 0
      for (let f = 0; f < fightsPerArch; f += 1) {
        if (resolveCombat(build.snap, arch.snap(), rng).win) wins += 1
      }
      cells.push(wins / fightsPerArch)
    }
    const avg = cells.reduce((s, x) => s + x, 0) / cells.length
    // 万金油判定:连「高压墙」都通吃 —— 首领/高爆发/真伤/疾影 四墙中 ≥3 面 ≥95%,且首领 ≥90%
    const wallIdx = ENEMY_ARCHETYPES.map((a, i) => (WALL_IDS.includes(a.id) ? i : -1)).filter(i => i >= 0)
    const bossIdx = ENEMY_ARCHETYPES.findIndex(a => a.id === 'boss')
    const wallsBroken = wallIdx.filter(i => cells[i]! >= 0.95).length
    const universal = wallsBroken >= 3 && cells[bossIdx]! >= 0.9
    const trap = cells.every(c => c < 0.3)
    results.push({
      build,
      cells,
      avg,
      universal,
      trap,
      identity: detectBuild(build.mods)?.displayName ?? '杂学'
    })
  }
  results.sort((a, b) => b.avg - a.avg)
  return {
    results,
    universals: results.filter(r => r.universal),
    traps: results.filter(r => r.trap),
    powerCorrelation: pearson(
      results.map(r => r.build.power),
      results.map(r => r.avg)
    )
  }
}
