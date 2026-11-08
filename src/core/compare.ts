/**
 * 构筑对照:双 Build 研究与道痕今昔之比的共享底座。
 * 不宣布谁胜:分环境给档位,附过程指标(回合/承伤/反击)。
 */
import type { CelestialWorldDef, CombatantSnap, DaoMark } from '@/types'
import { add, gnZero, ratio } from '@/utils/gnum'
import { mulberry32, RandomService } from '@/utils/random'
import { CELESTIAL_WORLDS, celestialWorldDef } from '@/data/endgame'
import { resolveCombat } from './combat'
import { mergeRules, worldFoeSnap, type GauntletOpts } from './gauntlet'
import { currentDaoRules, snapFromReplay } from './endgameService'
import { rateText } from '@/ui/rateRank'

export { rateText }

export interface MeasureResult {
  clearRate: number
  avgRounds: number
  /** 场均承伤(占最大生命比) */
  avgTakenPct: number
  avgCounters: number
  avgCrits: number
}

/** 测量某快照在某世界的线性连战表现(敌人与该快照等比) */
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
      // 只读 .rounds / .stats / .win —— stats 与 buildLog 无关,战报本身不读
      const result = resolveCombat(snap, foe, rng, { ...(rules ?? {}), playerStartHpPct: Math.min(startCap, carried) }, false)
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

/**
 * 胜率档位的说法与档位换算收在 ui/rateRank —— 本文件、core/lab、core/expedition
 * 三处说的是同一件事,阈值不许各写一份。本文件保留同名导出,调用点无需改。
 */

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

/** 双构筑四天对照:分环境档位 + 过程差异 */
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
 * 道痕今昔之比:同一目标、皆有忆战快照的最早与最新道痕,用各自当年的构筑重打当年之界;返回至多 limit 组。
 * 只跨世配对:同世两道痕(一世内打两次天道变数、重写道痕的 `重写·` 前缀痕)不配对。
 * 守卫只看 `life`:`at` 相同是它的子集。
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
