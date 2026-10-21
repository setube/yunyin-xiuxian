import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { usePlayerStore } from '@/stores/player'
import {
  currentStatGuard,
  currentTribulationPlan,
  currentTribulationRelief,
  currentTribResist,
  guardScore,
  statFoldAt,
  sustainScore,
  tribReduction,
  tribLowHpReduction,
  tribulationWaveSpan,
  type TribulationPlan
} from '@/core/tribulationDecision'
import { reliefElements, rootElements } from '@/core/linggenAffinity'
import { todayWeather } from '@/core/weather'
import { weatherTribulationLine } from '@/ui/weatherText'

/**
 * 劫势评估的整本账 —— 修行页的摘要卡与劫势详情面板同读这一份。
 *
 * 两项界面只报一处数:天威区间乘今日 tribulationMult、恢复/护持走 sustainScore/guardScore、
 * 濒危减伤走 tribLowHpReduction,界膜判定读 statFoldAt。若摘要与详情各算一遍,
 * 迟早出现「卡上写着有护持、点开又说没有」。
 */
export function useTribulation(needTribulation: MaybeRefOrGetter<boolean>) {
  const player = usePlayerStore()

  /** 决意前的劫型配色:只在摘要卡上用,值域由 TribulationPlan 的 verdict 定 */
  const PLAN_COLOR: Record<TribulationPlan['verdict'], string> = {
    danger: 'text-cinnabar',
    hard: 'text-amber-ink',
    ok: 'text-azure',
    easy: 'text-jade'
  }

  const tribPlan = computed(() => (toValue(needTribulation) ? currentTribulationPlan() : null))

  /**
   * 这一劫是不是「界膜」那一关(人间→仙界 / 仙界→神界 / 神界→混沌海)。
   * 判据取自 tribulationDecision.statFoldAt(三维折算的折扣):界面与结算读同一个数。
   */
  const tribTargetMajor = computed(() => (player.isMajorStep ? player.major + 1 : player.major))
  const worldStep = computed(() => statFoldAt(tribTargetMajor.value) < 1)

  /**
   * 渡劫账上的四项实际读数。
   * 恢复与开劫护持走 sustainScore / guardScore:铁躯、逆流会把护盾与回血打折,
   * 不能把词条原值当成开劫水位。
   */
  const tribLedger = computed(() => {
    const mods = player.finalStats.mods
    const stat = currentStatGuard()
    const def = tribPlan.value?.def
    const relief = def ? currentTribulationRelief(def.id) : undefined
    // Same cap and same fold as waveDamage: reduction 0.6, resist 0.8, linggen reductionToResist.
    const reduction = tribReduction(mods)
    // 濒危减伤(背水/涅槃词条):结算在气血垂危时按同款封顶再削一波,账上得看得见
    const lowHpReduction = tribLowHpReduction(mods)
    return {
      resist: currentTribResist(mods, relief, stat),
      statResist: stat.resist,
      reduction,
      lowHpReduction,
      sustain: def ? sustainScore(mods, def, relief) : 0,
      guard: (def ? guardScore(mods, def, relief) : 0) + stat.guard,
      statGuard: stat.guard
    }
  })

  /**
   * 天威本身的长相(道数 + 单波区间):与结算同一批函数。
   * 必须乘入今日 tribulationMult —— 劫势 verdict 已经吃了天时,
   * 百分比若不乘,雷鸣日会看起来比真劫轻一截。
   */
  const tribWeather = computed(() => todayWeather())
  const tribWeatherLine = computed(() => weatherTribulationLine(tribWeather.value))
  const tribWave = computed(() =>
    tribPlan.value
      ? tribulationWaveSpan(tribPlan.value.def, tribTargetMajor.value, tribWeather.value.tribulationMult)
      : null
  )

  /** 与此劫气机相应的灵根:判据取自 tribulationRelief,界面说的与结算做的同源 */
  const reliefRoots = computed(() =>
    tribPlan.value ? reliefElements(rootElements(player.linggen?.roots), tribPlan.value.kind) : []
  )

  return { PLAN_COLOR, tribPlan, tribTargetMajor, worldStep, tribLedger, tribWeather, tribWeatherLine, tribWave, reliefRoots }
}
