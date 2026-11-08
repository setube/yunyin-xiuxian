/** Build 模拟器:六大流派 × 七种敌人原型批量对战,输出克制矩阵;配套 spec 断言克制格局 */
import type { CombatantSnap, StatMods } from '@/types'
import { gn } from '@/utils/gnum'
import { mulberry32, RandomService } from '@/utils/random'
import { artifactDef, artifactValue } from '@/data/artifacts'
import { tribulationDef, TRIBULATIONS, type TribulationKind } from '@/data/tribulations'
import { resolveCombat } from './combat'
import { traceTribulation } from './tribulationDecision'
import { mergeMods } from './statsCalc'

// 流派构筑取中期典型成型度:词条×3~4 + 功法 + 天赋 + 法宝被动

export interface BuildProfile {
  id: string
  name: string
  mods: StatMods
  artifactId: string
  atkMult: number
  defMult: number
  hpMult: number
}

const BASE = { attack: 100, defense: 55, maxHp: 1400 }
const ARTIFACT_LEVEL = 3

export const BUILD_PROFILES: BuildProfile[] = [
  {
    id: 'beishui',
    name: '背水流',
    mods: { lowHpDamage: 0.95, lowHpReduction: 0.5, executeDamage: 0.45, lifesteal: 0.12 },
    artifactId: 'af_youming',
    atkMult: 1.0,
    defMult: 1.0,
    hpMult: 1.0
  },
  {
    id: 'gangdun',
    name: '罡盾流',
    mods: { shieldOnStart: 0.4, shieldPower: 0.5, damageReduction: 0.12 },
    artifactId: 'af_xuantian',
    atkMult: 0.95,
    defMult: 1.4,
    hpMult: 1.05
  },
  {
    id: 'fanzhen',
    name: '反震流',
    mods: { counterRate: 0.65, counterDamage: 1.5, damageReduction: 0.22 },
    artifactId: 'af_fuyao',
    atkMult: 0.78,
    defMult: 1.5,
    hpMult: 1.45
  },
  {
    id: 'lianji',
    name: '连击流',
    mods: { comboRate: 0.5, comboDamage: 0.7, speed: 0.3, critRate: 0.1, critDamage: 0.3 },
    artifactId: 'af_leiyin',
    atkMult: 1.1,
    defMult: 0.95,
    hpMult: 0.95
  },
  {
    id: 'muze',
    name: '沐泽流',
    mods: { lifesteal: 0.09, regenPerRound: 0.03, overhealShield: 0.9 },
    artifactId: 'af_yujing',
    atkMult: 0.88,
    defMult: 1.05,
    hpMult: 1.25
  },
  {
    id: 'fengmang',
    name: '锋芒流',
    mods: { fullHpDamage: 0.55, firstStrike: 0.7, dodgeRate: 0.12, critRate: 0.12, critDamage: 0.5, speed: 0.15 },
    artifactId: 'af_lihuo',
    atkMult: 1.15,
    defMult: 0.95,
    hpMult: 0.92
  }
]

/**
 * 组装流派战斗快照:法宝被动按等级并入词条,与真实玩家同走 mergeMods 递减。
 * 六派法宝都取自头十二阶(data/artifacts 阶梯里全是凡品,基线口径),品阶不扰动对照。
 */
export function buildSnap(profile: BuildProfile): CombatantSnap {
  const art = artifactDef(profile.artifactId)
  let mods: StatMods = { ...profile.mods }
  if (art) mods = mergeMods([profile.mods, artifactValue(art, ARTIFACT_LEVEL).passive])
  return {
    name: profile.name,
    icon: 'user',
    isPlayer: true,
    attack: gn(BASE.attack * profile.atkMult),
    defense: gn(BASE.defense * profile.defMult),
    maxHp: gn(BASE.maxHp * profile.hpMult),
    speed: 1 + (mods.speed ?? 0),
    mods,
    skills: [{ name: '流派杀招', mult: 1.7, rate: 0.25 }],
    artifacts: art ? [{ def: art, level: ARTIFACT_LEVEL }] : []
  }
}

export interface EnemyArchetype {
  id: string
  name: string
  snap: () => CombatantSnap
}

function foe(
  name: string,
  atk: number,
  def: number,
  hp: number,
  speed: number,
  skills: CombatantSnap['skills'],
  mods: StatMods = {}
): CombatantSnap {
  return {
    name,
    icon: 'skull',
    isPlayer: false,
    attack: gn(atk),
    defense: gn(def),
    maxHp: gn(hp),
    speed,
    mods,
    skills
  }
}

