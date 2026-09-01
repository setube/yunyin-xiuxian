/**
 * 天劫决策服务(Phase 32.0)
 *
 * 从"堆成功率"变为"降低风险结构":
 *   - 劫型派生(境界 + 今日天时,确定性)
 *   - 准备度多维评估(首轮护持 / 恢复 / 抗性 / 爆发)
 *   - 风险识别(这套构筑面对此劫的短板)
 *   - 决策建议(给出信息,不给指令;保留"冲不冲")
 *
 * 词条→降级为工具(单一维度解法),不直接单点堆成功率。
 */
import type { StatMods } from '@/types'
import { modOf } from './statsCalc'
import { tribulationDef, TRIBULATIONS, type TribulationKind } from '@/data/tribulations'
import { todayWeather } from './weather'
import { TRIBULATION_BASE_WAVES } from '@/data/constants'
import { tribulationWaveDamage } from './formulas'
import { mulberry32 } from '@/utils/random'
import { usePlayerStore } from '@/stores/player'

export interface TribulationPlan {
  kind: TribulationKind
  def: ReturnType<typeof tribulationDef>
  /** 劫名 + 一句话 */
  title: string
  desc: string
  /** 期望渡过率(0.3~0.97;低阶裸装约五成) */
  expectedRate: number
  /** 五维准备度 0~3(差/中/良/优) */
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

/** 准备度 0~3(差分档) */
function tier(v: number, thresholds: [number, number, number]): number {
  if (v >= thresholds[2]) return 3
  if (v >= thresholds[1]) return 2
  if (v >= thresholds[0]) return 1
  return 0
}

/**
 * 生成突破前的渡劫计划(信息层,不替玩家决定)
 * kind 可注入(测试/固定劫型);默认按境界×天时派生
 */
export function buildTribulationPlan(targetMajor: number, mods: StatMods, kindIn?: TribulationKind): TribulationPlan {
  const kind = kindIn ?? rollTribulation(targetMajor)
  const def = tribulationDef(kind)

  // 五维准备度(词条 → 维度;均为"这道劫下如何"的解读)
  const guard = tier(modOf(mods, 'shieldOnStart') * def.shieldMult, [0.08, 0.25, 0.4])
  const sustain = tier(modOf(mods, 'regenPerRound') * def.healMult + modOf(mods, 'lifesteal') * 0.3, [0.02, 0.04, 0.07])
  const resist = tier(modOf(mods, 'tribulationResist') + (def.id === 'thunder' ? modOf(mods, 'damageReduction') * 0.5 : 0), [0.08, 0.2, 0.32])
  const burst = tier(modOf(mods, 'critRate') + modOf(mods, 'damageBonus') * 0.5, [0.15, 0.35, 0.55])

  // 期望渡过率:逐波推演(劫型修正),免蒙特卡洛(层数少确定性充足)
  const waves = TRIBULATION_BASE_WAVES + targetMajor
  const resistEff = Math.min(0.8, modOf(mods, 'tribulationResist'))
  const reduction = Math.min(0.6, modOf(mods, 'damageReduction'))
  const lowHpRed = Math.min(0.6, modOf(mods, 'lowHpReduction'))
  const regen = modOf(mods, 'regenPerRound') * def.healMult
  let hpLeft = 1 + modOf(mods, 'shieldOnStart') * def.shieldMult
  let surviving = true
  for (let w = 1; w <= waves; w += 1) {
    let dmg = tribulationWaveDamage(targetMajor, w, resistEff) * (1 - reduction) * def.dmgMult
    // 裂魂:较足爆发攻势(暴击+伤害）可略微消劫
    if (def.id === 'soulrend' && burst >= 2) dmg *= 0.92
    if (hpLeft < 0.3) dmg *= 1 - lowHpRed
    hpLeft = hpLeft - dmg + regen
    if (hpLeft <= 0) {
      surviving = false
      break
    }
  }

  // 期望率仅作"决策档"输入(信息不精确,给档不给数)
  const expectedRate = surviving ? Math.min(0.97, 0.5 + hpLeft * 0.12) : Math.max(0.3, hpLeft + 0.45)

  let verdict: TribulationPlan['verdict'] = 'ok'
  if (expectedRate < 0.45) verdict = 'danger'
  else if (expectedRate < 0.6) verdict = 'hard'
  else if (expectedRate < 0.8) verdict = 'ok'
  else verdict = 'easy'

  const advice = adviceFor(verdict)

  return {
    kind,
    def,
    title: `${def.name}之劫`,
    desc: def.desc,
    expectedRate,
    prep: { guard, sustain, resist, burst },
    risks: riskLines(def, { guard, sustain, resist, burst }),
    verdict,
    advice
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

/** 风险识别:哪个维度最弱,即"主要风险点" */
function riskLines(def: ReturnType<typeof tribulationDef>, prep: { guard: number; sustain: number; resist: number; burst: number }): string[] {
  const risks: string[] = []
  if (prep.guard <= 1) risks.push('首轮承伤压力较大(护持不足)')
  if (prep.sustain <= 1) risks.push('恢复能力一般(久战易被拖垮)')
  if (prep.resist <= 1) risks.push('此劫抗性不足(天罚直伤偏高)')
  if (def.id === 'counterflow') risks.push('逆流:治疗恢复大减')
  if (def.id === 'thunder' && prep.guard <= 2) risks.push('雷鸣:雷光破盾,护盾薄弱')
  if (def.id === 'soulrend' && prep.burst <= 1) risks.push('裂魂:爆发攻势被压制')
  if (risks.length === 0) risks.push('准备周全,未见明显破绽')
  return risks.slice(0, 3)
}

/** 供 UI:当前玩家(含天时)的渡劫计划 */
export function currentTribulationPlan(): TribulationPlan {
  const player = usePlayerStore()
  const nextMajor = player.isMajorStep ? player.major + 1 : player.major
  return buildTribulationPlan(nextMajor, player.finalStats.mods)
}
