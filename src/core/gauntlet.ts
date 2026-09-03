/**
 * 连战解算(纯函数)—— 特殊世界与天道试炼共用,亦被终局模拟器直接验证
 */
import type { CombatantSnap, CombatLogEntry, CombatRules, GNum, StatMods, WorldFoeShape } from '@/types'
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
 * 天界器魂容量(Phase 33.3)。
 *
 * 凡器入天界,数值尽去,只余器魂——装备贡献的词条被归一化到这个总深度,
 * 但各词条的**相对比例完全保留**。也就是说:你在人间选的构筑方向原样带进天界,
 * 变的只是「堆了多少件、堆了多高品质」不再算数。
 *
 * 这样刷装备的价值从「累加总量」变成「调整方向」:九件神品与三件精品若方向相同,
 * 在天界是同一个构筑;想变强只能改方向,不能靠更厚的数值。
 *
 * 容量取 1.3:必须**低于**满配器魂的合计深度(三枚化真约 1.52),
 * 否则不凝器魂反而更强,系统等于没人用。
 * 语义上也说得通——不凝就是被动挨天道压制,压得更狠;
 * 凝了是主动掌控形意,略占便宜。这份便宜是「主动经营」的报酬,不是数值红利
 */
export const SOUL_CAPACITY = 1.3

/** 基础三维百分比与修速:前者已由 worldFoeSnap 等比抵消,后者不参与战斗,均不入器魂 */
const BASE_PCT_KEYS = new Set<keyof StatMods>(['attackPct', 'defensePct', 'maxHpPct', 'cultivationSpeed'])

/**
 * 器魂凝炼:把装备来源的词条等比压缩到 SOUL_CAPACITY。
 * 未超出容量的原样保留(轻装玩家不受影响),超出则整体等比缩放——
 * 等比是关键,它保证「形状不变、总量归一」
 */
export function forgeSoul(equipMods: StatMods): StatMods {
  const depth = modDepth(equipMods)
  if (depth <= SOUL_CAPACITY) return equipMods
  const scale = SOUL_CAPACITY / depth
  const out: StatMods = {}
  for (const k in equipMods) {
    const key = k as keyof StatMods
    const v = equipMods[key]
    // 只压缩正向构筑词条;负向词条(构筑代价)若一并压缩,反而是变相加强
    out[key] = typeof v === 'number' && v > 0 && !BASE_PCT_KEYS.has(key) ? v * scale : v
  }
  return out
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
/**
 * 加厚指数。
 *
 * 必须是 1.0(严格等比)。曾误设 0.85,理由是「留给玩家构筑优化的收益空间」——
 * 这个理由站不住:构筑优化的收益应当来自**形状**,不是来自**厚度**。
 * 指数 <1 时净优势 = D^(1-exp) × BASE^exp,随玩家深度 D 单调增长,
 * 等于给「堆厚度」开了后门:功法、灵脉、天赋、称号这些不受器魂约束的来源
 * (实测占真仙玩家词条深度的六成)只要堆够,就能不靠器魂直接碾过天界。
 *
 * 取 1.0 后净优势恒为 CELESTIAL_BASE_DEPTH,与玩家堆了多少完全无关——
 * 这才是「数值成长在天界互相抵消」的严格实现。
 * 注意六大标准流派深度 1.02~2.43 全在基准以下,scale 恒为 1,平衡门不受影响;
 * 加厚只对越过基准的堆叠生效,不惩罚正常构筑
 */
export const CELESTIAL_DEPTH_EXP = 1.0

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
  /**
   * 该场的逐回合战报。
   * 仅供即时播放,**不可写入道痕等持久化结构**——道痕存的是构筑快照(replay),
   * 每场几十条日志乘上 60 条道痕会把存档撑爆
   */
  logs?: CombatLogEntry[]
  /** 该场敌人快照(播放时显示血条与名号) */
  foe?: CombatantSnap
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
    rows.push({ foeName: foe.name, win: result.win, rounds: result.rounds, hpLeftPct: result.playerHpPct, logs: result.log, foe })
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
