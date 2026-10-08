/**
 * 突破服务 —— 成功率计算 / 天劫 / 结算
 */
import { mulberry32, rng } from '@/utils/random'
import { formatNum, formatPercent } from '@/utils/format'
import {
  breakthroughExpReason,
  breakthroughPeakReason,
  breakthroughQiReason
} from '@/ui/cultivationText'
import { realmDef, realmLabel, worldOf, isWorldEntry } from '@/data/realms'
import { BT_FAIL_EXP_LOSS, BT_QI_COST_RATIO } from '@/data/constants'
import { breakthroughBaseRate, clampRate } from './formulas'
import { modOf } from './statsCalc'
import { hasBreakExemption } from './heritageEffects'
import {
  rollTribulation,
  sustainScore,
  guardScore,
  waveDamage,
  tribulationWaves,
  currentTribulationRelief,
  currentStatGuard,
  NO_STAT_GUARD,
  type TribStatGuard
} from './tribulationDecision'
import { todayWeather } from './weather'
import { tribulationDef, TRIBULATIONS, type TribulationKind } from '@/data/tribulations'
import { NO_RELIEF, type TribulationRelief } from '@/data/linggenAffinity'
import { reliefFelt } from './linggenAffinity'
import { track, trackRealm, checkStateAchievements } from './progress'
import { recordMilestone } from './identity'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useCultivationStore } from '@/stores/cultivation'
import { useUiStore } from '@/stores/ui'
import type { BreakthroughView } from '@/stores/ui'
import type { StatMods } from '@/types'
import { playSfx } from './audio'
// Phase 28 突破准备:静坐/服丹的一次性加成(见 earlyGameService;仅无劫突破受益)
import { breakthroughPrepState, consumeBreakthroughPrep, type BreakthroughPrepView } from './earlyGameService'

/** 进阶成功率的一个构成项(展示用) */
export interface RatePart {
  label: string
  /** 加合值,以 1.0 = 100% 计 */
  value: number
}

export interface BreakthroughInfo {
  ready: boolean
  reason: string
  /** 修炼突破的基础成功率(未计天劫) */
  rate: number
  rateText: string
  /** 成功率的构成 —— 与 rate 同一批操作数,逐项可见(0 项已省略) */
  rateParts: RatePart[]
  qiCost: number
  isMajor: boolean
  needTribulation: boolean
  targetLabel: string
  /** 突破准备状态(就绪时 rate 已并入加成,见 AN 接线) */
  prep: BreakthroughPrepView
}

/** 蒙特卡洛采样次数:渡劫波次少(4~15),几千次也在毫秒级 */
const TRIB_SAMPLE = 4000

/**
 * 按玩家词条推演渡劫成功率(审计口径,非 UI 展示口径)。
 *
 * Phase 32.0 起,玩家看到的是"劫型 + 四维准备度 + 风险",不再是单一成功率数字;
 * 本函数只服务于平衡审计与回归测试。不传 kind 时取五种劫型的平均,
 * 代表"不挑天时的长期基线",不代表任何一次具体渡劫。
 *
 * 数学主干与实际结算 runTribulation 共用 tribulationDecision 的度量函数。
 */
export function tribulationSuccessRate(
  targetMajor: number,
  mods: StatMods,
  kind?: TribulationKind,
  relief: TribulationRelief = NO_RELIEF,
  /** 三维折算(防御→抗性 / 气血→水位);审计口径默认不传 = 只看词条,读数偏保守 */
  stat: TribStatGuard = NO_STAT_GUARD
): number {
  const kinds = kind ? [tribulationDef(kind)] : TRIBULATIONS
  const rand = mulberry32(0x5eed)
  const waves = tribulationWaves(targetMajor)
  let survived = 0
  let total = 0
  for (const def of kinds) {
    const regen = sustainScore(mods, def, relief)
    for (let s = 0; s < TRIB_SAMPLE; s += 1) {
      let hpLeft = 1 + guardScore(mods, def, relief) + stat.guard
      for (let w = 1; w <= waves; w += 1) {
        hpLeft =
          hpLeft - waveDamage(def, mods, targetMajor, w, hpLeft, relief, 1, stat) * (0.85 + rand() * 0.3) + regen
        if (hpLeft <= 0) break
      }
      if (hpLeft > 0) survived += 1
      total += 1
    }
  }
  return survived / total
}

