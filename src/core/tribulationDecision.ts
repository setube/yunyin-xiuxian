/**
 * 天劫决策服务(Phase 32.0,32.1 口径统一)
 *
 * 从"堆成功率"变为"降低风险结构":
 *   - 劫型派生(境界 + 今日天时,确定性)
 *   - 准备度多维评估(首轮护持 / 恢复 / 抗性 / 爆发)
 *   - 风险识别(这套构筑面对此劫的短板)
 *   - 决策建议(给出信息,不给指令;保留"冲不冲")
 *
 * 词条→降级为工具(单一维度解法),不直接单点堆成功率。
 *
 * 口径纪律(32.1):本文件的度量函数是天劫数学的唯一来源。
 * UI 预览(buildTribulationPlan)与实际结算(breakthrough.runTribulation)
 * 必须调用同一批函数——凡是 UI 里算进星级的词条,结算里必须同样吃到,
 * 反之亦然。任何"前端显示一套、结算另一套"都属于欺骗玩家。
 */
import type { StatMods } from '@/types'
import { modOf } from './statsCalc'
import { tribulationDef, TRIBULATIONS, type TribulationDef, type TribulationKind } from '@/data/tribulations'
import { NO_RELIEF, type TribulationRelief } from '@/data/linggenAffinity'
import { rootElements, tribulationRelief } from './linggenAffinity'
import { todayWeather } from './weather'
import { TRIBULATION_BASE_WAVES } from '@/data/constants'
import { tribulationWaveDamage } from './formulas'
import { mulberry32 } from '@/utils/random'
import { usePlayerStore } from '@/stores/player'

