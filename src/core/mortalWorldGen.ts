/**
 * 凡界世界生成:现有素材重组(生态位、Boss 机制家族、世界规则),不新造内容。
 *
 * 三条硬检查(承袭天界 worldGen):
 *   一、换顺序不算新世界   「纯洗牌」对照组
 *   二、随机不算新世界     NOVELTY_MIN 硬门槛
 *   三、不牺牲可玩性       ≥3 可行构筑、无接近必胜、Boss 有对应生态
 */
import type { CombatRules, CombatantSnap, EnemyDef, StatMods } from '@/types'
import { mulberry32, RandomService } from '@/utils/random'
import { jaccardDistance } from '@/utils/setMath'
import { MORTAL_REGIONS, MORTAL_TIER_MAX } from '@/data/regions'
import { ENEMIES, enemyDef } from '@/data/enemies'
import { EVENTS } from '@/data/events'
import { MUTATORS } from '@/data/mutators'
import { makeEnemySnap, resolveCombat } from './combat'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { powerScale } from './formulas'
import { mulN } from '@/utils/gnum'
import { NOVELTY_MIN } from './worldGen'

// ============ 一、世界结构 ============

/** 重组后的一处地界 */
export interface MortalPlace {
  /** 路线节点 id:本世可达性的唯一凭据,不与旧解锁链冲突 */
  nodeId: string
  /** 素材取自哪个原区域 */
  fromId: string
  name: string
  tier: number
  /** 重组后的敌人生态 */
  enemies: string[]
  /** 重组后的首领 */
  boss: string
  /** 首领机制家族 */
  archetype: string
  eventTags: string[]
}

export interface MortalWorld {
  seed: number
  /** 地界链(组合 + 顺序) */
  chain: MortalPlace[]
  /** 路线骨架 */
  shapeId: string
  shapeName: string
  /** 事件节奏原型 */
  rhythmId: string
  rhythmName: string
  /** 一条贯穿本世的规则 */
  ruleId: string
  ruleName: string
  rules: CombatRules
  /** 资源偏向 */
  bias: string
  /** 首领去重回退(复用已占用首领)的段序;须记录,否则回退悄悄退化成重复 */
  bossFallbackAt: number[]
}

const FOES_PER_PLACE = 3
const BIASES = ['草木丰饶', '矿脉深厚', '典籍散佚', '灵石充盈', '药气氤氲'] as const

/**
 * 路线骨架模板:有限模板 + 参数扰动 + 历史去重。
 * 固定递进会让每世推进节奏雷同;纯随机层级玩家无法形成空间认知。
 */
export interface RouteShape {
  id: string
  name: string
  /** 层级序列;长度即段数 */
  tiers: readonly number[]
}

export const ROUTE_SHAPES: readonly RouteShape[] = [
  { id: 'brisk', name: '短促', tiers: [2, 7, 12, 18] },
  { id: 'even', name: '匀进', tiers: [2, 5, 8, 11, 14, 17] },
  { id: 'longtail', name: '长尾', tiers: [2, 4, 6, 9, 13, 19] },
  { id: 'lateclimb', name: '前缓后陡', tiers: [2, 3, 5, 9, 14, 20] },
  { id: 'earlyclimb', name: '前陡后缓', tiers: [2, 7, 12, 15, 17, 18] },
  { id: 'weave', name: '深浅交错', tiers: [3, 8, 6, 13, 10, 18] },
  { id: 'short_weave', name: '短程交错', tiers: [3, 9, 6, 15, 12] }
]

/** 事件节奏原型 */
export interface RhythmArchetype {
  id: string
  name: string
  /** 相对密度曲线,生成时按段数重采样 */
  curve: readonly number[]
}

export const RHYTHM_ARCHETYPES: readonly RhythmArchetype[] = [
  { id: 'flat', name: '平稳', curve: [2, 2, 2, 2, 2, 2] },
  { id: 'front', name: '前紧后松', curve: [4, 3, 3, 2, 1, 1] },
  { id: 'back', name: '前松后紧', curve: [1, 1, 2, 3, 3, 4] },
  { id: 'mid', name: '中段高压', curve: [1, 2, 4, 4, 2, 1] },
  { id: 'twin', name: '双峰', curve: [3, 1, 4, 1, 3, 1] },
  { id: 'finale', name: '终局堆积', curve: [1, 1, 2, 2, 3, 5] }
]

/** 把节奏曲线重采样到指定段数 */
function resampleRhythm(curve: readonly number[], n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i += 1) {
    const src = Math.round((i * (curve.length - 1)) / Math.max(1, n - 1))
    out.push(Math.max(1, curve[src]!))
  }
  return out
}

