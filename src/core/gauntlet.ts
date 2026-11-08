/** 连战解算(纯函数):特殊世界与天道试炼共用,终局模拟器直接验证 */
import type {
  CelestialWorldDef,
  CombatantSnap,
  CombatLogEntry,
  CombatRules,
  FoeOrigin,
  FoeOriginPart,
  GNum,
  StatMods,
  WorldFoeShape
} from '@/types'
import { mulberry32, RandomService } from '@/utils/random'
import { gn, mulN } from '@/utils/gnum'
import { modDepth } from './statsCalc'
import { resolveCombat } from './combat'
import { COMBAT_ATK_BASE, COMBAT_DEF_BASE, COMBAT_HP_BASE } from '@/data/constants'
import { powerScale, tierMajor } from './formulas'
import { MAX_MAJOR } from '@/data/realms'

export interface ReferenceStats {
  attack: GNum
  defense: GNum
  maxHp: GNum
}

/**
 * 模拟参照属性,须与 buildSim 基准一致。
 *
 * 放在这里而不是 celestialSim:后者是平衡模拟器,会连带 buildSearch/buildSim 一大串。
 * 而 challenge / expedition / lab 这些**生产路径**只需要这三个数 —— 从模拟器里取,
 * 等于把整个模拟器塞进首屏(实测多出 buildSearch 与 worldSim 两个 chunk 的请求)。
 */
export const SIM_REFERENCE: ReferenceStats = {
  attack: gn(100),
  defense: gn(55),
  maxHp: gn(1400)
}

/**
 * 终局世界的模拟敌群形状:参照取 SIM_REFERENCE(比的是构筑形状,不走天界锚点),
 * 判定照实战口径算,否则厚构筑胜率被高估。传 MAX_MAJOR:模拟里没有境界,境界压制恒不触发。
 *
 * 放在 gauntlet 而不是 celestialSim:worldGen / metaSim 都要用它,
 * 而 celestialSim 还牵着 buildSim 与 buildSearch —— 从那里取会把整条模拟链带进首屏。
 */
export function worldFoes(world: CelestialWorldDef, snap: CombatantSnap): CombatantSnap[] {
  const judgement = celestialJudgement(snap.mods, MAX_MAJOR, world.anchorTier)
  return worldFoeLineup(world, SIM_REFERENCE, judgement)
}

/** 该世界在给定参照下的通关率(跑 runs 次取频率) */
export function worldClearRate(world: CelestialWorldDef, snap: CombatantSnap, runs: number, seed: number): number {
  const rng = new RandomService(mulberry32(seed))
  const foes = worldFoes(world, snap)
  let clears = 0
  for (let i = 0; i < runs; i += 1) {
    if (runGauntlet(snap, foes, world.rules, world.healBetweenPct, rng, { buildLog: false }).cleared) clears += 1
  }
  return clears / runs
}

/**
 * 天界锚点三维:powerScale(锚点层级) × 三围基数。
 * 敌人按层级曲线定标,不按玩家此刻三维定标(同凡界 `enemyPowerAt(tier)`);堆叠由敌人侧判定处理(见 celestialJudgement)。
 */
export function celestialAnchor(anchorTier: number): ReferenceStats {
  const scale = powerScale(anchorTier)
  return {
    attack: mulN(scale, COMBAT_ATK_BASE),
    defense: mulN(scale, COMBAT_DEF_BASE),
    maxHp: mulN(scale, COMBAT_HP_BASE)
  }
}

/** 天界判定:基础三维之外,守关者按玩家构筑额外加厚、增伤、减伤;均设上限 */
export interface CelestialJudgement {
  /** 三维加厚(≥1) */
  thicken: number
  /** 守关者增伤 */
  damageBonus: number
  /** 守关者减伤 */
  damageReduction: number
  /** 境界压制是否生效(未及本界锚点境界);报账时与「道之理解」分开 */
  suppressed: boolean
}

export const NO_JUDGEMENT: CelestialJudgement = { thicken: 1, damageBonus: 0, damageReduction: 0, suppressed: false }

/**
 * 道之理解的基准深度。六大标准流派(buildSim)深度 1.02~2.43,须落在基准之下、不触发判定,
 * 否则世界生成「可行流派≥3」门被误伤;只阻尼超额堆叠(实测真仙常规档 4.76)。
 */