export const ENEMY_ARCHETYPES: EnemyArchetype[] = [
  { id: 'normal', name: '寻常', snap: () => foe('均衡妖兽', 125, 55, 1700, 1.0, [{ name: '撕咬', mult: 1.5, rate: 0.28 }]) },
  { id: 'elite', name: '精锐', snap: () => foe('精锐妖将', 150, 68, 2100, 1.05, [{ name: '妖将戟法', mult: 1.8, rate: 0.3 }]) },
  {
    id: 'boss',
    name: '首领',
    snap: () =>
      foe('区域之主', 150, 62, 2600, 1.05, [
        { name: '威压重击', mult: 2.1, rate: 0.3 },
        { name: '妖罡护体', mult: 1.3, rate: 0.1, effect: 'shield' }
      ])
  },
  {
    id: 'burst',
    name: '高爆发',
    snap: () => foe('裂魄凶兽', 205, 45, 950, 1.3, [{ name: '裂魄贯心击', mult: 2.7, rate: 0.45, effect: 'pierce' }])
  },
  {
    id: 'multi',
    name: '多段',
    snap: () => foe('千手魔猿', 118, 55, 1800, 1.1, [{ name: '千手连打', mult: 1.05, rate: 0.65, effect: 'multi' }])
  },
  {
    id: 'pierce',
    name: '真伤',
    snap: () => foe('蚀灵虫母', 140, 52, 1600, 1.0, [{ name: '蚀灵之刺', mult: 1.5, rate: 0.6, effect: 'pierce' }])
  },
  { id: 'dodge', name: '疾影', snap: () => foe('风魅', 155, 48, 1400, 1.5, [{ name: '风影袭', mult: 1.6, rate: 0.3 }], { dodgeRate: 0.5 }) }
]

/**
 * 万金油判据的「四墙」:首领/高爆发/真伤/疾影;四面通吃(各 ≥95%、首领 ≥90%)才算万金油。
 * 四处引用共用此数组,不手抄。
 */
export const WALL_IDS = ['boss', 'burst', 'pierce', 'dodge']

export interface MatchStats {
  winRate: number
  avgRounds: number
  avgHpLeft: number
}

export function runMatchup(profile: BuildProfile, archetype: EnemyArchetype, n = 80, seed = 1): MatchStats {
  const rng = new RandomService(mulberry32(seed))
  let wins = 0
  let rounds = 0
  let hpLeft = 0
  for (let i = 0; i < n; i += 1) {
    // 只取 .win / .rounds / .playerHpPct,不读战报
    const result = resolveCombat(buildSnap(profile), archetype.snap(), rng, undefined, false)
    if (result.win) wins += 1
    rounds += result.rounds
    hpLeft += result.playerHpPct
  }
  return { winRate: wins / n, avgRounds: rounds / n, avgHpLeft: hpLeft / n }
}

export interface MatrixRow {
  build: BuildProfile
  cells: Record<string, MatchStats>
  avgWinRate: number
}

export function fullMatrix(n = 80): MatrixRow[] {
  return BUILD_PROFILES.map((build, bi) => {
    const cells: Record<string, MatchStats> = {}
    let sum = 0
    for (const arch of ENEMY_ARCHETYPES) {
      const stats = runMatchup(build, arch, n, 1000 + bi * 97)
      cells[arch.id] = stats
      sum += stats.winRate
    }
    return { build, cells, avgWinRate: sum / ENEMY_ARCHETYPES.length }
  })
}

/**
 * 该流派在此境界能渡过哪几种劫型(期望值口径,无随机浮动)。
 * 走 tribulationDecision 共享内核,不自带天劫数学,否则审计结论与玩家实际渡劫对不上。
 */
export function tribulationSolvableKinds(profile: BuildProfile, targetMajor: number): TribulationKind[] {
  const snap = buildSnap(profile)
  return TRIBULATIONS.filter(def => traceTribulation(def, snap.mods, targetMajor).survived).map(def => def.id)
}

/** 按流派词条推演天劫存活;不指定 kind 取严格口径:五种劫型皆可渡 */
export function tribulationSurvives(profile: BuildProfile, targetMajor: number, kind?: TribulationKind): boolean {
  const snap = buildSnap(profile)
  if (kind) return traceTribulation(tribulationDef(kind), snap.mods, targetMajor).survived
  return TRIBULATIONS.every(def => traceTribulation(def, snap.mods, targetMajor).survived)
}
