/**
 * 连战解算(纯函数)—— 特殊世界与天道试炼共用,亦被终局模拟器直接验证
 */
import type { CombatantSnap, CombatLogEntry, CombatRules, FoeOrigin, FoeOriginPart, GNum, StatMods, WorldFoeShape } from '@/types'
import type { RandomService } from '@/utils/random'
import { mulN } from '@/utils/gnum'
import { modDepth } from './statsCalc'
import { resolveCombat } from './combat'
import { COMBAT_ATK_BASE, COMBAT_DEF_BASE, COMBAT_HP_BASE } from '@/data/constants'
import { powerScale, tierMajor } from './formulas'

export interface ReferenceStats {
  attack: GNum
  defense: GNum
  maxHp: GNum
}

/**
 * 天界锚点 —— 这一界「该有」的三维。
 *
 * 与凡界敌人同一条纪律:**敌人按层级曲线定标,不按玩家此刻的三维定标**
 * (凡界走 `enemyPowerAt(tier)`,这里走 powerScale(锚点层级) × 三围基数)。
 * 于是攻防血这些**基础属性到哪儿都作数**:境界更高、装备更好、构筑更厚,
 * 就是实打实的优势 —— 而不是被「敌人跟着你一起长」悄悄抹掉。
 *
 * 从前那一版是把参照取成玩家自己的 celestialStats(数值成长互相抵消),
 * 好处是「堆厚度不占便宜」,代价是玩家的基础三维在天界毫无意义:
 * 一身神品与一身凡品打同一个守关者,结果一模一样。差别的表达权被收走了。
 * 现在把这份表达权还给玩家,改由**敌人一侧的判定**去管堆叠(见 celestialJudgement)。
 */
export function celestialAnchor(anchorTier: number): ReferenceStats {
  const scale = powerScale(anchorTier)
  return {
    attack: mulN(scale, COMBAT_ATK_BASE),
    defense: mulN(scale, COMBAT_DEF_BASE),
    maxHp: mulN(scale, COMBAT_HP_BASE)
  }
}

/**
 * 天界判定层 —— 基础三维之外,敌人依据**你是什么样的人**额外做的事。
 *
 * 三样,都建立在攻防血之上,而不是取代它们:
 *   一 **道之理解**:你的构筑越厚(超过基准深度),守关者越有备 —— 三维按比例加厚;
 *   二 **增伤**:看破你的路数,打得更重;
 *   三 **减伤**:挡得住你的路数,吃得下你的招式。
 * 加厚与增伤减伤都设上限:判定是「让它更难缠」,不是「把你打回原点」。
 */
export interface CelestialJudgement {
  /** 三维加厚(≥1) */
  thicken: number
  /** 守关者增伤 */
  damageBonus: number
  /** 守关者减伤 */
  damageReduction: number
  /** 境界压制是否生效(未及本界锚点境界)—— 报账时要能与「道之理解」分开说 */
  suppressed: boolean
}

export const NO_JUDGEMENT: CelestialJudgement = { thicken: 1, damageBonus: 0, damageReduction: 0, suppressed: false }

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
/**
 * 道之理解的基准深度。
 *
 * 六大标准流派(buildSim)的构筑深度为 1.02~2.43 —— 这一段里的堆叠属于**正常构筑**,
 * 不触发任何判定;越过基准才叫「堆得太厚」,守关者才据此加厚与增减伤。
 * (数值与 33.2 那一轮相同,只是它的角色从「抵消玩家三维」变成「敌人加厚」。)
 */
export const CELESTIAL_BASE_DEPTH = 2.6
/** 每超出基准一倍,守关者增伤/减伤各加这么多 */
export const CELESTIAL_JUDGE_RATE = 0.15
/** 增伤与减伤各自的封顶 —— 判定是让它难缠,不是把你打回原点 */
export const CELESTIAL_JUDGE_CAP = 0.35
/** 境界压制:未及这一界锚点境界者,守关者额外增伤 */
export const CELESTIAL_SUPPRESS_BONUS = 0.25

/** 构筑深度对应的加厚系数(不低于 1,浅构筑不会反被削)—— 判定的第一样 */
export function celestialDepthScale(playerMods: StatMods): number {
  const depth = modDepth(playerMods)
  return depth <= CELESTIAL_BASE_DEPTH ? 1 : depth / CELESTIAL_BASE_DEPTH
}

/**
 * 这一界的判定:玩家的构筑厚度与境界,决定守关者额外做什么。
 *
 * @param playerMajor 玩家此刻的大境界(用于境界压制)
 * @param anchorTier  本界锚点层级(它的境界即本界「该有的境界」)
 */
