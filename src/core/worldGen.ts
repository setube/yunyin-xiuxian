/**
 * 程序化终局世界生成器(Phase 23)—— 规则空间自动产生内容
 * 随机规则 × 随机敌池 × 随机路线 × 随机界主 → 模拟裁判过审 → 正式虚界
 * 裁判条件继承 P20/P22:≥3 可行流派、无近必胜、能被打穿、分布不塌缩;
 * 奖励由裁判实测难度定价,「奖励异常」被结构性排除
 */
import type { CelestialWorldDef, WorldFoeShape, WorldRouteNode } from '@/types'
import { mulberry32, RandomService } from '@/utils/random'
import { jaccardDistance } from '@/utils/setMath'
import { CELESTIAL_WORLDS, TRIAL_FOES } from '@/data/endgame'
import { MUTATORS, MUTATOR_THEMES, THEME_IDENTITY, type MutatorTheme } from '@/data/mutators'
import { BUILD_PROFILES, buildSnap } from './buildSim'
import { worldClearRate } from './celestialSim'
import { budgetOfRules, WORLD_BUDGET_CAP } from './ruleBudget'

/** 变数天界的锚点层级:阶梯最深处(见 types 的 CelestialWorldDef.anchorTier) */
export const VOID_ANCHOR_TIER = 32

const NAME_HEADS = ['玄冥', '赤霄', '雷狱', '幽荒', '碧落', '鎏金', '皓月', '烬余', '沉星', '孤峰']
const NAME_TAILS = ['天', '渊', '墟', '穹', '泽', '狱']
const SEALS = ['虚', '幻', '玄', '冥', '溟', '荒']

/** 生成敌池:四天全部敌人 + 试炼傀影 */
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

/** 裁判:一次生成是否配得上成为世界 */
export function auditVoidWorld(world: CelestialWorldDef, runs = 10): VoidWorldAudit {
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
  // ≥3 可行 · 无近必胜 · 能被打穿 · 分布不塌缩(P22 门)
  return a.viable >= 3 && a.best <= 0.97 && a.best >= 0.5 && a.second >= a.best * 0.5
}

// ---------- 新颖度(Phase 24):程序化生成不许随机换皮 ----------

/** 新世界与历史最近邻的差异下限 */
export const NOVELTY_MIN = 0.25

export interface HistoryEntry {
  world: CelestialWorldDef
  /** 该世界最优两流派(可选;虚界历史无审计缓存时不参与此维) */
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

/** 敌机制集合:技能效果 + 高闪避 + 重击标记 */
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

/** 最优流派差异:top2 完全相同=0,半同=0.5,全异=1;历史无审计时取中性 0.5 */
function styleDistance(auditTop: string[], entry: HistoryEntry): number {
  if (!entry.topStyles) return 0.5
  const overlap = auditTop.filter(s => entry.topStyles!.includes(s)).length
  return 1 - overlap / 2
}

/** 新颖度 = 与历史最近邻世界的加权差异(0~1,越高越新) */
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

/** 手工四天的审计缓存(最优两流派),首次使用时计算 */
let manualHistory: HistoryEntry[] | null = null

export function defaultHistory(): HistoryEntry[] {
  if (!manualHistory) {
    manualHistory = CELESTIAL_WORLDS.map(w => ({
      world: w,
      topStyles: auditVoidWorld(w)
        .rates.slice(0, 2)
        .map(r => r.name)
    }))
  }
  return manualHistory
}

/** 生成一个候选世界;语义涣散(主题 >2 轴)或规则超预算者直接流产 */
function generateCandidate(seed: number): CelestialWorldDef | null {
  const rng = new RandomService(mulberry32(seed))
  const name = `${pick(rng, NAME_HEADS)}${pick(rng, NAME_TAILS)}`
  // 规则:变数池抽 2~3 条(规则来源与天道变数同宗)
  const mutPool = [...MUTATORS]
  const mutCount = rng.int(2, 3)
  const picked = []
  for (let i = 0; i < mutCount && mutPool.length; i += 1) {
    picked.push(mutPool.splice(rng.int(0, mutPool.length - 1), 1)[0]!)
  }
  // 语义完整性(Phase 25):主题至多两轴,须讲得通,不许大杂烩
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

  // 敌池与界主
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

  // 路线:3 层 × 2 节点
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

  // 规则预算(Phase 25):世界复杂度同账管理,超支流产
  if (budgetOfRules(rules) > WORLD_BUDGET_CAP) return null

  return {
    id: 'void',
    name,
    seal: pick(rng, SEALS),
    // 变数织成的天界站在阶梯最深处:比无相天更深一档(玩家自己改规则,敌人也就照着最深的一界定标)
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
  /** 淘汰了多少个不合格候选 */
  rejected: number
}

/**
 * 生成一个过审虚界:候选 → 平衡裁判 → 新颖度门 → 不合格换种子重来。
 * 奖励按实测难度定价:最优流派通率越低,道源越高
 */
export function generateApprovedWorld(baseSeed: number, maxTries = 200, history?: HistoryEntry[]): GeneratedWorld | null {
  const hist = history ?? defaultHistory()
  for (let t = 0; t < maxTries; t += 1) {
    const world = generateCandidate(baseSeed + t * 7919)
    if (!world) continue
    const audit = auditVoidWorld(world, 7)
    if (!passes(audit)) continue
    const novelty = noveltyScore(world, audit, hist)
    if (novelty < NOVELTY_MIN) continue
    const reward = Math.round(Math.min(100, Math.max(55, 60 * (1.85 - audit.best))))
    const desc = `${world.desc}与诸天相似不足${Math.round((1 - novelty) * 10)}成,规则无常,过审方存。`
    return { world: { ...world, desc, rewardDaoSource: reward }, audit, novelty, rejected: t }
  }
  return null
}
