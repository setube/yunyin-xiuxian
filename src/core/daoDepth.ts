/**
 * 道途深化(Phase 21)—— 剑意 / 杀意 / 长生印 / 天机透视的纯逻辑
 * 长生印在 CombatRules.perRounds 中实现;此处承载剑道纯度与逐胜叠层
 */
import type { StatMods } from '@/types'
import { STYLE_MATURE_AFFINITY, type BuildDetection } from './buildDetect'
import { modOf } from './statsCalc'

/** 剑意每层加成 */
export const SWORD_LAYER_MODS: StatMods = { damageBonus: 0.04, critRate: 0.02 }
/** 剑道远征逐胜叠层 */
export const SWORD_PER_WIN: StatMods = { damageBonus: 0.04, critRate: 0.02 }
/** 杀伐远征逐胜叠层 */
export const SLAUGHTER_PER_WIN: StatMods = { damageBonus: 0.05 }

export interface SwordPurity {
  layers: number
  /** 各项纯度判定(供 UI 解释「为什么是这几层」) */
  checks: { name: string; ok: boolean }[]
}

interface PurityCheckDef {
  name: string
  ok: (mods: StatMods, artifactCount: number, build: BuildDetection | null) => boolean
}

/** 纯度判定共四则:层数即判定项数,UI 的「/N 层」读 SWORD_PURITY_MAX_LAYERS,不另处手抄 */
const PURITY_CHECK_DEFS: PurityCheckDef[] = [
  // 「契合 ≥60%」是成形门槛(STYLE_MATURE_AFFINITY)的镜像 —— 判定与文案同读一枚
  {
    name: `主流派成形(契合 ≥${Math.round(STYLE_MATURE_AFFINITY * 100)}%)`,
    ok: (_mods, _art, build) => (build?.affinity ?? 0) >= STYLE_MATURE_AFFINITY
  },
  { name: '道路纯粹(无副体系)', ok: (_mods, _art, build) => build !== null && build.secondary === undefined },
  { name: '法宝不过一件', ok: (_mods, art, _build) => art <= 1 },
  { name: '不修回血之术', ok: (mods, _art, _build) => modOf(mods, 'lifesteal') + modOf(mods, 'regenPerRound') < 0.02 }
]

/** 剑意统共几层 —— 判定项数即层数,增删一条判定时「/N」同步跟着走 */
export const SWORD_PURITY_MAX_LAYERS = PURITY_CHECK_DEFS.length

/**
 * 剑意纯度(0 ~ SWORD_PURITY_MAX_LAYERS 层):道途越纯,剑意越盛
 * ①主流派成形以上 ②不涉副体系 ③法宝不过一件 ④不修回血之术
 */
export function swordPurity(mods: StatMods, artifactCount: number, build: BuildDetection | null): SwordPurity {
  const checks = PURITY_CHECK_DEFS.map(d => ({ name: d.name, ok: d.ok(mods, artifactCount, build) }))
  return { layers: checks.filter(c => c.ok).length, checks }
}

/** 将词条按层数叠加(不改原对象) */
export function stackedMods(base: StatMods, layer: StatMods, n: number): StatMods {
  if (n <= 0) return base
  const out: StatMods = { ...base }
  for (const k in layer) {
    const key = k as keyof StatMods
    out[key] = (out[key] ?? 0) + (layer[key] ?? 0) * n
  }
  return out
}

/** 杀伐道速战之赏:远征总回合越短,道源加成越高(至多 +25%) */
export function slaughterSpeedBonus(totalRounds: number, fights: number): number {
  const perFight = totalRounds / Math.max(1, fights)
  if (perFight < 12) return 0.25
  if (perFight < 18) return 0.15
  if (perFight < 24) return 0.08
  return 0
}
