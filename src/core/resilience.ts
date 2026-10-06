/**
 * 构筑韧性(Phase 22)—— 主流派核心词条被封后,战斗力还剩几成
 * 不是数值,是「第二套答案」的存在性度量;逆命契前最值得看一眼
 */
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

/** 等比敌采样场次 —— BuildView 的「N 场等比敌采样」注释就是它(曾写崩成 120) */
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
    if (resolveCombat(snap, foe, rng).win) wins += 1
  }
  return wins / runs
}

/**
 * 测定构筑韧性:对「与自身等比的基准敌」分别以完整构筑与封核构筑各战 runs 场。
 * 敌人等比生成(天界思路),任何数值段的玩家都可测
 */
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

/** 韧性评语:给玩家的是解读,不是指令 */
export function resilienceText(r: ResilienceReport): string {
  if (r.retention >= 0.75) return '道基浑厚——主派被封仍有战力,逆命契于你是机会'
  if (r.retention >= 0.45) return '尚有余地——副体系撑得起半边天,逆命契需谨慎'
  return '孤注一掷——此构筑极度依赖主派核心,逆命契近乎自缚'
}