/**
 * 骨架扰动:每点 ±1,保持首尾与相邻关系的大势。
 * 上界读 MORTAL_TIER_MAX,不写裸 20:须与 BOSSES / MOBS 候选池上限同源。
 */
function jitterTiers(tiers: readonly number[], rng: RandomService): number[] {
  return tiers.map((t, i) => {
    if (i === 0) return t
    return Math.max(1, Math.min(MORTAL_TIER_MAX, t + rng.int(-1, 1)))
  })
}

/** 玩家在某层级上的基准属性(与 buildSim 的 BASE 同量级,再按 powerScale 缩放) */
const PLAYER_TIER_BASE = { attack: 96, defense: 54, maxHp: 1400 }

/** 首领难度系数,随地界推进递增 */
function bossDanger(index: number): number {
  return 1 + index * 0.05
}

/** 敌人池只取人间界层级(≤ MORTAL_TIER_MAX,与 MORTAL_REGIONS 同源) */
const BOSSES: EnemyDef[] = ENEMIES.filter(e => e.archetype !== undefined && e.tier <= MORTAL_TIER_MAX)
const MOBS: EnemyDef[] = ENEMIES.filter(e => e.archetype === undefined && e.tier <= MORTAL_TIER_MAX)
const ALL_EVENT_TAGS: string[] = [...new Set(EVENTS.flatMap(e => e.tags))]

/** 挑一个本世未占用的首领;全池用尽才复用(记下段序),不让生成失败 */
export function pickBoss(
  tier: number,
  rng: RandomService,
  used: Set<string>,
  pool: readonly EnemyDef[] = BOSSES
): { boss: EnemyDef; fellBack: boolean } {
  // 候选窗口放大,给去重留余地
  const cands = nearTier([...pool], tier, rng, Math.min(pool.length, 6))
  const fresh = cands.filter(b => !used.has(b.id))
  if (fresh.length > 0) return { boss: fresh[0]!, fellBack: false }
  const anyFresh = pool.filter(b => !used.has(b.id))
  if (anyFresh.length > 0) {
    const sorted = [...anyFresh].sort((a, b) => Math.abs(a.tier - tier) - Math.abs(b.tier - tier))
    return { boss: sorted[0]!, fellBack: false }
  }
  return { boss: cands[0]!, fellBack: true }
}

/** 取与目标层级相近的素材 */
function nearTier<T extends { tier: number }>(pool: T[], tier: number, rng: RandomService, n: number): T[] {
  const sorted = [...pool].sort((a, b) => Math.abs(a.tier - tier) - Math.abs(b.tier - tier))
  const window = sorted.slice(0, Math.max(n * 3, 8))
  const out: T[] = []
  const used = new Set<number>()
  while (out.length < n && used.size < window.length) {
    const i = rng.int(0, window.length - 1)
    if (used.has(i)) continue
    used.add(i)
    out.push(window[i]!)
  }
  return out
}

/**
 * 生成一个凡界:地界组合、地界顺序、敌人生态、首领机制、事件分布、资源偏向、世界规则全部重组。
 * 首段不设锚点:第一段天然可进入,与旧 REGIONS 解锁链无关。
 */
export function generateMortalWorld(seed: number): MortalWorld {
  const rng = new RandomService(mulberry32(seed))
  // 先定骨架与节奏(决定段数)
  const shape = ROUTE_SHAPES[rng.int(0, ROUTE_SHAPES.length - 1)]!
  const rhythm = RHYTHM_ARCHETYPES[rng.int(0, RHYTHM_ARCHETYPES.length - 1)]!
  const tiers = jitterTiers(shape.tiers, rng)
  const density = resampleRhythm(rhythm.curve, tiers.length)
  // 资源偏向须提前抽:放到后面会被 rng 消耗挤到同一取值
  const bias = BIASES[rng.int(0, BIASES.length - 1)]!

  const picked: typeof MORTAL_REGIONS = []
  const usedRegion = new Set<string>()
  while (picked.length < tiers.length) {
    const r = MORTAL_REGIONS[rng.int(0, MORTAL_REGIONS.length - 1)]!
    if (usedRegion.has(r.id)) continue
    usedRegion.add(r.id)
    picked.push(r)
  }

  const usedBossIds = new Set<string>()
  const bossFallbackAt: number[] = []
  const chain: MortalPlace[] = picked.map((r, i) => {
    // 层级来自骨架,原区域只贡献素材与名字
    const tier = tiers[i]!
    const foes = nearTier(MOBS, tier, rng, FOES_PER_PLACE)
    const picked2 = pickBoss(tier, rng, usedBossIds, BOSSES)
    const boss = picked2.boss
    usedBossIds.add(boss.id)
    if (picked2.fellBack) bossFallbackAt.push(i)
    const want = density[i]!
    const tags = nearTier(
      ALL_EVENT_TAGS.map(t => ({ t, tier })),
      tier,
      rng,
      want
    ).map(x => x.t)
    return {
      nodeId: `n${i}_${r.id}`,
      fromId: r.id,
      name: r.name,
      tier,
      enemies: foes.map(f => f.id),
      boss: boss.id,
      archetype: boss.archetype!,
      eventTags: [...new Set(tags)]
    }
  })

  const mut = MUTATORS[rng.int(0, MUTATORS.length - 1)]!
  return {
    seed,
    chain,
    shapeId: shape.id,
    shapeName: shape.name,
    rhythmId: rhythm.id,
    rhythmName: rhythm.name,
    ruleId: mut.id,
    ruleName: mut.name,
    rules: mut.rules,
    bias,
    bossFallbackAt
  }
}