export function breakthroughInfo(): BreakthroughInfo {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const isMajor = player.isMajorStep
  const nextMajor = isMajor ? player.major + 1 : player.major
  const nextSub = isMajor ? 0 : player.sub + 1
  /**
   * 大关皆劫 —— 这张表里不再有"无劫大关"。
   *
   * 从前境界数据上挂着一枚 `tribulation` 开关,真仙是唯一的 false(旧设计当它是
   * 飞升之赏)。那条例外让三件事说不清:进阶成功率的作用域、三个跨界入口
   * (真仙/神人/混沌真灵)的规矩不一样、"大关未必渡劫"这条规则玩家猜不到。
   * 现在只剩一条规则:小进阶掷点,大关渡劫 —— 想要无劫的路,得先有本事免劫。
   */
  const needTribulation = isMajor
  const qiCost = Math.floor(player.qiCapValue * BT_QI_COST_RATIO)
  const mods = player.finalStats.mods
  // Phase 28 突破准备:就绪的静坐/丹药加成并入展示率(消费在 attemptBreakthrough,一次性)
  const prep = breakthroughPrepState()
  // 4 项操作数先各自成行,再合出 rate —— 界面要解释「凭什么是这个数」,这里就得给得出明细
  const baseRate = breakthroughBaseRate(player.major, player.sub)
  const rateMod = modOf(mods, 'breakthroughRate')
  const luckPart = modOf(mods, 'luck') * 0.05
  const prepBonus = prep.ready ? prep.bonus : 0
  const rateParts: RatePart[] = [{ label: '基础', value: baseRate }]
  if (rateMod !== 0) rateParts.push({ label: '词条加成', value: rateMod })
  if (luckPart !== 0) rateParts.push({ label: '气运 (幸运×5%)', value: luckPart })
  if (prepBonus !== 0) rateParts.push({ label: prep.kind === 'meditate' ? '静坐调息' : '聚气丹', value: prepBonus })
  const rate = clampRate(baseRate + rateMod + luckPart + prepBonus)
  let ready = true
  let reason = ''
  if (player.atMaxRealm) {
    ready = false
    reason = breakthroughPeakReason()
  } else if (!player.expFull) {
    ready = false
    reason = breakthroughExpReason()
  } else if (resources.qi < qiCost) {
    ready = false
    reason = breakthroughQiReason(formatNum(qiCost))
  }
  return {
    ready,
    reason,
    rate,
    rateText: formatPercent(rate, 0),
    rateParts,
    qiCost,
    isMajor,
    needTribulation,
    targetLabel: realmLabel(nextMajor, nextSub),
    prep
  }
}

/** 模拟渡劫:返回(是否渡过, 战报)
 * Phase 32.1:与 tribulationDecision 共用度量函数,预览与结算不可能分叉
 * Phase 32.2:灵根解法通道同样经 currentTribulationRelief 取,与预览同源
 * 渡劫难度随天时:与预览 currentTribulationPlan 同一乘数(雷鸣日+8%) */
function runTribulation(targetMajor: number): { survived: boolean; log: string[] } {
  const player = usePlayerStore()
  const mods = player.finalStats.mods
  const waves = tribulationWaves(targetMajor)
  const kind = rollTribulation(targetMajor)
  const tDef = tribulationDef(kind)
  const relief = currentTribulationRelief(kind)
  const weatherMult = todayWeather().tribulationMult
  // 三维折算与预览同源(currentTribulationPlan 走同一个 helper):血厚防高者硬抗一部分
  const stat = currentStatGuard()
  const regen = sustainScore(mods, tDef, relief)
  let hpLeft = 1 + guardScore(mods, tDef, relief) + stat.guard
  const log: string[] = [`乌云压顶,${realmDef(targetMajor).name}劫将至——${tDef.name}之劫,共 ${waves} 道!`]
  if (reliefFelt(relief)) log.push('你体内灵根与此劫气机隐隐相应,自有一线生路。')
  for (let w = 1; w <= waves; w += 1) {
    hpLeft =
      hpLeft - waveDamage(tDef, mods, targetMajor, w, hpLeft, relief, weatherMult, stat) * rng.float(0.85, 1.15) + regen
    if (hpLeft <= 0) {
      log.push(`第 ${w} 道天雷轰然落下,你护体灵光崩碎,重伤坠地……`)
      return { survived: false, log }
    }
    const pct = Math.max(1, Math.round(hpLeft * 100))
    log.push(`第 ${w} 道天雷落下,你咬牙硬撼,气血余 ${Math.min(999, pct)}%。`)
  }
  log.push('雷云散尽,天光重开。你于劫灰中缓缓立起——渡劫,成了!')
  return { survived: true, log }
}

