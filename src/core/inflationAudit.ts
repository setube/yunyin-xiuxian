/**
 * 战力膨胀审计(Phase 32.8「天道膨胀审计」)
 *
 * 起因是玩家反馈:金丹后升级过快、炼虚即可推完全图、真仙入天界仍是一脚踹死。
 * 这三条症状指向同一件事——成长曲线与内容曲线脱节,而不是数值绝对值偏高。
 * 因此本模块只做度量,不改任何数值:先把膨胀来源量化出来,调整才有依据。
 *
 * 四项检测:
 *   1. realmLeapAudit       境界跨越倍率 vs 同期内容跨度
 *   2. contentCoverageAudit 各境界对全部区域的压制程度,定位内容死亡点
 *   3. powerSourceAudit     最终战力按乘区来源归因
 *   4. celestialCarryAudit  入天界时携带的构筑深度 vs 天界敌人
 *
 * 口径说明:装备与功法走真实生成/真实数据,故结论可直接对应线上体感;
 * 丹药、灵脉、建筑、称号、灵兽合并为「其他来源」参数化档位(见 otherSourceMods),
 * 这部分是估算,读数时按量级看而不是按小数点看。
 */
import type { EquipmentInstance, FinalStats, StatMods } from '@/types'
import { toNum } from '@/utils/gnum'
import { mulberry32, RandomService } from '@/utils/random'
import { COMBAT_ATK_BASE, COMBAT_DEF_BASE, COMBAT_HP_BASE } from '@/data/constants'
import { GONGFA } from '@/data/gongfa'
import { REGIONS } from '@/data/regions'
import { CELESTIAL_WORLDS } from '@/data/endgame'
import { MAX_MAJOR } from '@/data/realms'
import { enemyGearFactor, powerScale, powerScore, realmScale } from './formulas'
import { generateEquipment, resolveEquipStats } from './equipGen'
import { computeFinalStats, mergeMods } from './statsCalc'

/** 区域层级总数(与 regions.ts 同步) */
export const MAX_TIER = 20

/** 玩家同时佩戴的非法宝槽位 */
const WEAR_SLOTS = ['weapon', 'head', 'body', 'wrist', 'belt', 'boots', 'necklace', 'ring', 'talisman'] as const

// ---------------- 玩家成型度档位 ----------------

export interface GearProfile {
  id: string
  name: string
  /** 装备品质 rank 随大境界的斜率 */
  qualityPerMajor: number
  /** 强化等级随大境界的斜率 */
  levelPerMajor: number
  /** 「其他来源」百分比随大境界的斜率(丹药+灵脉+建筑+称号+灵兽合计) */
  otherPctPerMajor: number
}

export const GEAR_PROFILES: GearProfile[] = [
  { id: 'casual', name: '随缘', qualityPerMajor: 0.55, levelPerMajor: 0.6, otherPctPerMajor: 0.05 },
  { id: 'typical', name: '常规', qualityPerMajor: 0.85, levelPerMajor: 1.0, otherPctPerMajor: 0.09 },
  { id: 'optimized', name: '极限', qualityPerMajor: 1.15, levelPerMajor: 1.5, otherPctPerMajor: 0.15 }
]

export function gearProfile(id: string): GearProfile {
  return GEAR_PROFILES.find(p => p.id === id) ?? GEAR_PROFILES[1]!
}

/** 该大境界能进入的最高区域层级(即装备来源上限) */
export function maxTierForMajor(major: number): number {
  let best = 1
  for (const region of REGIONS) {
    if (region.minRealm <= major && region.tier > best) best = region.tier
  }
  return best
}

/** 该大境界可进入的全部区域层级 */
export function reachableTiers(major: number): number[] {
  return REGIONS.filter(r => r.minRealm <= major)
    .map(r => r.tier)
    .sort((a, b) => a - b)
}

/**
 * 「其他来源」的战斗百分比档位。
 * 丹药、灵脉、洞府建筑、称号、灵兽各自都有独立成长线,逐个建模成本过高且易失真,
 * 这里按大境界线性合并成一个档位——审计要看的是它占总战力的比重,不是它的精确值
 */
export function otherSourceMods(major: number, profile: GearProfile): StatMods {
  const pct = major * profile.otherPctPerMajor
  return { attackPct: pct, defensePct: pct * 0.8, maxHpPct: pct * 0.9 }
}

