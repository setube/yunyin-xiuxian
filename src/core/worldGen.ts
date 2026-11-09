/** 程序化终局世界生成器:随机规则 × 敌池 × 路线 × 界主 → 模拟裁判过审 → 正式虚界 */
import type { CelestialWorldDef, WorldFoeShape, WorldRouteNode } from '@/types'
import { mulberry32, RandomService } from '@/utils/random'
import { jaccardDistance } from '@/utils/setMath'
import { CELESTIAL_WORLDS, TRIAL_FOES } from '@/data/endgame'
import { MUTATORS, MUTATOR_THEMES, THEME_IDENTITY, type MutatorTheme } from '@/data/mutators'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { worldClearRate } from './gauntlet'
import { budgetOfRules, WORLD_BUDGET_CAP } from './ruleBudget'

/** 变数天界的锚点层级:阶梯最深处(见 types 的 CelestialWorldDef.anchorTier) */
export const VOID_ANCHOR_TIER = 32

const NAME_HEADS = ['玄冥', '赤霄', '雷狱', '幽荒', '碧落', '鎏金', '皓月', '烬余', '沉星', '孤峰']
const NAME_TAILS = ['天', '渊', '墟', '穹', '泽', '狱']
const SEALS = ['虚', '幻', '玄', '冥', '溟', '荒']

const SHAPE_POOL: WorldFoeShape[] = [...CELESTIAL_WORLDS.flatMap(w => w.foes), ...TRIAL_FOES]

function shapeRisk(s: WorldFoeShape): string {
  if (s.mods?.dodgeRate) return '身影难捕'
  const sk = s.skills[0]
  if (!sk) return '寻常之敌'
  if (sk.effect === 'multi') return '多段连击'
  if (sk.effect === 'pierce') return '真伤穿透'
  if (sk.effect === 'bleed') return '流血消耗'
  if (sk.effect === 'drain') return '汲血难缠'
  if (sk.effect === 'stun') return '震慑打断'
  if (sk.mult >= 2) return '重击高爆'
  return '攻守均衡'
}

function pick<T>(rng: RandomService, list: readonly T[]): T {
  return list[rng.int(0, list.length - 1)]!
}

export interface VoidWorldAudit {
  /** 六流派通关率(降序) */
  rates: { name: string; rate: number }[]
  viable: number
  best: number
  second: number
}

/** 平衡裁判:各流派模拟通关率 */
/**
 * 平衡裁判:各流派模拟通关率。
 *
 * `runs` 默认 200,不是 10。10 次的通关率分辨率只有 10%(0/10、1/10…),
 * 而调用方按 35% 这类阈值去数「几个流派能通」——
 * **一个样本的抖动就能让达标数跳变**。实测同一个世界、同一套配置:
 *
 * ```
 * runs= 10 → viable=2    runs= 50 → 3    runs=200 → 3    runs=400 → 4
 * ```
 *
 * 200 跑的耗时约 0.5s,对测试无压力。
 */
export function auditVoidWorld(world: CelestialWorldDef, runs = 200): VoidWorldAudit {
  const rates = BUILD_PROFILES.map((p, i) => ({
    name: p.name,
    rate: worldClearRate(world, buildSnap(p), runs, 77000 + i * 31 + world.name.length)
  })).sort((a, b) => b.rate - a.rate)
  return {
    rates,
    viable: rates.filter(r => r.rate >= 0.35).length,
    best: rates[0]!.rate,
    second: rates[1]!.rate
  }
}

function passes(a: VoidWorldAudit): boolean {
  // ≥3 可行 · 无近必胜 · 能被打穿 · 分布不塌缩
  return a.viable >= 3 && a.best <= 0.97 && a.best >= 0.5 && a.second >= a.best * 0.5
}

// ---------- 新颖度 ----------

/** 新世界与历史最近邻的差异下限 */
export const NOVELTY_MIN = 0.25