/** 尝试突破,返回展示数据(由 UI 弹窗呈现) */
export function attemptBreakthrough(): BreakthroughView | null {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const cultivation = useCultivationStore()
  const ui = useUiStore()
  const info = breakthroughInfo()
  if (!info.ready) {
    ui.toast(info.reason, 'warn')
    return null
  }
  const fromLabel = player.realmName
  resources.setQi(resources.qi - info.qiCost, player.qiCapValue)

  let success: boolean
  let tribulationLog: string[] = []
  if (info.needTribulation) {
    const result = runTribulation(player.major + 1)
    success = result.survived
    tribulationLog = result.log
    // 「渡过」才算渡过:失败不计数(否则连败三次自动解锁 a_trib3 劫后余生)
    if (success) track('tribulations')
  } else {
    // 无劫突破消费掉就绪的准备加成(info.rate 已并入,见 breakthroughInfo peek)
    consumeBreakthroughPrep()
    success = rng.chance(info.rate)
  }

  let view: BreakthroughView
  if (success) {
    player.advanceRealm()
    cultivation.clearNegativeBuffs()
    track('breakthroughs')
    trackRealm()
    checkStateAchievements()
    playSfx('breakthrough')
    const realm = player.realm
    // 跨界飞升:渡劫→真仙入仙界,大罗→神人入神界,神帝→混沌真灵入混沌海。
    // 这三步是全流程仅有的「换一片天」,给独立叙事与跨世节点(人间界入口不算)
    const crossedWorld = info.isMajor && player.major > 0 && isWorldEntry(player.major)
    const world = crossedWorld ? worldOf(player.major) : null
    if (world) recordMilestone(`first_${world.id}`)
    const baseMessage = `境界跃迁,天地翻覆。${realm.desc}。寿元增至 ${player.lifespanMax} 载。`
    // 大关进阶时附上这一境的出处(可解释性:境界名不是随手堆的字)
    const loreLine = `——「${realm.basis}」${realm.lore}`
    view = {
      success: true,
      fromLabel,
      toLabel: player.realmName,
      isMajor: info.isMajor,
      tribulationLog,
      message: !info.isMajor
        ? '灵台清明,经脉拓宽,修为更上一层。'
        : world
          ? `天地改换,山河重立。你踏入${world.name}——${world.desc}。${realm.desc},寿元增至 ${player.lifespanMax} 载。${loreLine}`
          : `${baseMessage}${loreLine}`
    }
  } else {
    // 渡劫跬步(宿命传承):本世唯一一次突破失败豁免 —— 不散修为(一次性容错,跨世不带)
    const exempted =
      hasBreakExemption(player.reincarnation.heritage) && player.consumeHeritageUse('dubu', 1)
    if (!exempted) {
      const mods = player.finalStats.mods
      const refund = Math.min(0.8, modOf(mods, 'breakRefund'))
      player.loseExpPct(BT_FAIL_EXP_LOSS * (1 - refund))
    }
    cultivation.addBuff('injury', Date.now())
    track('breakthroughFails')
    playSfx('fail')
    view = {
      success: false,
      fromLabel,
      toLabel: info.targetLabel,
      isMajor: info.isMajor,
      tribulationLog,
      message: info.needTribulation ? '天威难测,此番渡劫失利。所幸道基未毁,来日再战。' : '灵气逆冲,功亏一篑。你吐出一口淤血,盘膝疗伤。'
    }
  }
  ui.breakthrough = view
  return view
}
