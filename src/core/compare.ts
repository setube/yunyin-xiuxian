/**
 * 构筑对照(Phase 27)—— 双 Build 研究与道痕今昔之比的共享底座
 * 不宣布谁胜:分环境给档位,附可解释的过程指标(回合/承伤/反击)
 */
import type { CelestialWorldDef, CombatantSnap, DaoMark } from '@/types'
import { add, gnZero, ratio } from '@/utils/gnum'
import { mulberry32, RandomService } from '@/utils/random'
import { CELESTIAL_WORLDS, celestialWorldDef } from '@/data/endgame'
import { resolveCombat } from './combat'
import { mergeRules, worldFoeSnap, type GauntletOpts } from './gauntlet'
import { currentDaoRules, snapFromReplay } from './endgameService'

export interface MeasureResult {
  clearRate: number
  avgRounds: number
  /** 场均承伤(占最大生命比) */
  avgTakenPct: number
  /** 场均反击次数 */
  avgCounters: number
  /** 场均会心次数 */
  avgCrits: number
}

/**
 * 测量:某快照在某世界的线性连战表现(敌人与该快照等比)。
 * 收集引擎遥测,过程指标可解释「为什么」
 */
export function measureOnWorld(
  snap: CombatantSnap,
  world: CelestialWorldDef,
  runs = 8,
  seed = 4321,
  opts: GauntletOpts = {}
): MeasureResult {
  const ref = { attack: snap.attack, defense: snap.defense, maxHp: snap.maxHp }
  const foes: CombatantSnap[] = []
  for (let i = 0; i < world.fights - 1; i += 1) foes.push(worldFoeSnap(world.foes[i % world.foes.length]!, ref))
  foes.push(worldFoeSnap(world.guardian, ref))
  const rules = mergeRules(currentDaoRules(), world.rules)
  const rng = new RandomService(mulberry32(seed))
  let clears = 0
  let totalRounds = 0
  let fights = 0
  let taken = gnZero()
  let counters = 0
  let crits = 0
  for (let i = 0; i < runs; i += 1) {
    let carried = rules?.playerStartHpPct ?? 1
    const startCap = carried
    let cleared = true
    for (const foe of foes) {
      const result = resolveCombat(snap, foe, rng, { ...(rules ?? {}), playerStartHpPct: Math.min(startCap, carried) })
      totalRounds += result.rounds
      fights += 1
      if (result.stats) {
        taken = add(taken, result.stats.player.taken)
        counters += result.stats.player.counters
        crits += result.stats.player.crits
      }
      if (!result.win) {
        cleared = false
        break
      }
      if (opts.minHpAfterFight !== undefined && result.playerHpPct < opts.minHpAfterFight) {
        cleared = false
        break
      }
      carried = Math.min(startCap, result.playerHpPct + world.healBetweenPct)
    }
    if (cleared) clears += 1
  }
  return {
    clearRate: clears / runs,
    avgRounds: fights > 0 ? totalRounds / fights : 0,
    avgTakenPct: fights > 0 ? ratio(taken, snap.maxHp) / fights : 0,
    avgCounters: fights > 0 ? counters / fights : 0,
    avgCrits: fights > 0 ? crits / fights : 0
  }
}

const RANK_TEXT = ['九死一生', '凶险', '胜负各半', '略占上风', '稳操胜券'] as const

export function rateText(rate: number): string {
  return RANK_TEXT[rate >= 0.85 ? 4 : rate >= 0.6 ? 3 : rate >= 0.4 ? 2 : rate >= 0.15 ? 1 : 0]!
}

export interface CompareRow {
  worldName: string
  aText: string
  bText: string
  /** b 相对 a:up=更好 */
  trend: 'up' | 'down' | 'flat'
}

export interface CompareReport {
  rows: CompareRow[]
  /** 过程差异(b 相对 a),已过滤微小项 */
  diffLines: string[]
}