export interface HistoryEntry {
  world: CelestialWorldDef
  /** 该世界最优两流派(可选) */
  topStyles?: string[]
}

/** 规则向量:各维归一后可比 */
function ruleVector(w: CelestialWorldDef): number[] {
  const r = w.rules
  return [
    r.healMult ?? 1,
    (r.maxRounds ?? 50) / 50,
    r.shieldCapRatio ?? 1,
    (r.enemyHpMult ?? 1) - 1,
    (r.enemyAtkMult ?? 1) - 1,
    (r.playerAtkMult ?? 1) - 1,
    r.enemyExtraMods?.dodgeRate ?? 0,
    r.enemyExtraMods?.critRate ?? 0,
    (r.playerExtraMods?.critDamage ?? 0) / 2
  ]
}

function ruleDistance(a: CelestialWorldDef, b: CelestialWorldDef): number {
  const va = ruleVector(a)
  const vb = ruleVector(b)
  let sum = 0
  for (let i = 0; i < va.length; i += 1) sum += (va[i]! - vb[i]!) ** 2
  return Math.min(1, Math.sqrt(sum / va.length) * 2.2)
}

function foeMechSet(w: CelestialWorldDef): Set<string> {
  const out = new Set<string>()
  for (const f of [...w.foes, w.guardian]) {
    for (const sk of f.skills) {
      if (sk.effect) out.add(sk.effect)
      if (sk.mult >= 2) out.add('heavy')
    }
    if ((f.mods?.dodgeRate ?? 0) >= 0.2) out.add('dodgy')
  }
  return out
}

/** 最优两流派差异;历史无审计时取中性 0.5 */
function styleDistance(auditTop: string[], entry: HistoryEntry): number {
  if (!entry.topStyles) return 0.5
  const overlap = auditTop.filter(s => entry.topStyles!.includes(s)).length
  return 1 - overlap / 2
}

/** 新颖度:与历史最近邻世界的加权差异(0~1,越高越新) */
export function noveltyScore(world: CelestialWorldDef, audit: VoidWorldAudit, history: HistoryEntry[]): number {
  if (history.length === 0) return 1
  const mech = foeMechSet(world)
  const topStyles = audit.rates.slice(0, 2).map(r => r.name)
  let nearest = 1
  for (const entry of history) {
    const d =
      0.45 * ruleDistance(world, entry.world) +
      0.3 * jaccardDistance(mech, foeMechSet(entry.world)) +
      0.25 * styleDistance(topStyles, entry)
    nearest = Math.min(nearest, d)
  }
  return nearest
}

/** 手工四天的审计缓存,首次使用时计算 */
let manualHistory: HistoryEntry[] | null = null

/**
 * 新颖度历史(手工世界的最佳两流派):逐个世界算完就让出主线程。
 *
 * 首次调用要对每座手工世界跑一次 auditVoidWorld(默认 runs=200),实测单座 469ms ——
 * 两座就是 938ms,而这段原本落在玩家点「窥探虚界」的同步路径上。
 * 分块后每块只占一座世界的时间,且结果会写进同一份缓存(后续同步读仍是 O(1))。
 */
export async function defaultHistoryAsync(): Promise<HistoryEntry[]> {
  if (manualHistory) return manualHistory
  const out: HistoryEntry[] = []
  for (const w of CELESTIAL_WORLDS) {
    /*
     * runs 取 HISTORY_AUDIT_RUNS 而不是 auditVoidWorld 默认的 200:
     * 历史只要「最佳两流派」的名字,而 200 次采样每座 469ms。
     * 实测 runs=30 与 runs=200 的 top2 集合逐座一致(runs=7 时赤炎天/无相天会漂)。
     */
    out.push({ world: w, topStyles: auditVoidWorld(w, HISTORY_AUDIT_RUNS).rates.slice(0, 2).map(r => r.name) })
    await new Promise(res => setTimeout(res, 0))
  }
  manualHistory = out
  return out
}