export const CELESTIAL_BASE_DEPTH = 2.6
/** 每超出基准一倍,守关者增伤/减伤各加此值 */
export const CELESTIAL_JUDGE_RATE = 0.15
/** 增伤与减伤各自的封顶 */
export const CELESTIAL_JUDGE_CAP = 0.35
/** 境界压制:未及本界锚点境界时守关者额外增伤 */
export const CELESTIAL_SUPPRESS_BONUS = 0.25

/** 构筑深度对应的三维加厚系数(≥1) */
export function celestialDepthScale(playerMods: StatMods): number {
  const depth = modDepth(playerMods)
  return depth <= CELESTIAL_BASE_DEPTH ? 1 : depth / CELESTIAL_BASE_DEPTH
}

/**
 * 本界判定:玩家构筑厚度与境界决定守关者的加厚、增伤/减伤与境界压制。
 * 不变式「标准构筑不罚(thicken=1、增减伤≈0),超基准堆叠才阻尼」;spec 钉:celestialJudgementInvariant.spec,改判定数值须先过它。
 * @param playerMajor 玩家此刻的大境界(用于境界压制)
 * @param anchorTier  本界锚点层级(它的境界即本界「该有的境界」)
 */
export function celestialJudgement(playerMods: StatMods, playerMajor: number, anchorTier: number): CelestialJudgement {
  const thicken = celestialDepthScale(playerMods)
  const over = thicken - 1
  const judge = Math.min(CELESTIAL_JUDGE_CAP, over * CELESTIAL_JUDGE_RATE)
  const suppressed = playerMajor < tierMajor(anchorTier)
  const suppress = suppressed ? CELESTIAL_SUPPRESS_BONUS : 0
  return { thicken, damageBonus: judge + suppress, damageReduction: judge, suppressed }
}

/**
 * 天界敌人的加成来源,供战后分析归因(与凡界 mortalFoeOrigin 同形状、同用途)。
 * parts 只装三维倍率(加厚),增伤减伤走各自字段,不混入 parts。
 */
export function celestialFoeOrigin(j: CelestialJudgement): FoeOrigin {
  const parts: FoeOriginPart[] = j.thicken > 1 ? [{ label: '道之理解', ratio: j.thicken }] : []
  const names: string[] = []
  if (j.thicken > 1) names.push('道之理解')
  if (j.suppressed) names.push('境界压制')
  return {
    label: names.length === 0 ? '无判定' : names.join(' · '),
    ratio: j.thicken,
    damageBonus: j.damageBonus,
    damageReduction: j.damageReduction,
    parts,
    note: names.length === 0 ? '无额外判定' : ''
  }
}

/** 判定文案单一出处:战前预估与战后战报共用;中性判定(浅构筑且境界已到)返回空数组 */
export function celestialJudgementLines(
  playerMods: StatMods,
  playerMajor: number,
  anchorTier: number
): string[] {
  const j = celestialJudgement(playerMods, playerMajor, anchorTier)
  const lines: string[] = []
  if (j.thicken > 1) {
    lines.push(
      `道之理解:构筑厚度 ${(modDepth(playerMods)).toFixed(1)}(基准 ${CELESTIAL_BASE_DEPTH})· 守关者三维 ×${j.thicken.toFixed(2)}`
    )
  }
  const judgeOnly = Math.min(CELESTIAL_JUDGE_CAP, (j.thicken - 1) * CELESTIAL_JUDGE_RATE)
  if (judgeOnly > 0) {
    lines.push(`道之理解:守关者增伤 +${Math.round(judgeOnly * 100)}% · 减伤 +${Math.round(judgeOnly * 100)}%`)
  }
  if (playerMajor < tierMajor(anchorTier)) {
    lines.push(`境界压制:守关者增伤 +${Math.round(CELESTIAL_SUPPRESS_BONUS * 100)}%`)
  }
  return lines
}

/**
 * 天界敌人唯一参照口径:远征 / 挑战 / 试炼 / 重写一律走它,敌人按本界锚点定标,判定按玩家厚度与境界算。
 * spec 钉:celestialCaliber.spec(造敌路径不得漏判定)。
 */