/** 该境界可修习的最高阶主修 + 辅修功法词条 */
export function gongfaModsAt(major: number): StatMods {
  const pick = (type: 'main' | 'sub'): StatMods => {
    const usable = GONGFA.filter(g => g.type === type && g.minRealm <= major)
    if (usable.length === 0) return {}
    // 取该境界可用的最高门槛功法,并按满级折算
    const best = usable.reduce((a, b) => (b.minRealm >= a.minRealm ? b : a))
    const out: StatMods = { ...best.baseMods }
    for (const k in best.perLevelMods) {
      const key = k as keyof StatMods
      out[key] = (out[key] ?? 0) + (best.perLevelMods[key] ?? 0) * best.maxLevel
    }
    return out
  }
  return mergeMods([pick('main'), pick('sub')])
}

export interface ModeledPlayer {
  major: number
  sub: number
  stats: FinalStats
  /** 各来源的独立快照,供归因用 */
  parts: {
    equipFlats: { attack: number; defense: number; maxHp: number }
    equipMods: StatMods
    gongfaMods: StatMods
    otherMods: StatMods
  }
}

/**
 * 构建某境界的典型玩家。
 * 装备走真实 generateEquipment + resolveEquipStats,固定种子保证审计可复现
 */
export function modelPlayer(major: number, sub: number, profile: GearProfile, seed = 20260904): ModeledPlayer {
  const tier = maxTierForMajor(major)
  const qualityRank = Math.max(0, Math.min(8, Math.round(major * profile.qualityPerMajor)))
  const level = Math.max(0, Math.min(10, Math.round(major * profile.levelPerMajor)))
  const rng = new RandomService(mulberry32(seed + major * 131 + sub * 17))

  const flats = { attack: 0, defense: 0, maxHp: 0 }
  const equipModList: StatMods[] = []
  for (const slot of WEAR_SLOTS) {
    const inst: EquipmentInstance = { ...generateEquipment(tier, rng, { slot, minQualityRank: qualityRank }), level }
    const resolved = resolveEquipStats(inst)
    flats.attack += toNum(resolved.flats.attack)
    flats.defense += toNum(resolved.flats.defense)
    flats.maxHp += toNum(resolved.flats.maxHp)
    equipModList.push(resolved.mods)
  }

  const equipMods = mergeMods(equipModList)
  const gongfaMods = gongfaModsAt(major)
  const otherMods = otherSourceMods(major, profile)
  const stats = computeFinalStats({
    major,
    sub,
    linggenMult: 1.6,
    modSources: [equipMods, gongfaMods, otherMods],
    equipFlats: { attack: { m: flats.attack, e: 0 }, defense: { m: flats.defense, e: 0 }, maxHp: { m: flats.maxHp, e: 0 } },
    daoFruit: 0,
    qiRich: true
  })

  return { major, sub, stats, parts: { equipFlats: flats, equipMods, gongfaMods, otherMods } }
}

/** 某层级敌人的战力评分(均衡模板口径,与 makeEnemySnap 同公式) */
export function enemyPowerAt(tier: number, danger = 1): number {
  const scale = powerScale(tier)
  const gear = enemyGearFactor(tier) * danger
  return toNum(
    powerScore(
      { m: toNum(scale) * COMBAT_ATK_BASE * gear, e: 0 },
      { m: toNum(scale) * COMBAT_DEF_BASE * gear, e: 0 },
      { m: toNum(scale) * COMBAT_HP_BASE * gear, e: 0 }
    )
  )
}

// ---------------- 1. 境界跨越检测 ----------------

export interface RealmLeapRow {
  fromMajor: number
  toMajor: number
  /** 旧境界圆满时的战力 */
  beforePower: number
  /** 新境界一层时的战力(含装备换代) */
  afterPower: number
  /** 玩家跨越倍率 */
  leapMult: number
  /** 同期内容跨度倍率(旧境界最高区域 → 新境界最高区域) */
  contentMult: number
  /** 脱节度:玩家跨越 ÷ 内容跨度,>1 表示这一跃跑在内容前面 */
  detach: number
}