/** 算历史 top2 用的采样数:30 与 200 的集合一致,耗时只有 1/7 */
const HISTORY_AUDIT_RUNS = 30

/** 生成一个候选世界;语义涣散(主题 >2 轴)或规则超预算者直接流产 */
function generateCandidate(seed: number): CelestialWorldDef | null {
  const rng = new RandomService(mulberry32(seed))
  const name = `${pick(rng, NAME_HEADS)}${pick(rng, NAME_TAILS)}`
  const mutPool = [...MUTATORS]
  const mutCount = rng.int(2, 3)
  const picked = []
  for (let i = 0; i < mutCount && mutPool.length; i += 1) {
    picked.push(mutPool.splice(rng.int(0, mutPool.length - 1), 1)[0]!)
  }
  const themes = picked.map(m => MUTATOR_THEMES[m.id]).filter((t): t is MutatorTheme => t !== undefined)
  const themeSet = new Set(themes)
  if (themeSet.size > 2) return null
  const counts = new Map<MutatorTheme, number>()
  for (const t of themes) counts.set(t, (counts.get(t) ?? 0) + 1)
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? themes[0]!
  const identity = THEME_IDENTITY[dominant]
  const rules = picked.reduce<CelestialWorldDef['rules']>((acc, m) => {
    const out = { ...acc }
    if (m.rules.maxRounds !== undefined) out.maxRounds = Math.min(out.maxRounds ?? Infinity, m.rules.maxRounds)
    if (m.rules.healMult !== undefined) out.healMult = (out.healMult ?? 1) * m.rules.healMult
    if (m.rules.shieldCapRatio !== undefined) out.shieldCapRatio = Math.min(out.shieldCapRatio ?? 1, m.rules.shieldCapRatio)
    if (m.rules.enemyHpMult !== undefined) out.enemyHpMult = (out.enemyHpMult ?? 1) * m.rules.enemyHpMult
    if (m.rules.playerAtkMult !== undefined) out.playerAtkMult = (out.playerAtkMult ?? 1) * m.rules.playerAtkMult
    if (m.rules.enemyAtkMult !== undefined) out.enemyAtkMult = (out.enemyAtkMult ?? 1) * m.rules.enemyAtkMult
    if (m.rules.enemyExtraMods) {
      out.enemyExtraMods = { ...(out.enemyExtraMods ?? {}) }
      for (const k in m.rules.enemyExtraMods) {
        const key = k as keyof NonNullable<typeof m.rules.enemyExtraMods>
        out.enemyExtraMods[key] = (out.enemyExtraMods[key] ?? 0) + (m.rules.enemyExtraMods[key] ?? 0)
      }
    }
    if (m.rules.playerExtraMods) {
      out.playerExtraMods = { ...(out.playerExtraMods ?? {}) }
      for (const k in m.rules.playerExtraMods) {
        const key = k as keyof NonNullable<typeof m.rules.playerExtraMods>
        out.playerExtraMods[key] = (out.playerExtraMods[key] ?? 0) + (m.rules.playerExtraMods[key] ?? 0)
      }
    }
    return out
  }, {})

  const foeA = pick(rng, SHAPE_POOL)
  let foeB = pick(rng, SHAPE_POOL)
  if (foeB === foeA) foeB = SHAPE_POOL[(SHAPE_POOL.indexOf(foeA) + 1) % SHAPE_POOL.length]!
  const guardianBase = pick(rng, SHAPE_POOL)
  const guardian: WorldFoeShape = {
    ...guardianBase,
    name: `${name}之主`,
    atkR: guardianBase.atkR * 1.05,
    hpR: guardianBase.hpR * 1.7,
    skills: guardianBase.skills.map(s => ({ ...s }))
  }

  const routes: [WorldRouteNode, WorldRouteNode][] = []
  for (let layer = 0; layer < 3; layer += 1) {
    const nodes: WorldRouteNode[] = []
    const bonusLow = rng.int(7, 10)
    const bonusHigh = bonusLow + rng.int(3, 6)
    for (let i = 0; i < 2; i += 1) {
      const foe = pick(rng, SHAPE_POOL)
      nodes.push({
        id: `void_${seed}_${layer}_${i}`,
        name: `${pick(rng, ['断', '孤', '幽', '烬', '雾', '雷'])}${pick(rng, ['径', '崖', '谷', '殿', '桥', '林'])}`,
        desc: `${foe.name}盘踞于此`,
        foe,
        bonus: i === 0 ? bonusLow : bonusHigh,
        riskText: shapeRisk(foe)
      })
    }
    routes.push([nodes[0]!, nodes[1]!])
  }

  if (budgetOfRules(rules) > WORLD_BUDGET_CAP) return null

  return {
    id: 'void',
    name,
    seal: pick(rng, SEALS),
    anchorTier: VOID_ANCHOR_TIER,
    desc: `此乃「${identity}」之界,天道以变数织成。`,
    ruleText: picked.map(m => `${m.name}:${m.text}`),
    rules,
    entryCost: 20,
    fights: 6,
    healBetweenPct: 0.5,
    foes: [foeA, foeB],
    guardian,
    routes,
    rewardDaoSource: 60
  }
}

