/**
 * 天劫决策服务:劫型派生、准备度(护持/恢复/抗性/爆发)、风险识别、决策档(只给档位,不给指令)。
 * 词条只作单维解法,不直接堆成功率。
 *
 * 本文件的度量函数是天劫数学的唯一来源:UI 预览(buildTribulationPlan)与结算
 * (breakthrough.runTribulation)须调同一批函数;UI 算进星级的词条,结算须同样吃到,反之亦然。
 */
import type { StatMods } from '@/types'
import { modOf } from './statsCalc'
import { tribulationDef, TRIBULATIONS, type TribulationDef, type TribulationKind } from '@/data/tribulations'
import { NO_RELIEF, type TribulationRelief } from '@/data/linggenAffinity'
import { rootElements, tribulationRelief } from './linggenAffinity'
import { todayWeather } from './weather'
import {
  COMBAT_DEF_BASE,
  COMBAT_HP_BASE,
  TRIBULATION_BASE_WAVES,
  TRIBULATION_DIFFICULTY_CAP_MAJOR,
  TRIB_WORLD_STEP_STAT_FOLD,
  TRIB_DEF_RESIST_CAP,
  TRIB_DEF_RESIST_PER_SURPLUS,
  TRIB_HP_GUARD_CAP,
  TRIB_HP_GUARD_PER_SURPLUS,
  TRIB_REDUCTION_CAP,
  TRIB_RESIST_CAP,
  LOW_HP_THRESHOLD
} from '@/data/constants'
import { realmScale, tribulationWaveDamage } from './formulas'
import { isWorldEntry } from '@/data/realms'
import { mulberry32 } from '@/utils/random'
import { toNum } from '@/utils/gnum'
import { usePlayerStore } from '@/stores/player'

export interface TribulationPlan {
  kind: TribulationKind
  def: TribulationDef
  title: string
  desc: string
  /** 期望渡过率(0.25~0.95);仅作决策档输入,不对外显示为概率 */
  expectedRate: number
  /** 四维准备度 0~3(差/中/良/优) */
  prep: {
    guard: number   // 首轮护持
    sustain: number // 恢复
    resist: number  // 天劫抗性
    burst: number   // 爆发(应对短劫)
  }
  /** 风险点(人类可读) */
  risks: string[]
  verdict: 'danger' | 'hard' | 'ok' | 'easy'
}

const VERDICT_LABEL: Record<TribulationPlan['verdict'], string> = {
  danger: '高风险',
  hard: '中等',
  ok: '可渡',
  easy: '稳渡'
}

export function verdictLabel(v: TribulationPlan['verdict']): string {
  return VERDICT_LABEL[v]
}

/**
 * 天时 id → 稳定的小整数。
 *
 * 不能只取首字母:14 个天时里有三组首字母重合(`leiming`/`lingyu`、
 * `shenhui`/`shenwei`、`xianjie`/`xianyu`),那样两组天时会算出同一个种子,
 * 于是「按今日天时派生劫型」的设计意图落空 —— 换了个天时,劫型纹丝不动。
 *
 * 这里用 djb2 走完整串,再收到 32 位以内(种子只用来喂 mulberry32,不必很大)。
 */
export function weatherSeed(id: string): number {
  let h = 5381
  for (let i = 0; i < id.length; i += 1) h = ((h << 5) + h + id.charCodeAt(i)) | 0
  return h >>> 0
}

/** 派生本次劫型(境界 × 今日天时 → 确定性) */
export function rollTribulation(targetMajor: number): TribulationKind {
  const seed = targetMajor * 31 + (weatherSeed(todayWeather().id) % 509) * 7
  const rng = mulberry32(seed)
  const idx = Math.floor(rng() * TRIBULATIONS.length)
  return TRIBULATIONS[idx]!.id
}

// ---------- 共享度量 ----------

/** 三维折算:防御折出抗性、气血折出开劫水位;均为加法项,上限见 data/constants */
export interface TribStatGuard {
  resist: number
  guard: number
}