export function realmLeapAudit(profile: GearProfile): RealmLeapRow[] {
  const rows: RealmLeapRow[] = []
  for (let m = 0; m < MAX_MAJOR; m += 1) {
    const before = toNum(modelPlayer(m, 9, profile).stats.power)
    const after = toNum(modelPlayer(m + 1, 0, profile).stats.power)
    const contentBefore = enemyPowerAt(maxTierForMajor(m))
    const contentAfter = enemyPowerAt(maxTierForMajor(m + 1))
    const leapMult = before > 0 ? after / before : 0
    const contentMult = contentBefore > 0 ? contentAfter / contentBefore : 1
    rows.push({
      fromMajor: m,
      toMajor: m + 1,
      beforePower: before,
      afterPower: after,
      leapMult,
      contentMult,
      detach: contentMult > 0 ? leapMult / contentMult : 0
    })
  }
  return rows
}

// ---------------- 2. 内容覆盖检测 ----------------

export interface CoverageRow {
  major: number
  /** 可进入区域数 */
  reachable: number
  /** 其中被压制(战力比 ≥ CRUSH_RATIO)的区域数 */
  crushed: number
  /** 压制比例 */
  crushRatio: number
  /** 对最高可进入区域的战力比 */
  topPowerRatio: number
}

/**
 * 压制判据取战力比而非胜率。
 * winChanceFromRatio 的返回值被 clamp 在 0.95,用「胜率≥95%」当判据会恒真——
 * 战力比 2 倍和 200 倍读数一样,分辨不出膨胀程度。
 * 战力比 3.0 对应裸胜率上限(0.95)且留有余量,超过即可视为内容失去威胁
 */
export const CRUSH_RATIO = 3.0

export function contentCoverageAudit(profile: GearProfile): CoverageRow[] {
  const rows: CoverageRow[] = []
  for (let m = 0; m <= MAX_MAJOR; m += 1) {
    // 站在该境界圆满口径:玩家在此境界停留的终局战力
    const power = toNum(modelPlayer(m, 9, profile).stats.power)
    const tiers = reachableTiers(m)
    let crushed = 0
    let topPowerRatio = 0
    const maxTier = tiers.length > 0 ? Math.max(...tiers) : 0
    for (const tier of tiers) {
      const ratio = power / enemyPowerAt(tier)
      if (ratio >= CRUSH_RATIO) crushed += 1
      if (tier === maxTier) topPowerRatio = ratio
    }
    rows.push({
      major: m,
      reachable: tiers.length,
      crushed,
      crushRatio: tiers.length > 0 ? crushed / tiers.length : 0,
      topPowerRatio
    })
  }
  return rows
}

/**
 * 内容死亡点:自此境界起、直到真仙都再未回到有威胁状态的最早境界;未出现返回 -1。
 *
 * 不能只找「首次全压制」——炼气只有 2 个区域,装备 tier 又与境界错配,
 * 早期偶发的 100% 压制会立刻触发,那是采样噪声不是内容死亡。
 * 真正的死亡点要求「此后再未恢复」:压制一旦不可逆,后续内容才是真的失去意义
 */
export function contentDeathMajor(rows: CoverageRow[]): number {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!
    if (row.reachable <= 0 || row.crushRatio < 1) continue
    if (rows.slice(i).every(r => r.reachable <= 0 || r.crushRatio >= 1)) return row.major
  }
  return -1
}

// ---------------- 3. 乘区来源审计 ----------------

export interface SourceRow {
  id: string
  name: string
  /** 剥离该来源后的战力跌幅,归一化为占比 */
  share: number
}

/**
 * 战力按乘区来源归因。
 * 做法是逐个来源置零重算,取跌幅后归一化——乘区之间存在交叉项,
 * 故这是近似归因(Shapley 的一阶简化),用于找「谁一家独大」而非精确分账
 */
