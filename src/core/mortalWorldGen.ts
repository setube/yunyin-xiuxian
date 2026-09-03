/**
 * 凡界世界生成 —— 最小可行性审计
 *
 * ## 要证明的命题
 *
 * **用现有素材(20 区域 / 60 敌人 / 8 种 Boss 机制 / 51 事件),
 * 在不新造任何内容的前提下,能否稳定生成「玩家第二次遇到时仍存在未知」的凡界?**
 *
 * 这是纯审计层。不碰道果价格、不碰奖励、不碰购买次数、不碰轮回规则 ——
 * 一旦证明成立,才值得考虑接到道果出口上。
 *
 * ## 三条硬检查(承袭天界 worldGen 的判据)
 *
 *   一、不是换顺序就叫新世界   必须有结构变化,故设「纯洗牌」对照组
 *   二、不是随机就叫新世界     沿用 NOVELTY_MIN = 0.25 硬门槛
 *   三、新颖度不能牺牲可玩性   仍须 ≥3 可行构筑、无接近必胜、Boss 有对应生态
 *
 * ## 为什么是「重组」而不是「新造」
 *
 * 新颖不来自素材本身没见过,而来自**因果关系没这样组合过**:
 * 同一头妖物换个生态位、换个 Boss 机制家族、配一条不同的世界规则,
 * 玩家面对的就是一组新的解法空间。
 */
import type { CombatRules, CombatantSnap, EnemyDef, StatMods } from '@/types'
import { mulberry32, RandomService } from '@/utils/random'
import { REGIONS } from '@/data/regions'
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
  /**
   * 路线节点 id —— 本世可达性的唯一凭据。
   *
   * 解锁对象从 regionId 提升到这里:同一处「落霞谷」这一世在第三段、
   * 下一世在第五段,都不会再与旧解锁链冲突
   */
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
  /** 事件标签 */
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
  /**
   * 首领去重回退的段序。
   *
   * 候选不足时允许复用已占用的首领,但必须记下来 ——
   * 否则「回退」会悄悄退化成「重复」而无人察觉
   */
  bossFallbackAt: number[]
}

const FOES_PER_PLACE = 3
const BIASES = ['草木丰饶', '矿脉深厚', '典籍散佚', '灵石充盈', '药气氤氲'] as const

/**
 * 路线骨架模板。
 *
 * 上一轮的审计钉出:层级递进曾硬编码为 `2 + i * 3`,六世的推进节奏
 * 一模一样 —— 玩家的重复感主要来自这里,而不是敌人换没换。
 *
 * 但**不能改成纯随机**:`2 → 19 → 3 → 17` 虽然「新」,玩家却无法
 * 形成合理的空间认知。故取「有限模板 + 参数扰动 + 历史去重」。
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

/**
 * 事件节奏原型。
 *
 * `222222` 不是「事件少」,是**没有节奏设计**。这些原型让玩家能感觉到
 * 「这一世前面平静,后面突然密集」,而不是「又六段,每段两个」。
 */
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

/** 骨架扰动:每点 ±1,保持首尾与相邻关系的大势 */
function jitterTiers(tiers: readonly number[], rng: RandomService): number[] {
  return tiers.map((t, i) => {
    if (i === 0) return t
    return Math.max(1, Math.min(20, t + rng.int(-1, 1)))
  })
}

/** 玩家在某层级上的基准属性(与 buildSim 的 BASE 同量级,再按 powerScale 缩放) */
const PLAYER_TIER_BASE = { attack: 96, defense: 54, maxHp: 1400 }

/** 首领的难度系数:随地界推进递增,前松后紧 */
function bossDanger(index: number): number {
  return 1 + index * 0.05
}

const BOSSES: EnemyDef[] = ENEMIES.filter(e => e.archetype !== undefined)
const MOBS: EnemyDef[] = ENEMIES.filter(e => e.archetype === undefined)
const ALL_EVENT_TAGS: string[] = [...new Set(EVENTS.flatMap(e => e.tags))]