export const NO_STAT_GUARD: TribStatGuard = { resist: 0, guard: 0 }

/**
 * 三维折成天劫抗性与开劫水位。
 * 尺子是本境裸修为 realmScale × COMBAT_*_BASE(与 statsCalc.baseCombatStats 同源);
 * 裸修为及以下不折算,超出部分线性折算后封顶。
 */
export function statGuardOf(raw: { defense: number; maxHp: number; major: number; sub: number }): TribStatGuard {
  // toNum 在 e>308 返回 Infinity(坏档):显式返回全零,不靠 Math.min(CAP, …) 兜底
  const scale = toNum(realmScale(raw.major, raw.sub))
  if (!Number.isFinite(scale)) return NO_STAT_GUARD
  const bareDef = scale * COMBAT_DEF_BASE
  const bareHp = scale * COMBAT_HP_BASE
  // 比值在 (1,2) 时规整到 9 位,消除除法尾差(裸修为须得 0);大比值不走 toFixed(1e300 会造出几 KB 字符串)
  const surplus = (value: number, bare: number): number => {
    if (!Number.isFinite(value) || !(bare > 0)) return 0
    const ratio = value / bare
    const normalized = ratio > 1 && ratio < 2 ? Number((ratio - 1).toFixed(9)) : ratio - 1
    return Math.max(0, normalized)
  }
  const defSurplus = surplus(raw.defense, bareDef)
  const hpSurplus = surplus(raw.maxHp, bareHp)
  return {
    resist: Math.min(TRIB_DEF_RESIST_CAP, defSurplus * TRIB_DEF_RESIST_PER_SURPLUS),
    guard: Math.min(TRIB_HP_GUARD_CAP, hpSurplus * TRIB_HP_GUARD_PER_SURPLUS)
  }
}

/** 三维折算折扣:界内为 1;目标境界是界域第一境时取 TRIB_WORLD_STEP_STAT_FOLD(0 = 不认) */
export function statFoldAt(targetMajor: number): number {
  return isWorldEntry(targetMajor) ? TRIB_WORLD_STEP_STAT_FOLD : 1
}

/**
 * 当前玩家的三维折算(已乘折扣);预览(currentTribulationPlan)与结算(runTribulation)共用此入口。
 * 折扣只在此处乘,waveDamage / trace 不另乘,界面读数即结算所用。
 */
export function currentStatGuard(): TribStatGuard {
  const player = usePlayerStore()
  const raw = statGuardOf({
    defense: toNum(player.finalStats.defense),
    maxHp: toNum(player.finalStats.maxHp),
    major: player.major,
    sub: player.sub
  })
  const nextMajor = player.isMajorStep ? player.major + 1 : player.major
  const fold = statFoldAt(nextMajor)
  return { resist: raw.resist * fold, guard: raw.guard * fold }
}

export function tribulationWaves(targetMajor: number): number {
  return TRIBULATION_BASE_WAVES + Math.min(targetMajor, TRIBULATION_DIFFICULTY_CAP_MAJOR)
}

/** 准备度分档阈值(UI 与结算共用) */
export const PREP_THRESHOLDS = {
  guard: [0.08, 0.25, 0.4],
  sustain: [0.02, 0.04, 0.07],
  resist: [0.08, 0.2, 0.32],
  burst: [0.15, 0.35, 0.55]
} as const

export type PrepDimension = keyof typeof PREP_THRESHOLDS

/** 某一维的准备度星级 0~3(差/中/良/优) */
export function prepTier(dim: PrepDimension, value: number): number {
  const t = PREP_THRESHOLDS[dim]
  if (value >= t[2]) return 3
  if (value >= t[1]) return 2
  if (value >= t[0]) return 1
  return 0
}

/** 裂魂爆发削劫减免表,下标即 prep.burst 星级;结算按星级查表,不另设阈值 */
export const SOULREND_BURST_RELIEF = [0, 0.08, 0.18, 0.3] as const

