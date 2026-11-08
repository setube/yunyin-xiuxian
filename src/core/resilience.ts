/** 构筑韧性:主流派核心词条被封后,战斗力还剩几成 */
import type { CombatantSnap, StatMods } from '@/types'
import { mulberry32, RandomService } from '@/utils/random'
import { TRIAL_FOES } from '@/data/endgame'
import { resolveCombat } from './combat'
import { worldFoeSnap } from './gauntlet'
import { detectBuild, type BuildStyleDef } from './buildDetect'

export interface ResilienceReport {
  styleName: string
  /** 正常胜率(等比基准敌) */
  normal: number
  /** 主派核心词条封印后胜率 */
  sealed: number
  /** 保持度 sealed/normal */
  retention: number
}

/** 等比敌采样场次;BuildView 注释里的「N 场等比敌采样」就是它 */
export const RESILIENCE_SAMPLE_RUNS = 60

/** 封印指定流派的核心词条(清零,不改其他) */
export function sealStyleMods(mods: StatMods, style: BuildStyleDef): StatMods {
  const out: StatMods = { ...mods }
  for (const k of Object.keys(style.core)) {
    delete out[k as keyof StatMods]
  }
  return out
}

function winRate(snap: CombatantSnap, foe: CombatantSnap, runs: number, seed: number): number {
  const rng = new RandomService(mulberry32(seed))
  let wins = 0
  for (let i = 0; i < runs; i += 1) {
    // 只读 .win,不必建战报
    if (resolveCombat(snap, foe, rng, undefined, false).win) wins += 1
  }
  return wins / runs
}

/** 测定构筑韧性:对与自身等比的基准敌,完整构筑与封核构筑各战 runs 场 */
export function measureResilience(snap: CombatantSnap, runs = RESILIENCE_SAMPLE_RUNS): ResilienceReport | null {
  const build = detectBuild(snap.mods)
  if (!build) return null
  const foe = worldFoeSnap(TRIAL_FOES[0]!, { attack: snap.attack, defense: snap.defense, maxHp: snap.maxHp }, 1.06)
  const sealedSnap: CombatantSnap = { ...snap, mods: sealStyleMods(snap.mods, build.style), comboArt: undefined }
  const normal = winRate(snap, foe, runs, 8801)
  const sealed = winRate(sealedSnap, foe, runs, 8802)
  return {
    styleName: build.style.name,
    normal,
    sealed,
    retention: normal > 0 ? sealed / normal : 0
  }
}

/** 韧性档位:按保持度分三档,只报档名 */
export function resilienceText(r: ResilienceReport): string {
  if (r.retention >= 0.75) return '道基浑厚'
  if (r.retention >= 0.45) return '尚有余地'
  return '孤注一掷'
}