/** 对照组:只打乱地界顺序,不动生态、首领、规则;它若能过新颖度门即判据太松 */
export function shuffleOnlyWorld(base: MortalWorld, seed: number): MortalWorld {
  const rng = new RandomService(mulberry32(seed))
  const chain = [...base.chain]
  for (let i = chain.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i)
    ;[chain[i], chain[j]] = [chain[j]!, chain[i]!]
  }
  // 层级与事件密度锚在位置上,只有素材跟着走
  const relevelled = chain.map((p, i) => {
    const anchor = base.chain[i]!
    return {
      ...p,
      tier: anchor.tier,
      // 直接沿用锚点:素材不足时 slice 会改变密度
      eventTags: anchor.eventTags
    }
  })
  return { ...base, seed, chain: relevelled }
}

// ============ 二、新颖度 ============

/** 结构特征集合:首领机制、敌人、事件标签 */
function featureSets(w: MortalWorld): { arch: Set<string>; foes: Set<string>; tags: Set<string> } {
  return {
    arch: new Set(w.chain.map(p => p.archetype)),
    foes: new Set(w.chain.flatMap(p => p.enemies)),
    tags: new Set(w.chain.flatMap(p => p.eventTags))
  }
}

/** 生态位差异:同一头妖物是否换了段序 */
function nicheDistance(a: MortalWorld, b: MortalWorld): number {
  const posOf = (w: MortalWorld): Map<string, number> => {
    const m = new Map<string, number>()
    w.chain.forEach((p, i) => p.enemies.forEach(e => m.set(e, i)))
    return m
  }
  const pa = posOf(a)
  const pb = posOf(b)
  let shared = 0
  let moved = 0
  for (const [id, ia] of pa) {
    const ib = pb.get(id)
    if (ib === undefined) continue
    shared += 1
    if (ia !== ib) moved += 1
  }
  return shared === 0 ? 1 : moved / shared
}

/** 新颖度 = 与历史最近邻的加权差异(0~1),与天界同构 */
export function mortalNovelty(w: MortalWorld, history: MortalWorld[]): number {
  if (history.length === 0) return 1
  const fa = featureSets(w)
  let nearest = 1
  for (const h of history) {
    const fb = featureSets(h)
    const d =
      0.3 * jaccardDistance(fa.arch, fb.arch) +
      0.3 * jaccardDistance(fa.foes, fb.foes) +
      0.15 * jaccardDistance(fa.tags, fb.tags) +
      0.15 * nicheDistance(w, h) +
      0.1 * (w.ruleId === h.ruleId ? 0 : 1)
    nearest = Math.min(nearest, d)
  }
  return nearest
}

// ============ 三、可玩性审计 ============

export interface MortalAudit {
  /** 各构筑对本世界的平均胜率,降序 */
  rates: { name: string; rate: number }[]
  /** 可行构筑数(胜率 ≥ 阈值) */
  viable: number
  /** 最强构筑胜率 */
  top: number
  /** 次强 / 最强 */
  runnerRatio: number
  /** 每处地界的首领是否都有对应生态(层级差在容许内) */
  bossFits: boolean
  passed: boolean
}

const VIABLE_MIN = 0.35
const TOP_MAX = 0.97
const RUNNER_MIN = 0.5
const VIABLE_COUNT_MIN = 3

function snapOf(id: string, tier: number, danger: number): CombatantSnap | null {
  const def = enemyDef(id)
  return def ? makeEnemySnap(def, tier, danger) : null
}