export function powerSourceAudit(major: number, profile: GearProfile): SourceRow[] {
  const full = modelPlayer(major, 9, profile)
  const fullPower = toNum(full.stats.power)

  const withParts = (opts: { equipFlat?: boolean; equipMod?: boolean; gongfa?: boolean; other?: boolean; realm?: boolean }): number => {
    const flats = opts.equipFlat === false ? { attack: 0, defense: 0, maxHp: 0 } : full.parts.equipFlats
    const sources: StatMods[] = []
    if (opts.equipMod !== false) sources.push(full.parts.equipMods)
    if (opts.gongfa !== false) sources.push(full.parts.gongfaMods)
    if (opts.other !== false) sources.push(full.parts.otherMods)
    // 境界基础无法真正置零,以炼气一层为地板衡量其贡献
    const stats = computeFinalStats({
      major: opts.realm === false ? 0 : major,
      sub: opts.realm === false ? 0 : 9,
      linggenMult: 1.6,
      modSources: sources,
      equipFlats: { attack: { m: flats.attack, e: 0 }, defense: { m: flats.defense, e: 0 }, maxHp: { m: flats.maxHp, e: 0 } },
      daoFruit: 0,
      qiRich: true
    })
    return toNum(stats.power)
  }

  const drops = [
    { id: 'realm', name: '境界基础', drop: Math.max(0, fullPower - withParts({ realm: false })) },
    { id: 'equipFlat', name: '装备平铺', drop: Math.max(0, fullPower - withParts({ equipFlat: false })) },
    { id: 'equipMod', name: '装备词条', drop: Math.max(0, fullPower - withParts({ equipMod: false })) },
    { id: 'gongfa', name: '功法', drop: Math.max(0, fullPower - withParts({ gongfa: false })) },
    { id: 'other', name: '丹药灵脉等', drop: Math.max(0, fullPower - withParts({ other: false })) }
  ]
  const total = drops.reduce((s, d) => s + d.drop, 0)
  return drops.map(d => ({ id: d.id, name: d.name, share: total > 0 ? d.drop / total : 0 }))
}

// ---------------- 4. 天界携带审计 ----------------

/** 词条深度:所有正向词条的数值总和(基础三维百分比不计,那部分在天界已等比抵消) */
export function modDepth(mods: StatMods): number {
  let sum = 0
  for (const k in mods) {
    const key = k as keyof StatMods
    if (key === 'attackPct' || key === 'defensePct' || key === 'maxHpPct' || key === 'cultivationSpeed') continue
    const v = mods[key]
    if (typeof v === 'number' && v > 0) sum += v
  }
  return sum
}

export interface CelestialCarryRow {
  major: number
  /** 玩家携带的构筑深度 */
  playerDepth: number
  /** 天界敌人的平均构筑深度 */
  foeDepth: number
  /** 不对称倍数 */
  asymmetry: number
}

/**
 * 天界的基础三维按玩家等比缩放(worldFoeSnap),数值本身已互相抵消——
 * 真正决定胜负的是词条深度。这里量化玩家带进天界的词条总量与守关者的差距
 */
export function celestialCarryAudit(profile: GearProfile): CelestialCarryRow[] {
  const foeDepths: number[] = []
  for (const world of CELESTIAL_WORLDS) {
    for (const foe of world.foes) foeDepths.push(modDepth(foe.mods ?? {}))
    foeDepths.push(modDepth(world.guardian.mods ?? {}))
  }
  const foeDepth = foeDepths.length > 0 ? foeDepths.reduce((a, b) => a + b, 0) / foeDepths.length : 0

  const rows: CelestialCarryRow[] = []
  for (let m = 5; m <= MAX_MAJOR; m += 1) {
    const playerDepth = modDepth(modelPlayer(m, 9, profile).stats.mods)
    rows.push({ major: m, playerDepth, foeDepth, asymmetry: foeDepth > 0 ? playerDepth / foeDepth : Infinity })
  }
  return rows
}

// ---------------- 结构性不对称(常量层面的直接度量) ----------------

export interface GearAsymmetry {
  /** 玩家装备乘区从最低到最高的增长倍数 */
  playerGearGrowth: number
  /** 敌人装备补偿系数的增长倍数 */
  enemyGearGrowth: number
  /** 两者之比 */
  ratio: number
}

/**
 * 玩家与敌人「装备乘区」的增长速度对比。
 * 玩家:品质倍率 × (1 + 强化等级 × 每级加成);敌人:enemyGearFactor(tier)
 * 这两条线本应同速,一旦分叉,后期必然出现数值碾压
 */
export function gearAsymmetry(): GearAsymmetry {
  const playerLow = 1.0 * (1 + 0 * 0.12)
  const playerHigh = 9.5 * (1 + 10 * 0.12)
  const enemyLow = enemyGearFactor(1)
  const enemyHigh = enemyGearFactor(MAX_TIER)
  const playerGearGrowth = playerHigh / playerLow
  const enemyGearGrowth = enemyHigh / enemyLow
  return { playerGearGrowth, enemyGearGrowth, ratio: playerGearGrowth / enemyGearGrowth }
}

export { realmScale }