/** 爆发度量(prep.burst 与结算共用) */
export function burstScore(mods: StatMods): number {
  return modOf(mods, 'critRate') + modOf(mods, 'damageBonus') * 0.5
}

/** 劫型折扣向 1 回拉;只回拉折扣(base<1),不放大加成(base>1) */
function easeDiscount(base: number, restore: number): number {
  return Math.max(base, base + (1 - base) * Math.min(1, Math.max(0, restore)))
}

/** 裂魂劫的有效爆发档:基础档为 0 时灵根不加档 */
export function effectiveBurstTier(mods: StatMods, relief: TribulationRelief = NO_RELIEF): number {
  const base = prepTier('burst', burstScore(mods))
  if (base <= 0) return 0
  return Math.min(3, base + relief.burstTierBonus)
}

/** 每波恢复量(prep.sustain 与结算共用) */
export function sustainScore(mods: StatMods, def: TribulationDef, relief: TribulationRelief = NO_RELIEF): number {
  return (modOf(mods, 'regenPerRound') + modOf(mods, 'lifesteal') * 0.3) * easeDiscount(def.healMult, relief.healRestore)
}

/** 起始护持水位(1 = 满血) */
export function guardScore(mods: StatMods, def: TribulationDef, relief: TribulationRelief = NO_RELIEF): number {
  return modOf(mods, 'shieldOnStart') * easeDiscount(def.shieldMult, relief.shieldRestore)
}

/** 天劫抗性度量(与结算 currentTribResist 同口径;减伤只按灵根亲和折入) */
export function resistScore(mods: StatMods, relief: TribulationRelief = NO_RELIEF): number {
  return modOf(mods, 'tribulationResist') + modOf(mods, 'damageReduction') * relief.reductionToResist
}

/**
 * 劫型波形:第 wave 波相对基础伤害的倍率(含 dmgMult)。
 * 灵根卸力不减总伤:削掉的起手伤害平摊回后续波次,总量守恒。
 */
export function waveMultiplier(def: TribulationDef, wave: number, waves: number, relief: TribulationRelief = NO_RELIEF): number {
  if (def.waveShape !== 'frontLoaded') return def.dmgMult
  // 重压:前两波加重、其后转缓,总量相近
  const FRONT = 2
  const cut = (1.7 - 1.0) * Math.min(1, Math.max(0, relief.frontLoadEase))
  if (wave <= FRONT) return def.dmgMult * (1.7 - cut)
  const spread = waves > FRONT ? (cut * FRONT) / (waves - FRONT) : 0
  return def.dmgMult * (0.8 + spread)
}

/** 某一劫的波形读数(供 UI 摊开):天威本身,不含免疫/减伤/护持/恢复 */
export function tribulationWaveSpan(
  def: TribulationDef,
  targetMajor: number,
  weatherMult = 1
): { waves: number; first: number; last: number; min: number; max: number; total: number; heaviestWave: number } {
  const waves = tribulationWaves(targetMajor)
  let first = 0
  let last = 0
  let min = Number.POSITIVE_INFINITY
  let max = 0
  let total = 0
  let heaviestWave = 1
  for (let w = 1; w <= waves; w += 1) {
    // weatherMult 与 waveDamage / runTribulation 同一乘数
    const v = tribulationWaveDamage(targetMajor, w, 0) * waveMultiplier(def, w, waves) * weatherMult
    if (w === 1) first = v
    if (w === waves) last = v
    min = Math.min(min, v)
    if (v > max) {
      max = v
      heaviestWave = w
    }
    total += v
  }
  return { waves, first, last, min, max, total, heaviestWave }
}

/** 天劫减伤(结算与 UI 台账共用) */
export function tribReduction(mods: StatMods): number {
  return Math.min(TRIB_REDUCTION_CAP, modOf(mods, 'damageReduction'))
}