/** 把构筑放到某个层级:玩家与敌人同步按 powerScale 缩放,词条与流派特性不变 */
function scaledBuildSnap(profileIdx: number, tier: number): CombatantSnap {
  const base = buildSnap(BUILD_PROFILES[profileIdx]!)
  const scale = powerScale(tier)
  return {
    ...base,
    attack: mulN(scale, PLAYER_TIER_BASE.attack),
    defense: mulN(scale, PLAYER_TIER_BASE.defense),
    maxHp: mulN(scale, PLAYER_TIER_BASE.maxHp)
  }
}

/** 构筑在整条地界链上的平均单场胜率;不用全链连胜(单场胜率的六次方,判据失去分辨力) */
function runChain(profileIdx: number, w: MortalWorld, n: number, seed: number): number {
  const rng = new RandomService(mulberry32(seed))
  let wins = 0
  let fights = 0
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < w.chain.length; k += 1) {
      const place = w.chain[k]!
      const foe = snapOf(place.boss, place.tier, bossDanger(k))
      if (!foe) continue
      fights += 1
      if (resolveCombat(scaledBuildSnap(profileIdx, place.tier), foe, rng, w.rules, false).win) wins += 1
    }
  }
  return fights === 0 ? 0 : wins / fights
}

/** 首领层级与所在地界是否匹配 */
function bossEcologyFits(w: MortalWorld): boolean {
  return w.chain.every(p => {
    const def = enemyDef(p.boss)
    return def !== undefined && Math.abs(def.tier - p.tier) <= 9
  })
}

export function auditMortalWorld(w: MortalWorld, runs = 12): MortalAudit {
  return auditMortalWorldFrom(
    BUILD_PROFILES.map((p, i) => ({ name: p.name, rate: runChain(i, w, runs, w.seed + i * 977) })),
    w
  )
}

/**
 * 分块版:每算完一个构筑让出主线程一拍。
 *
 * 同步版一次跑完 6 构筑 × runs 次 × 链长段战斗,实测单次审计 42ms ——
 * 凝界在观众面前连试几个种子,主线程被反复独占,进页面时玩家看到的是卡住。
 *
 * 分块后每块的量级降到 1/6(约 7ms),浏览器有机会在两块之间渲染与响应输入。
 * **判定结果与同步版逐位相同**:只是把同一个 map 拆开跨界等,没有改任何算式。
 */
export async function auditMortalWorldAsync(w: MortalWorld, runs = 12): Promise<MortalAudit> {
  const rates: { name: string; rate: number }[] = []
  for (let i = 0; i < BUILD_PROFILES.length; i += 1) {
    const p = BUILD_PROFILES[i]!
    rates.push({ name: p.name, rate: runChain(i, w, runs, w.seed + i * 977) })
    await new Promise(res => setTimeout(res, 0))
  }
  return auditMortalWorldFrom(rates, w)
}

/** 由已算好的各构筑胜率收尾(同步与分块两条路共用,避免判定逻辑分叉) */
function auditMortalWorldFrom(raw: { name: string; rate: number }[], w: MortalWorld): MortalAudit {
  const rates = [...raw].sort((a, b) => b.rate - a.rate)
  const viable = rates.filter(r => r.rate >= VIABLE_MIN).length
  const top = rates[0]!.rate
  const runnerRatio = top > 0 ? rates[1]!.rate / top : 0
  const bossFits = bossEcologyFits(w)
  return {
    rates,
    viable,
    top,
    runnerRatio,
    bossFits,
    passed: viable >= VIABLE_COUNT_MIN && top <= TOP_MAX && runnerRatio >= RUNNER_MIN && bossFits
  }
}

// ============ 四、过审生成 ============


// ============ 五、素材容量 ============

export interface MaterialCapacity {
  regions: number
  mobs: number
  bosses: number
  archetypes: number
  eventTags: number
  events: number
  /** 地界链的组合数(仅组合,不含生态重组) */
  chainCombos: number
}

export function materialCapacity(): MaterialCapacity {
  // 以最长骨架计 C(人间界区域数, n)
  const maxLen = Math.max(...ROUTE_SHAPES.map(s2 => s2.tiers.length))
  let combos = 1
  for (let i = 0; i < maxLen; i += 1) combos = (combos * (MORTAL_REGIONS.length - i)) / (i + 1)
  return {
    regions: MORTAL_REGIONS.length,
    mobs: MOBS.length,
    bosses: BOSSES.length,
    archetypes: new Set(BOSSES.map(b => b.archetype!)).size,
    eventTags: ALL_EVENT_TAGS.length,
    events: EVENTS.length,
    chainCombos: Math.round(combos)
  }
}

/** 资源偏向的取值集合,供审计检查分布 */
export const BIAS_POOL: readonly string[] = BIASES

export { NOVELTY_MIN }
export type { StatMods }
