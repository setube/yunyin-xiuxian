/** 道途深化纯逻辑:剑道纯度与逐胜叠层;长生印在 CombatRules.perRounds 中实现 */
import type { StatMods } from '@/types'
import { STYLE_MATURE_AFFINITY, type BuildDetection } from './buildDetect'
import { modOf } from './statsCalc'

/** 剑意每层加成 */
export const SWORD_LAYER_MODS: StatMods = { damageBonus: 0.04, critRate: 0.02 }
/** 剑道远征逐胜叠层 */
export const SWORD_PER_WIN: StatMods = { damageBonus: 0.04, critRate: 0.02 }
/** 杀伐远征逐胜叠层 */
export const SLAUGHTER_PER_WIN: StatMods = { damageBonus: 0.05 }

/**
 * 按当前道途取「逐胜叠层」那一份词条;非剑/杀两道返回 undefined。
 *
 * 同一个三元式原先在四处各写一遍(expedition 的 perWinMods、endgameService 两处、
 * challenge 一处)。两处能各自跑对,但它们必须永远一致 ——
 * 加第三条道途有逐胜叠层时,漏改任一处就是「远征叠了、试炼没叠」这种只有对局才看得出的分叉。
 *
 * 只读传入的 dao id,不碰 store:core 里已有几处传它的是本地快照而非 store。
 *
 * @param dao 当前道途 id;未立道途为 null
 */
export function perWinModsOf(dao: string | null): StatMods | undefined {
  if (dao === 'sword') return SWORD_PER_WIN
  if (dao === 'slaughter') return SLAUGHTER_PER_WIN
  return undefined
}

export interface SwordPurity {
  layers: number
  /** 各项纯度判定(供 UI 解释层数) */
  checks: { name: string; ok: boolean }[]
}

interface PurityCheckDef {
  name: string
  ok: (mods: StatMods, artifactCount: number, build: BuildDetection | null) => boolean
}

const PURITY_CHECK_DEFS: PurityCheckDef[] = [
  // 成形门槛 STYLE_MATURE_AFFINITY 的镜像:判定与文案同读一枚
  {
    name: `主流派契合 ≥${Math.round(STYLE_MATURE_AFFINITY * 100)}%`,
    ok: (_mods, _art, build) => (build?.affinity ?? 0) >= STYLE_MATURE_AFFINITY
  },
  { name: '无副体系', ok: (_mods, _art, build) => build !== null && build.secondary === undefined },
  { name: '法宝不过一件', ok: (_mods, art, _build) => art <= 1 },
  { name: '不修回血之术', ok: (mods, _art, _build) => modOf(mods, 'lifesteal') + modOf(mods, 'regenPerRound') < 0.02 }
]

/** 剑意总层数;UI 的「/N 层」读这里,不另处手抄 */
export const SWORD_PURITY_MAX_LAYERS = PURITY_CHECK_DEFS.length

/** 剑意纯度(0 ~ SWORD_PURITY_MAX_LAYERS 层) */
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