export interface GeneratedWorld {
  world: CelestialWorldDef
  audit: VoidWorldAudit
  /** 与历史最近邻世界的差异(0~1) */
  novelty: number
  /** 淘汰的不合格候选数 */
  rejected: number
}

/**
 * 生成过审虚界:候选 → 平衡裁判 → 新颖度门,不合格换种子重来。
 * 奖励按实测难度定价:最优流派通率越低,道源越高。
 *
 * 奖励算式 `min(100, max(55, 60*(1.85-best)))` 的两层钳制只在极端取值才生效:
 * best 是 clears/runs 的离散值(runs=7 时只有 0.571/0.714/0.857),
 * 过审又要求 best∈[0.5,0.97],于是常见奖励落在 57~81。
 *   Math.max(55) 要到 best≥0.9333 才咬住 —— 仅当 runs 提高或阈值放宽时才会出现。
 *   Math.min(100) 在 best>0.1833 时恒不触发,合法区间内永远够不到。
 * 两层都保留:它们是防御性的,阈值一改就会真的生效。spec 钉:worldGen.spec 的「虚界奖励定价」。
 */
/**
 * 分块异步版:与 generateApprovedWorld 同一内核,同参结果逐位一致。
 *
 * 每验完一个候选就让出一次主线程 —— 实测单次候选的审计(六流派 × 7 场)约 70ms,
 * 而 maxTries 到 40 时整趟最坏 3183ms、中位 654ms。同步跑等于点一下钮整页僵住。
 * 分块后每块只占一个候选的时间,玩家能看到「窥探中」并继续操作别处。
 */
export async function generateApprovedWorldAsync(
  baseSeed: number,
  maxTries = 200,
  history?: HistoryEntry[],
  opts: { shouldStop?: () => boolean; onProgress?: (tried: number, total: number) => void } = {}
): Promise<GeneratedWorld | null> {
  const hist = history ?? (await defaultHistoryAsync())
  for (let t = 0; t < maxTries; t += 1) {
    if (opts.shouldStop?.()) return null
    const world = generateCandidate(baseSeed + t * 7919)
    if (world) {
      const audit = auditVoidWorld(world, 7)
      if (passes(audit)) {
        const novelty = noveltyScore(world, audit, hist)
        if (novelty >= NOVELTY_MIN) {
          const reward = Math.round(Math.min(100, Math.max(55, 60 * (1.85 - audit.best))))
          opts.onProgress?.(t + 1, maxTries)
          return { world: { ...world, rewardDaoSource: reward }, audit, novelty, rejected: t }
        }
      }
    }
    opts.onProgress?.(t + 1, maxTries)
    // 让出主线程;每候选一次,粒度即「一个候选的审计」
    await new Promise(res => setTimeout(res, 0))
  }
  return null
}