export function celestialJudgement(playerMods: StatMods, playerMajor: number, anchorTier: number): CelestialJudgement {
  const thicken = celestialDepthScale(playerMods)
  const over = thicken - 1
  const judge = Math.min(CELESTIAL_JUDGE_CAP, over * CELESTIAL_JUDGE_RATE)
  // 境界压制:还没走到这一界该有的境界,守关者额外增伤(规则文案里会写明)
  const suppressed = playerMajor < tierMajor(anchorTier)
  const suppress = suppressed ? CELESTIAL_SUPPRESS_BONUS : 0
  return { thicken, damageBonus: judge + suppress, damageReduction: judge, suppressed }
}

/** 判定的去向语 —— 战前预估与战后归因读的是同一句(两处各写一句,迟早分叉) */
export const JUDGEMENT_DIRECTION = '判定随你的厚度与境界而来 —— 换个方向而非继续堆,或再破一境,它自会退回去。'

/**
 * 天界敌人的加成来源 —— 供战后分析归因(与凡界的 mortalFoeOrigin 同一形状、同一用途)。
 * 无判定时也如实写明「这一界没有额外判定」,免得玩家把「打不过」全算在判定头上。
 *
 * parts 只装**三维倍率**(加厚);增伤减伤各走自己的字段 ——
 * 两者混进同一个列表,读的人就分不清「×1.4」是加厚还是增伤。
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
    note: names.length === 0 ? '这一界对你没有额外判定 —— 胜败只由三维与构筑形状决定。' : JUDGEMENT_DIRECTION
  }
}

/**
 * 把判定讲成人话 —— 战前要看得见,战后要说得清。
 *
 * 「敌人为什么比看起来更强」若是只能靠猜,玩家调不动它:他既不知道该削哪个属性,
 * 也不知道该往哪一境走。故判定只在此处成文,战前预估与战后战报读同一份文案。
 * 中性的判定(浅构筑且境界已到)返回空数组 —— 没有判定就不该占字数。
 */
export function celestialJudgementLines(
  playerMods: StatMods,
  playerMajor: number,
  anchorTier: number
): string[] {
  const j = celestialJudgement(playerMods, playerMajor, anchorTier)
  const lines: string[] = []
  if (j.thicken > 1) {
    lines.push(
      `道之理解:你的构筑厚度 ${(modDepth(playerMods)).toFixed(1)}(基准 ${CELESTIAL_BASE_DEPTH})—— 守关者三维 ×${j.thicken.toFixed(2)}`
    )
  }
  const judgeOnly = Math.min(CELESTIAL_JUDGE_CAP, (j.thicken - 1) * CELESTIAL_JUDGE_RATE)
  if (judgeOnly > 0) {
    lines.push(`道之理解:路数被看破 —— 守关者增伤 +${Math.round(judgeOnly * 100)}%、减伤 +${Math.round(judgeOnly * 100)}%`)
  }
  if (playerMajor < tierMajor(anchorTier)) {
    lines.push(`境界压制:未及此界该有的境界 —— 守关者额外增伤 +${Math.round(CELESTIAL_SUPPRESS_BONUS * 100)}%`)
  }
  // 报了病因,也要给方向:两条判定各有自己的解法(一个改形状,一个抬境界)
  if (lines.length > 0) lines.push(JUDGEMENT_DIRECTION)
  return lines
}

/**
 * 天界敌人的**唯一参照口径** —— 远征 / 挑战 / 试炼 / 重写一律走它。
 *
 * 两件事一起给:敌人按**本界锚点**定标(与玩家此刻有多强无关),
 * 判定按**玩家是什么样的人**算(厚度 → 加厚与增减伤;境界 → 压制)。
 * 收成一处,是为了不让某一条造敌路径漏掉判定 —— 这正是 celestialCaliber.spec 盯的。
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
 * 按参照属性生成天界敌人。
 *
 * `judgement` 是敌人一侧的判定(道之理解 + 境界压制):三维按它加厚,
 * 增伤减伤并入敌人词条 —— 玩家在战后分析里看得到「被看破/被挡住」那两项,
 * 而不是莫名其妙地打不动。
 */
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
  // 加成来源随快照带走:expedition 把战果交给战后分析时,不必回头重建这一份判定
  const origin = celestialFoeOrigin(judgement)
  return {
    name: shape.name,
    icon: shape.icon,
    isPlayer: false,
    // 连战的逐场加码(escalation)也如实写进来源,不然「第三场怎么突然更凶」又成了谜
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
  /** 只读 .cleared/.rounds 时置 false,要求 resolveCombat 跳过战报构建 */
  buildLog?: boolean
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
    const result = resolveCombat(snap, foe, rng, fightRules, opts.buildLog ?? true)
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