/** 双构筑四天对照:分环境档位 + 可解释的过程差异 */
export function compareSnaps(a: CombatantSnap, b: CombatantSnap, runs = 8): CompareReport {
  const rows: CompareRow[] = []
  let sumA: MeasureResult | null = null
  let sumB: MeasureResult | null = null
  const acc = (t: MeasureResult | null, m: MeasureResult): MeasureResult =>
    t
      ? {
          clearRate: t.clearRate + m.clearRate,
          avgRounds: t.avgRounds + m.avgRounds,
          avgTakenPct: t.avgTakenPct + m.avgTakenPct,
          avgCounters: t.avgCounters + m.avgCounters,
          avgCrits: t.avgCrits + m.avgCrits
        }
      : m
  for (const [i, world] of CELESTIAL_WORLDS.entries()) {
    const ma = measureOnWorld(a, world, runs, 77100 + i * 131)
    const mb = measureOnWorld(b, world, runs, 77100 + i * 131)
    sumA = acc(sumA, ma)
    sumB = acc(sumB, mb)
    const ra = Math.round(ma.clearRate * runs)
    const rb = Math.round(mb.clearRate * runs)
    rows.push({
      worldName: world.name,
      aText: rateText(ma.clearRate),
      bText: rateText(mb.clearRate),
      trend: rb > ra ? 'up' : rb < ra ? 'down' : 'flat'
    })
  }
  const n = CELESTIAL_WORLDS.length
  const diffLines: string[] = []
  if (sumA && sumB) {
    const dRounds = (sumB.avgRounds - sumA.avgRounds) / n
    const dTaken = (sumB.avgTakenPct - sumA.avgTakenPct) / n
    const dCounters = (sumB.avgCounters - sumA.avgCounters) / n
    const dCrits = (sumB.avgCrits - sumA.avgCrits) / n
    if (Math.abs(dRounds) >= 1) diffLines.push(`场均回合 ${dRounds > 0 ? '+' : ''}${dRounds.toFixed(1)}`)
    if (Math.abs(dTaken) >= 0.05) diffLines.push(`场均承伤 ${dTaken > 0 ? '+' : ''}${Math.round(dTaken * 100)}%`)
    if (Math.abs(dCounters) >= 0.5) diffLines.push(`场均反击 ${dCounters > 0 ? '+' : ''}${dCounters.toFixed(1)} 次`)
    if (Math.abs(dCrits) >= 0.5) diffLines.push(`场均会心 ${dCrits > 0 ? '+' : ''}${dCrits.toFixed(1)} 次`)
  }
  return { rows, diffLines }
}

// ---------- 道痕今昔之比(Phase 27):我比以前更会玩了吗 ----------

export interface LegacyComparison {
  targetName: string
  earlyLife: number
  lateLife: number
  earlyBuild: string
  lateBuild: string
  earlyText: string
  lateText: string
  /** 过程改善(晚者相对早者) */
  diffLines: string[]
}

/**
 * 自动配对:同一目标、皆有忆战快照的最早与最新道痕,用各自当年的构筑重打当年之界。
 * 返回至多 limit 组——不是排行榜,是与过去的自己对话
 *
 * **只跨世配对**:早者与晚者必须分属两世。这一栏叫「今昔之比」、注释写的是
 * 「与过去的自己对话」,而同一世里的两道痕是**同一个自己**在同一个世里留下的
 * 两笔(一世内打两次天道变数、或重写道痕补的那条 `重写·` 前缀痕)—— 把它们说成
 * 「过去的自己」当场名不副实,界面上于是印出「第 3 世(剑)X → 第 3 世(刀)Y」
 * 这种自己比自己。守卫只看 `life`:`at` 相同是它的一条子集(同世同刻写进两条痕),
 * 无需再并列一个字段。
 */
export function legacyComparisons(marks: DaoMark[], limit = 2): LegacyComparison[] {
  const byTarget = new Map<string, DaoMark[]>()
  for (const m of marks) {
    if (!m.replay || !celestialWorldDef(m.targetId)) continue
    const list = byTarget.get(m.targetId)
    if (list) list.push(m)
    else byTarget.set(m.targetId, [m])
  }
  const out: LegacyComparison[] = []
  for (const [targetId, list] of byTarget) {
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => a.at - b.at)
    const early = sorted[0]!
    const late = sorted[sorted.length - 1]!
    // 同世不配对:这一栏比的是「这一世的我与上一世的我」,不是一世之内的两次出手
    if (early.life === late.life) continue
    const world = celestialWorldDef(targetId)!
    const snapEarly = snapFromReplay('往世之你', early.replay!)
    const snapLate = snapFromReplay('今世之你', late.replay!)
    const me = measureOnWorld(snapEarly, world, 8, 88200 + targetId.length)
    const ml = measureOnWorld(snapLate, world, 8, 88200 + targetId.length)
    const diffLines: string[] = []
    const dRounds = ml.avgRounds - me.avgRounds
    const dTaken = ml.avgTakenPct - me.avgTakenPct
    const dCounters = ml.avgCounters - me.avgCounters
    if (Math.abs(dRounds) >= 1) diffLines.push(`场均回合 ${dRounds > 0 ? '+' : ''}${dRounds.toFixed(1)}`)
    if (Math.abs(dTaken) >= 0.05) diffLines.push(`场均承伤 ${dTaken > 0 ? '+' : ''}${Math.round(dTaken * 100)}%`)
    if (Math.abs(dCounters) >= 0.5) diffLines.push(`场均反击 ${dCounters > 0 ? '+' : ''}${dCounters.toFixed(1)} 次`)
    out.push({
      targetName: early.targetName,
      earlyLife: early.life,
      lateLife: late.life,
      earlyBuild: early.buildName,
      lateBuild: late.buildName,
      earlyText: rateText(me.clearRate),
      lateText: rateText(ml.clearRate),
      diffLines
    })
    if (out.length >= limit) break
  }
  return out
}