/**
 * 挑一个尚未被本世占用的首领。
 *
 * 实测缺陷:同一世界里「幽冥海皇」曾同时镇守第二、三段 ——
 * nearTier 逐段独立取样,段与段之间互不知情。
 *
 * 约束是**唯一性**,不是「候选池够大」:先按层级取一批候选,
 * 滤掉已占用的;若确实无可用(池子小或层级极端),
 * 回退到允许复用并记下段序,而不是让生成失败
 */
export function pickBoss(
  tier: number,
  rng: RandomService,
  used: Set<string>,
  pool: readonly EnemyDef[] = BOSSES
): { boss: EnemyDef; fellBack: boolean } {
  // 候选窗口开大一些,给去重留余地
  const cands = nearTier([...pool], tier, rng, Math.min(pool.length, 6))
  const fresh = cands.filter(b => !used.has(b.id))
  if (fresh.length > 0) return { boss: fresh[0]!, fellBack: false }
  // 窗口内全被占用:在全池里再找一个没用过的
  const anyFresh = pool.filter(b => !used.has(b.id))
  if (anyFresh.length > 0) {
    const sorted = [...anyFresh].sort((a, b) => Math.abs(a.tier - tier) - Math.abs(b.tier - tier))
    return { boss: sorted[0]!, fellBack: false }
  }
  // 全池用尽(段数多于首领总数)才复用
  return { boss: cands[0]!, fellBack: true }
}