export interface TribulationPlan {
  kind: TribulationKind
  def: TribulationDef
  /** 劫名 + 一句话 */
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
  /** 决策档:高风险 / 中等 / 可渡 / 稳渡 */
  verdict: 'danger' | 'hard' | 'ok' | 'easy'
  advice: string
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

/** 派生本次劫型(境界 × 今日天时 → 确定性) */
export function rollTribulation(targetMajor: number): TribulationKind {
  const seed = targetMajor * 31 + ((todayWeather().id.charCodeAt(0) - 96) * 7)
  const rng = mulberry32(seed)
  const idx = Math.floor(rng() * TRIBULATIONS.length)
  return TRIBULATIONS[idx]!.id
}

// ---------- 共享度量(UI 与结算的唯一口径) ----------

/** 天劫总波次 */
export function tribulationWaves(targetMajor: number): number {
  return TRIBULATION_BASE_WAVES + targetMajor
}

/** 准备度分档阈值:四维共用一张表,改这里 UI 与结算同时跟进 */
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

/**
 * 裂魂"爆发削劫"的减免表,下标即 prep.burst 星级。
 *
 * 用星级而非独立阈值查表,是为了让 UI 显示的那颗星就是结算读的那个数——
 * 一旦两边各用一条线(例如 UI 0.35 / 结算 0.40),中间就会出现
 * "看起来够、算起来不够"的欺骗区间。
 */
export const SOULREND_BURST_RELIEF = [0, 0.08, 0.18, 0.3] as const

/** 爆发度量(prep.burst 与结算共用) */
export function burstScore(mods: StatMods): number {
  return modOf(mods, 'critRate') + modOf(mods, 'damageBonus') * 0.5
}

/**
 * 劫型折扣的回拉:向常态(1)靠拢多少。
 *
 * 只回拉"折扣"(base<1),不放大"加成"(base>1)——
 * 灵根解开的是这道劫特意关掉的那扇门,不是普涨。
 */
function easeDiscount(base: number, restore: number): number {
  return Math.max(base, base + (1 - base) * Math.min(1, Math.max(0, restore)))
}

/**
 * 裂魂劫的有效爆发档。
 *
 * 灵根只能把"已经有的攻势"再推一档,推不动零:
 * 无爆发词条者拿不到任何减免。这条是放大你的选择,不是白送减伤。
 */
export function effectiveBurstTier(mods: StatMods, relief: TribulationRelief = NO_RELIEF): number {
  const base = prepTier('burst', burstScore(mods))
  if (base <= 0) return 0
  return Math.min(3, base + relief.burstTierBonus)
}

/** 每波恢复量(prep.sustain 与结算共用;吸血按三成折算为持续恢复) */
export function sustainScore(mods: StatMods, def: TribulationDef, relief: TribulationRelief = NO_RELIEF): number {
  return (modOf(mods, 'regenPerRound') + modOf(mods, 'lifesteal') * 0.3) * easeDiscount(def.healMult, relief.healRestore)
}

/** 起始护持水位(1 = 满血;护盾按劫型倍率折算) */
export function guardScore(mods: StatMods, def: TribulationDef, relief: TribulationRelief = NO_RELIEF): number {
  return modOf(mods, 'shieldOnStart') * easeDiscount(def.shieldMult, relief.shieldRestore)
}

/** 减伤可折算为天劫抗性的比例(雷鸣劫本有五成;同源灵根再添几分) */
function reductionToResistRate(def: TribulationDef, relief: TribulationRelief): number {
  return (def.id === 'thunder' ? 0.5 : 0) + relief.reductionToResist
}

/** 天劫抗性度量(雷鸣劫下减伤也能顶一部分抗性缺口) */
export function resistScore(mods: StatMods, def: TribulationDef, relief: TribulationRelief = NO_RELIEF): number {
  return modOf(mods, 'tribulationResist') + modOf(mods, 'damageReduction') * reductionToResistRate(def, relief)
}

/**
 * 劫型波形:第 wave 波相对基础伤害的倍率(含 dmgMult)。
 *
 * 灵根的"卸力"不做减伤——削掉的起手伤害要平摊回后续波次,总量守恒。
 * 它改变的是"这道劫要求你怎么活下来":
 * 从"首轮必须扛住爆发"变为"可以靠续航磨过去"。
 */
export function waveMultiplier(def: TribulationDef, wave: number, waves: number, relief: TribulationRelief = NO_RELIEF): number {
  if (def.waveShape !== 'frontLoaded') return def.dmgMult
  // 重压:起手两击雷霆万钧,其后转缓——总量相近,但把压力全压在开局
  const FRONT = 2
  const cut = (1.7 - 1.0) * Math.min(1, Math.max(0, relief.frontLoadEase))
  if (wave <= FRONT) return def.dmgMult * (1.7 - cut)
  const spread = waves > FRONT ? (cut * FRONT) / (waves - FRONT) : 0
  return def.dmgMult * (0.8 + spread)
}

/** 单波实际伤害(占最大生命比例);UI 与结算共用 */
export function waveDamage(
  def: TribulationDef,
  mods: StatMods,
  targetMajor: number,
  wave: number,
  hpLeft: number,
  relief: TribulationRelief = NO_RELIEF
): number {
  const reduction = Math.min(0.6, modOf(mods, 'damageReduction'))
  // 厚土分担天罚:减伤按灵根亲和折算一部分为天劫抗性(无减伤者折算为零)
  const resist = Math.min(0.8, modOf(mods, 'tribulationResist') + reduction * relief.reductionToResist)
  const lowHpRed = Math.min(0.6, modOf(mods, 'lowHpReduction'))
  const waves = tribulationWaves(targetMajor)
  let dmg = tribulationWaveDamage(targetMajor, wave, resist) * (1 - reduction) * waveMultiplier(def, wave, waves, relief)
  // 裂魂:攻势足者可硬生生削去几分劫威(减免按 prep.burst 星级查表,UI 星级即结算输入)
  if (def.id === 'soulrend') dmg *= 1 - SOULREND_BURST_RELIEF[effectiveBurstTier(mods, relief)]!
  // 濒危减伤(背水路数)在气血垂危时同样护持渡劫
  if (hpLeft < 0.3) dmg *= 1 - lowHpRed
  return dmg
}

export interface TribulationTrace {
  survived: boolean
  /** 终局水位(存活为正,失败为负) */
  hpLeft: number
  /** 全程最低水位——险过与稳过的分界,决策档以此为准 */
  minHp: number
  /** 阵亡波次(存活为 0) */
  fellAt: number
}

/**
 * 期望值推演(无随机浮动)。
 * 结算 runTribulation 在此之上叠加 ±15% 波动,数学主干完全一致。
 */
export function traceTribulation(
  def: TribulationDef,
  mods: StatMods,
  targetMajor: number,
  relief: TribulationRelief = NO_RELIEF
): TribulationTrace {
  const waves = tribulationWaves(targetMajor)
  const regen = sustainScore(mods, def, relief)
  let hpLeft = 1 + guardScore(mods, def, relief)
  let minHp = hpLeft
  for (let w = 1; w <= waves; w += 1) {
    hpLeft = hpLeft - waveDamage(def, mods, targetMajor, w, hpLeft, relief) + regen
    if (hpLeft < minHp) minHp = hpLeft
    if (hpLeft <= 0) return { survived: false, hpLeft, minHp, fellAt: w }
  }
  return { survived: true, hpLeft, minHp, fellAt: 0 }
}

/**
 * 坠劫者的决策档输入。
 *
 * 关键:必须以"撑到第几道雷"为主、"最后差多少"为辅。
 * 若只看终局跌破深度,会得出荒谬结论——补强之后多扛了一波,
 * 而那一波伤害更重、跌得更深,评分反而下降(星级越高越"差")。
 * 撑得更久永远是更好的结果,这条单调性由 tribulationSpace.spec.ts 把守。
 *
 * 值域恒 < 0.45,即坠劫必为 danger 档:死就是死,差多远由风险行说明。
 */
function failedRate(trace: TribulationTrace, waves: number): number {
  const progress = trace.fellAt / (waves + 1)
  const shortfall = Math.max(0, 1 + trace.hpLeft) // 跌破深度的补数(hpLeft 为负)
  return Math.min(0.44, Math.max(0.25, 0.2 + progress * 0.18 + shortfall * 0.05))
}

/**
 * 生成突破前的渡劫计划(信息层,不替玩家决定)
 * kind 可注入(测试/固定劫型);默认按境界×天时派生
 * relief 为灵根解法通道;缺省即"无灵根之利"的基线
 */
export function buildTribulationPlan(
  targetMajor: number,
  mods: StatMods,
  kindIn?: TribulationKind,
  relief: TribulationRelief = NO_RELIEF
): TribulationPlan {
  const kind = kindIn ?? rollTribulation(targetMajor)
  const def = tribulationDef(kind)

  // 四维准备度(词条 → 维度;均为"这道劫下如何"的解读)
  const prep = {
    guard: prepTier('guard', guardScore(mods, def, relief)),
    sustain: prepTier('sustain', sustainScore(mods, def, relief)),
    resist: prepTier('resist', resistScore(mods, def, relief)),
    burst: prepTier('burst', burstScore(mods))
  }

  // 决策档以"全程最低水位"为准:险过与稳过必须分得开,
  // 否则所有幸存者都挤在同一档,玩家只能靠堆满四维来跨线。
  const trace = traceTribulation(def, mods, targetMajor, relief)
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
    verdict,
    advice: adviceFor(verdict)
  }
}