/** 濒危减伤(背水/涅槃词条),结算与 UI 台账共用;封顶不得在调用侧另写 */
export function tribLowHpReduction(mods: StatMods): number {
  return Math.min(TRIB_REDUCTION_CAP, modOf(mods, 'lowHpReduction'))
}

/** 折算后天劫抗性:减伤按灵根亲和折入,与词条抗性同项同上限 */
export function currentTribResist(
  mods: StatMods,
  relief: TribulationRelief = NO_RELIEF,
  stat: TribStatGuard = NO_STAT_GUARD
): number {
  return Math.min(
    TRIB_RESIST_CAP,
    modOf(mods, 'tribulationResist') + tribReduction(mods) * relief.reductionToResist + stat.resist
  )
}

/** 单波实际伤害(占最大生命比例);UI 与结算共用 */
export function waveDamage(
  def: TribulationDef,
  mods: StatMods,
  targetMajor: number,
  wave: number,
  hpLeft: number,
  relief: TribulationRelief = NO_RELIEF,
  weatherMult = 1,
  stat: TribStatGuard = NO_STAT_GUARD
): number {
  const reduction = tribReduction(mods)
  const resist = currentTribResist(mods, relief, stat)
  const lowHpRed = tribLowHpReduction(mods)
  const waves = tribulationWaves(targetMajor)
  let dmg = tribulationWaveDamage(targetMajor, wave, resist) * (1 - reduction) * waveMultiplier(def, wave, waves, relief)
  if (def.id === 'soulrend') dmg *= 1 - SOULREND_BURST_RELIEF[effectiveBurstTier(mods, relief)]!
  if (hpLeft < LOW_HP_THRESHOLD) dmg *= 1 - lowHpRed
  // 天时乘数:预览与结算共用;审计基线不传,默认 1
  dmg *= weatherMult
  return dmg
}

export interface TribulationTrace {
  survived: boolean
  /** 终局水位(存活为正,失败为负) */
  hpLeft: number
  /** 全程最低水位(决策档以此为准) */
  minHp: number
  /** 阵亡波次(存活为 0) */
  fellAt: number
}

/** 期望值推演(无随机浮动);结算 runTribulation 在此之上叠加 ±15% 波动 */
export function traceTribulation(
  def: TribulationDef,
  mods: StatMods,
  targetMajor: number,
  relief: TribulationRelief = NO_RELIEF,
  weatherMult = 1,
  stat: TribStatGuard = NO_STAT_GUARD
): TribulationTrace {
  const waves = tribulationWaves(targetMajor)
  const regen = sustainScore(mods, def, relief)
  let hpLeft = 1 + guardScore(mods, def, relief) + stat.guard
  let minHp = hpLeft
  for (let w = 1; w <= waves; w += 1) {
    hpLeft = hpLeft - waveDamage(def, mods, targetMajor, w, hpLeft, relief, weatherMult, stat) + regen
    if (hpLeft < minHp) minHp = hpLeft
    if (hpLeft <= 0) return { survived: false, hpLeft, minHp, fellAt: w }
  }
  return { survived: true, hpLeft, minHp, fellAt: 0 }
}

/**
 * 坠劫者的决策档输入:以撑到第几道为主、跌破深度为辅(只看深度会让多扛一波反而降分)。
 * 撑得越久分越高,spec 钉:tribulationSpace.spec.ts。值域恒 < 0.45,坠劫必为 danger 档。
 */
function failedRate(trace: TribulationTrace, waves: number): number {
  const progress = trace.fellAt / (waves + 1)
  const shortfall = Math.max(0, 1 + trace.hpLeft) // 跌破深度的补数(hpLeft 为负)
  return Math.min(0.44, Math.max(0.25, 0.2 + progress * 0.18 + shortfall * 0.05))
}

