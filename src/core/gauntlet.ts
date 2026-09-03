/**
 * 连战解算(纯函数)—— 特殊世界与天道试炼共用,亦被终局模拟器直接验证
 */
import type { CombatantSnap, CombatRules, GNum, StatMods, WorldFoeShape } from '@/types'
import type { RandomService } from '@/utils/random'
import { mulN } from '@/utils/gnum'
import { modDepth } from './statsCalc'
import { resolveCombat } from './combat'

export interface ReferenceStats {
  attack: GNum
  defense: GNum
  maxHp: GNum
}

/**
 * 天界词条对称基准(Phase 33.2)。
 *
 * 取值依据:六大标准流派(buildSim)的构筑深度为 1.02~2.43,天界平衡门本就是
 * 照着它们校准的,这个区间内不能被判为膨胀——否则标准构筑反被加厚,
 * 世界生成的「可行流派≥3」门会被误伤。基准设在流派上沿之上,
 * 只吸收人间进程带来的超额堆叠(实测真仙常规档深度 4.76)。
 *
 * 原本 worldFoeSnap 只对基础三维做等比抵消,词条乘区被玩家整份带进天界,
 * 实测不对称达 29~57 倍(见 inflationAudit),于是「一脚踹死」。
 * 补上词条这一半后,「数值成长在天界互相抵消」才真正成立:
 * 堆得再厚也换不来碾压,胜负重新回到构筑形状本身
 */
export const CELESTIAL_BASE_DEPTH = 2.6
/** 加厚指数 <1:守关者跟随但不完全追平,留给玩家构筑优化的收益空间 */
export const CELESTIAL_DEPTH_EXP = 0.85

/** 玩家构筑深度对应的守关者加厚系数(不低于 1,浅构筑不会反被削) */
export function celestialDepthScale(playerMods: StatMods): number {
  const depth = modDepth(playerMods)
  if (depth <= CELESTIAL_BASE_DEPTH) return 1
  return Math.pow(depth / CELESTIAL_BASE_DEPTH, CELESTIAL_DEPTH_EXP)
}

/**
 * 按参照属性生成天界敌人 —— 数值成长在天界互相抵消,只有构筑形状决定胜负。
 * depthScale 让词条与三维一样参与抵消(见 celestialDepthScale)
 */
export function worldFoeSnap(shape: WorldFoeShape, ref: ReferenceStats, escalation = 1, depthScale = 1): CombatantSnap {
  const mods: StatMods = {}
  if (shape.mods) {
    for (const k in shape.mods) {
      const key = k as keyof StatMods
      const v = shape.mods[key]
      mods[key] = typeof v === 'number' ? v * depthScale : v
    }
  }
  return {
    name: shape.name,
    icon: shape.icon,
    isPlayer: false,
    attack: mulN(ref.attack, shape.atkR * escalation),
    defense: mulN(ref.defense, shape.defR * escalation),
    maxHp: mulN(ref.maxHp, shape.hpR * escalation),
    speed: shape.speed,
    mods,
    skills: shape.skills.map(s => ({ ...s }))
  }
}

/** 合并道途规则与世界/试炼规则 */
export function mergeRules(a?: CombatRules, b?: CombatRules): CombatRules | undefined {
  if (!a) return b
  if (!b) return a
  const mods = (x?: StatMods, y?: StatMods): StatMods | undefined => {
    if (!x) return y
    if (!y) return x
    const out: StatMods = { ...x }
    for (const k in y) {
      const key = k as keyof StatMods
      out[key] = (out[key] ?? 0) + (y[key] ?? 0)
    }
    return out
  }
  return {
    maxRounds:
      a.maxRounds !== undefined || b.maxRounds !== undefined ? Math.min(a.maxRounds ?? Infinity, b.maxRounds ?? Infinity) : undefined,
    playerAtkMult: (a.playerAtkMult ?? 1) * (b.playerAtkMult ?? 1),
    enemyAtkMult: (a.enemyAtkMult ?? 1) * (b.enemyAtkMult ?? 1),
    enemyHpMult: (a.enemyHpMult ?? 1) * (b.enemyHpMult ?? 1),
    healMult: (a.healMult ?? 1) * (b.healMult ?? 1),
    shieldCapRatio:
      a.shieldCapRatio !== undefined || b.shieldCapRatio !== undefined ? Math.min(a.shieldCapRatio ?? 1, b.shieldCapRatio ?? 1) : undefined,
    playerExtraMods: mods(a.playerExtraMods, b.playerExtraMods),
    enemyExtraMods: mods(a.enemyExtraMods, b.enemyExtraMods),
    playerStartHpPct: Math.min(a.playerStartHpPct ?? 1, b.playerStartHpPct ?? 1),
    perRounds: a.perRounds ?? b.perRounds
  }
}

export interface GauntletFightRow {
  foeName: string
  win: boolean
  rounds: number
  hpLeftPct: number
}

export interface GauntletReport {
  cleared: boolean
  fightsWon: number
  totalRounds: number
  rows: GauntletFightRow[]
  /** 因契约违背而终止(如无伤契) */
  pactBroken?: boolean
}

export interface GauntletOpts {
  /** 无伤契:每场战后气血低于此值即判违契终止 */
  minHpAfterFight?: number
  /** 剑意/杀意:每胜一场,玩家词条叠加一层 */
  perWinPlayerMods?: StatMods
}

/** 词条叠加 n 层 */
function stackMods(base: StatMods, extra: StatMods, n: number): StatMods {
  if (n <= 0) return base
  const out: StatMods = { ...base }
  for (const k in extra) {
    const key = k as keyof StatMods
    out[key] = (out[key] ?? 0) + (extra[key] ?? 0) * n
  }
  return out
}

/**
 * 连战:携带血量进入下一场,场间按比例恢复
 * @param startHpCap 每场开局血量上限(试炼规则,如一线试炼 0.35)
 */
export function runGauntlet(
  player: CombatantSnap,
  foes: CombatantSnap[],
  rules: CombatRules | undefined,
  healBetweenPct: number,
  rng: RandomService,
  opts: GauntletOpts = {}
): GauntletReport {
  const rows: GauntletFightRow[] = []
  const startCap = rules?.playerStartHpPct ?? 1
  let carried = startCap
  let totalRounds = 0
  let fightsWon = 0
  for (const foe of foes) {
    const snap: CombatantSnap = opts.perWinPlayerMods
      ? { ...player, mods: stackMods(player.mods, opts.perWinPlayerMods, fightsWon) }
      : player
    const fightRules: CombatRules = { ...(rules ?? {}), playerStartHpPct: Math.min(startCap, carried) }
    const result = resolveCombat(snap, foe, rng, fightRules)
    totalRounds += result.rounds
    rows.push({ foeName: foe.name, win: result.win, rounds: result.rounds, hpLeftPct: result.playerHpPct })
    if (!result.win) {
      return { cleared: false, fightsWon, totalRounds, rows }
    }
    if (opts.minHpAfterFight !== undefined && result.playerHpPct < opts.minHpAfterFight) {
      return { cleared: false, fightsWon, totalRounds, rows, pactBroken: true }
    }
    fightsWon += 1
    carried = Math.min(startCap, result.playerHpPct + healBetweenPct)
  }
  return { cleared: true, fightsWon, totalRounds, rows }
}