/** 建议档:只给方向,不替玩家决定(建议按档位给,信息已由风险行承载) */
function adviceFor(verdict: TribulationPlan['verdict']): string {
  switch (verdict) {
    case 'danger':
      return '凶多吉少。可先练恢复/护持,或等待更顺的天时;若决意一试,备好丹药。'
    case 'hard':
      return '尚有一线。补一补最弱的一维(见主要风险),此劫可渡。'
    case 'ok':
      return '此劫对你不算难。若求稳,可待灵雨/清和天;若寻刺激,现在便可一试。'
    case 'easy':
      return '稳渡在望。若非雷鸣破盾之流,尽可放心引劫。'
  }
}

/**
 * 风险识别:哪个维度最弱,即"主要风险点"
 *
 * 灵根已解开的那条通道不再报警——若仍照报,玩家会去补一个
 * 自己天生就不缺的短板,那等于把"牌面"变成了噪音。
 */
function riskLines(
  def: TribulationDef,
  prep: { guard: number; sustain: number; resist: number; burst: number },
  trace: TribulationTrace,
  relief: TribulationRelief = NO_RELIEF
): string[] {
  const risks: string[] = []
  // 劫型专属短板优先:它才是"今天这一劫"的信息
  if (def.id === 'counterflow' && prep.sustain >= 1 && relief.healRestore <= 0) risks.push('逆流:治疗恢复大减,恢复流在此劫失效')
  if (def.id === 'thunder' && prep.guard >= 1 && relief.reductionToResist <= 0) risks.push('雷鸣:雷光破盾,护持打折')
  if (def.id === 'ironbody' && prep.guard >= 2 && relief.shieldRestore <= 0) risks.push('铁躯:钝压碾盾,护体灵光几乎无用')
  if (def.id === 'heavyrush' && prep.guard <= 1 && relief.frontLoadEase <= 0) risks.push('重压:起手两击极重,首轮护持不足恐当场坠劫')
  if (def.id === 'soulrend' && prep.burst <= 1) risks.push('裂魂:攻势不足,削不动劫威')
  // 通用短板
  if (prep.guard <= 1) risks.push('首轮承伤压力较大(护持不足)')
  if (prep.sustain <= 1) risks.push('恢复能力一般(久战易被拖垮)')
  if (prep.resist <= 1) risks.push('此劫抗性不足(天罚直伤偏高)')
  if (!trace.survived) risks.push(`推演于第 ${trace.fellAt} 道天雷不支`)
  if (risks.length === 0) risks.push('准备周全,未见明显破绽')
  return risks.slice(0, 3)
}

/**
 * 当前玩家灵根在此劫型下解开的通道。
 *
 * 预览(currentTribulationPlan)与结算(breakthrough.runTribulation)
 * 都必须经这一个入口取 relief——否则又会出现"看的一套、算的一套"。
 */
export function currentTribulationRelief(kind: TribulationKind): TribulationRelief {
  const player = usePlayerStore()
  return tribulationRelief(rootElements(player.linggen?.roots), kind)
}

/** 供 UI:当前玩家(含天时、灵根)的渡劫计划 */
export function currentTribulationPlan(): TribulationPlan {
  const player = usePlayerStore()
  const nextMajor = player.isMajorStep ? player.major + 1 : player.major
  const kind = rollTribulation(nextMajor)
  return buildTribulationPlan(nextMajor, player.finalStats.mods, kind, currentTribulationRelief(kind))
}