/** 取与目标层级相近的素材,避免把一阶妖物丢进末段 */
function nearTier<T extends { tier: number }>(pool: T[], tier: number, rng: RandomService, n: number): T[] {
  const sorted = [...pool].sort((a, b) => Math.abs(a.tier - tier) - Math.abs(b.tier - tier))
  // 在最接近的一批里随机取,保留层级合理性的同时留出重组空间
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
 * 生成一个凡界。
 *
 * 七个维度全部参与重组:地界组合、地界顺序、敌人生态、首领机制、
 * 事件分布、资源偏向、世界规则
 */
/**
 * 生成一个凡界。
 *
 * 首段不再需要锚点:可达性已迁到 mortalWorld.route,
 * 第一段天然可进入,与旧 REGIONS 解锁链无关
 */
export function generateMortalWorld(seed: number): MortalWorld {
  const rng = new RandomService(mulberry32(seed))
  // 先定骨架与节奏 —— 它们决定段数,也决定玩家感受到的推进形状
  const shape = ROUTE_SHAPES[rng.int(0, ROUTE_SHAPES.length - 1)]!
  const rhythm = RHYTHM_ARCHETYPES[rng.int(0, RHYTHM_ARCHETYPES.length - 1)]!
  const tiers = jitterTiers(shape.tiers, rng)
  const density = resampleRhythm(rhythm.curve, tiers.length)
  // 资源偏向提前抽取,避免被后续 rng 消耗挤到同一取值(上一轮记下的弱点)
  const bias = BIASES[rng.int(0, BIASES.length - 1)]!

  // 地界组合:从 20 处里选 tiers.length 处
  const picked: typeof REGIONS = []
  const usedRegion = new Set<string>()
  while (picked.length < tiers.length) {
    const r = REGIONS[rng.int(0, REGIONS.length - 1)]!
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
    // 事件标签数量由节奏曲线决定
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

/**
 * 对照组:只打乱地界顺序,不动生态、首领、规则。
 *
 * 用来验证「换顺序不等于新世界」—— 若它也能过新颖度门,
 * 说明判据太松
 */
export function shuffleOnlyWorld(base: MortalWorld, seed: number): MortalWorld {
  const rng = new RandomService(mulberry32(seed))
  const chain = [...base.chain]
  for (let i = chain.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i)
    ;[chain[i], chain[j]] = [chain[j]!, chain[i]!]
  }
  // 骨架与节奏都锚在**位置**上,只有素材跟着走 ——
  // 这才是「换顺序不算新」的准确定义:层级曲线与事件密度分毫未动,
  // 换的只是这一段叫什么名字、住着哪头妖物
  const relevelled = chain.map((p, i) => {
    const anchor = base.chain[i]!
    return {
      ...p,
      tier: anchor.tier,
      // 事件密度锚在位置上;素材不足时 slice 会改变密度,故直接沿用锚点
      eventTags: anchor.eventTags
    }
  })
  return { ...base, seed, chain: relevelled }
}

// ============ 二、新颖度 ============

/** 世界的结构特征集合 —— 首领机制、敌人、事件标签 */
function featureSets(w: MortalWorld): { arch: Set<string>; foes: Set<string>; tags: Set<string> } {
  return {
    arch: new Set(w.chain.map(p => p.archetype)),
    foes: new Set(w.chain.flatMap(p => p.enemies)),
    tags: new Set(w.chain.flatMap(p => p.eventTags))
  }
}

function jaccardDistance(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter += 1
  return 1 - inter / (a.size + b.size - inter)
}

/** 生态位差异:同一头妖物出现在第几段,算不算换了位置 */
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

/**
 * 新颖度 = 与历史最近邻的加权差异(0~1)。
 *
 * 四维加权,与天界同构但换成凡界的可重组维度:
 * 首领机制、敌人构成、事件分布、生态位
 */
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

/**
 * 把构筑放到某个层级上。
 *
 * BUILD_PROFILES 是固定强度的「中期典型成型度」,直接拿去打 tier 17
 * 必然全灭。审计要问的是**同等成长度下各构筑的相对表现**,
 * 故玩家与敌人同步按 powerScale 缩放 —— 词条与流派特性保持不变
 */
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

/**
 * 一个构筑在整条地界链上的平均单场胜率。
 *
 * 用平均而非「全链连胜」:连胜是单场胜率的六次方,
 * 八成的单场胜率会被压成两成六,判据会失去分辨力
 */
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
      if (resolveCombat(scaledBuildSnap(profileIdx, place.tier), foe, rng, w.rules).win) wins += 1
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
  const rates = BUILD_PROFILES.map((p, i) => ({ name: p.name, rate: runChain(i, w, runs, w.seed + i * 977) })).sort(
    (a, b) => b.rate - a.rate
  )
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

export interface ApprovedMortalWorld {
  world: MortalWorld
  audit: MortalAudit
  novelty: number
  /** 被弃用的候选数 */
  rejected: number
}

/**
 * 生成一个过审的凡界:候选 → 可玩性审计 → 新颖度门 → 不合格换种子重来。
 *
 * 与天界 generateApprovedWorld 同一套流程,证明这套判据可以脱离天界复用
 */
export function generateApprovedMortal(
  baseSeed: number,
  history: MortalWorld[] = [],
  maxTries = 120,
  runs = 12
): ApprovedMortalWorld | null {
  for (let t = 0; t < maxTries; t += 1) {
    const world = generateMortalWorld(baseSeed + t * 7919)
    const audit = auditMortalWorld(world, runs)
    if (!audit.passed) continue
    const novelty = mortalNovelty(world, history)
    if (novelty < NOVELTY_MIN) continue
    return { world, audit, novelty, rejected: t }
  }
  return null
}

/** 连续生成 n 个互不重复的凡界,返回实际拿到的序列 */
export function generateSeries(n: number, baseSeed = 20260904, runs = 10): ApprovedMortalWorld[] {
  const out: ApprovedMortalWorld[] = []
  const history: MortalWorld[] = []
  for (let i = 0; i < n; i += 1) {
    const got = generateApprovedMortal(baseSeed + i * 104729, history, 120, runs)
    if (!got) break
    out.push(got)
    history.push(got.world)
  }
  return out
}

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
  // 以最长骨架计 C(20, n)
  const maxLen = Math.max(...ROUTE_SHAPES.map(s2 => s2.tiers.length))
  let combos = 1
  for (let i = 0; i < maxLen; i += 1) combos = (combos * (REGIONS.length - i)) / (i + 1)
  return {
    regions: REGIONS.length,
    mobs: MOBS.length,
    bosses: BOSSES.length,
    archetypes: new Set(BOSSES.map(b => b.archetype!)).size,
    eventTags: ALL_EVENT_TAGS.length,
    events: EVENTS.length,
    chainCombos: Math.round(combos)
  }
}

/** 资源偏向的取值集合 —— 供审计检查分布 */
export const BIAS_POOL: readonly string[] = BIASES

export { NOVELTY_MIN }
export type { StatMods }