/** 突破前的渡劫计划;kind 缺省按境界×天时派生,relief 缺省为无灵根基线 */
export function buildTribulationPlan(
  targetMajor: number,
  mods: StatMods,
  kindIn?: TribulationKind,
  relief: TribulationRelief = NO_RELIEF,
  weatherMult = 1,
  stat: TribStatGuard = NO_STAT_GUARD
): TribulationPlan {
  const kind = kindIn ?? rollTribulation(targetMajor)
  const def = tribulationDef(kind)

  // 星级须含结算吃到的全部项:护持含 stat.guard、抗性含 stat.resist、爆发用 effectiveBurstTier
  const prep = {
    guard: prepTier('guard', guardScore(mods, def, relief) + stat.guard),
    sustain: prepTier('sustain', sustainScore(mods, def, relief)),
    resist: prepTier('resist', resistScore(mods, relief) + stat.resist),
    burst: effectiveBurstTier(mods, relief)
  }

  // 决策档以全程最低水位为准,险过与稳过须分档
  const trace = traceTribulation(def, mods, targetMajor, relief, weatherMult, stat)
  const expectedRate = trace.survived
    ? Math.min(0.95, 0.55 + Math.min(1, trace.minHp / 0.45) * 0.4)
    : failedRate(trace, tribulationWaves(targetMajor))

  let verdict: TribulationPlan['verdict'] = 'ok'
  if (expectedRate < 0.45) verdict = 'danger'
  else if (expectedRate < 0.6) verdict = 'hard'
  else if (expectedRate < 0.8) verdict = 'ok'
  else verdict = 'easy'

  return {
    kind,
    def,
    title: `${def.name}之劫`,
    desc: def.desc,
    expectedRate,
    prep,
    risks: riskLines(def, prep, trace, relief),
    verdict
  }
}

/** 风险识别:灵根已解开的通道不报警 */
function riskLines(
  def: TribulationDef,
  prep: { guard: number; sustain: number; resist: number; burst: number },
  trace: TribulationTrace,
  relief: TribulationRelief = NO_RELIEF
): string[] {
  const risks: string[] = []
  // 劫型专属短板优先
  if (def.id === 'counterflow' && prep.sustain >= 1 && relief.healRestore <= 0) risks.push('逆流:恢复大减')
  if (def.id === 'thunder' && prep.guard >= 1 && relief.reductionToResist <= 0) risks.push('雷鸣:护持打折')
  if (def.id === 'ironbody' && prep.guard >= 2 && relief.shieldRestore <= 0) risks.push('铁躯:护盾几乎无效')
  if (def.id === 'heavyrush' && prep.guard <= 1 && relief.frontLoadEase <= 0) risks.push('重压:起手两击极重')
  if (def.id === 'soulrend' && prep.burst <= 1) risks.push('裂魂:爆发不足')
  // 通用短板
  if (prep.guard <= 1) risks.push('护持不足')
  if (prep.sustain <= 1) risks.push('恢复不足')
  if (prep.resist <= 1) risks.push('抗性不足')
  if (!trace.survived) risks.push(`推演第 ${trace.fellAt} 道不支`)
  if (risks.length === 0) risks.push('未见破绽')
  return risks.slice(0, 3)
}

/** 当前玩家灵根在此劫型下解开的通道;预览与结算(breakthrough.runTribulation)须经此入口取 relief */
export function currentTribulationRelief(kind: TribulationKind): TribulationRelief {
  const player = usePlayerStore()
  return tribulationRelief(rootElements(player.linggen?.roots), kind)
}

/** 供 UI:当前玩家(含天时、灵根)的渡劫计划;天时乘数与结算 runTribulation 同源 */
export function currentTribulationPlan(): TribulationPlan {
  const player = usePlayerStore()
  const nextMajor = player.isMajorStep ? player.major + 1 : player.major
  const kind = rollTribulation(nextMajor)
  return buildTribulationPlan(
    nextMajor,
    player.finalStats.mods,
    kind,
    currentTribulationRelief(kind),
    todayWeather().tribulationMult,
    currentStatGuard()
  )
}