export function celestialFoeCaliber(
  playerMajor: number,
  playerMods: StatMods,
  anchorTier: number
): { ref: ReferenceStats; judgement: CelestialJudgement } {
  return {
    ref: celestialAnchor(anchorTier),
    judgement: celestialJudgement(playerMods, playerMajor, anchorTier)
  }
}

/**
 * 一个天界世界的完整敌人阵容:前 `fights - 1` 场按 `foes` 循环取,末位固定守关者。
 *
 * 这段循环此前在 challenge / endgameService / lab 各抄了一份(逐字相同)。
 * 抄三份的风险在于改一处漏两处:比如以后给普战加递进,某条路径忘了改,
 * 它的通关率就会与另外两条静默分叉,而三条路径共用同一个 `runGauntlet`。
 */
export function worldFoeLineup(
  world: CelestialWorldDef,
  ref: ReferenceStats,
  judgement: CelestialJudgement = NO_JUDGEMENT
): CombatantSnap[] {
  const foes: CombatantSnap[] = []
  for (let i = 0; i < world.fights - 1; i += 1) {
    foes.push(worldFoeSnap(world.foes[i % world.foes.length]!, ref, 1, judgement))
  }
  foes.push(worldFoeSnap(world.guardian, ref, 1, judgement))
  return foes
}

/** 按参照属性生成天界敌人;`judgement` 的加厚乘到三维,增伤减伤并入敌人词条 */
export function worldFoeSnap(
  shape: WorldFoeShape,
  ref: ReferenceStats,
  escalation = 1,
  judgement: CelestialJudgement = NO_JUDGEMENT
): CombatantSnap {
  const mods: StatMods = { ...(shape.mods ?? {}) }
  if (judgement.damageBonus > 0) mods.damageBonus = (mods.damageBonus ?? 0) + judgement.damageBonus
  if (judgement.damageReduction > 0) mods.damageReduction = (mods.damageReduction ?? 0) + judgement.damageReduction
  const thicken = escalation * judgement.thicken
  // 加成来源随快照带走:expedition 战后分析不重建判定
  const origin = celestialFoeOrigin(judgement)
  return {
    name: shape.name,
    icon: shape.icon,
    isPlayer: false,
    origin: escalation === 1 ? origin : { ...origin, ratio: origin.ratio * escalation, parts: [...origin.parts, { label: '连战加码', ratio: escalation }] },
    attack: mulN(ref.attack, shape.atkR * thicken),
    defense: mulN(ref.defense, shape.defR * thicken),
    maxHp: mulN(ref.maxHp, shape.hpR * thicken),
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
  /** 该场逐回合战报,仅供即时播放;不可写入道痕等持久化结构(每场几十条 × 60 条道痕会撑爆存档) */
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
  /** 只读 .cleared/.rounds 时置 false,要求 resolveCombat 跳过战报构建 */
  buildLog?: boolean
}

function stackMods(base: StatMods, extra: StatMods, n: number): StatMods {
  if (n <= 0) return base
  const out: StatMods = { ...base }
  for (const k in extra) {
    const key = k as keyof StatMods
    out[key] = (out[key] ?? 0) + (extra[key] ?? 0) * n
  }
  return out
}

/** 连战:携带血量进入下一场,场间按比例恢复;每场开局血量上限取试炼规则(如一线试炼 0.35) */
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
    const result = resolveCombat(snap, foe, rng, fightRules, opts.buildLog ?? true)
    totalRounds += result.rounds
    rows.push({ foeName: foe.name, win: result.win, rounds: result.rounds, hpLeftPct: result.playerHpPct, logs: result.log, foe })
    if (!result.win) {
      return { cleared: false, fightsWon, totalRounds, rows }
    }
    fightsWon += 1
    // 违契终止时这一胜也算(已胜该场),否则与 rows 该行 win=true 矛盾
    if (opts.minHpAfterFight !== undefined && result.playerHpPct < opts.minHpAfterFight) {
      return { cleared: false, fightsWon, totalRounds, rows, pactBroken: true }
    }
    carried = Math.min(startCap, result.playerHpPct + healBetweenPct)
  }
  return { cleared: true, fightsWon, totalRounds, rows }
}
