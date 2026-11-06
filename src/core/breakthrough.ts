/** 突破服务:成功率计算 / 天劫 / 结算 */
import { mulberry32, rng } from '@/utils/random'
import { formatNum, formatYears } from '@/utils/format'
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
import { worldLeap } from '@/ui/worldMark'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useCultivationStore } from '@/stores/cultivation'
import { useUiStore } from '@/stores/ui'
import type { BreakthroughView } from '@/stores/ui'
import type { StatMods } from '@/types'
import { playSfx } from './audio'
import { gameNow } from './enginePause'
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
  /** rate 的构成项,与 rate 同一批操作数;0 项省略 */
  rateParts: RatePart[]
  qiCost: number
  isMajor: boolean
  needTribulation: boolean
  targetLabel: string
  /** 突破准备状态;就绪时 rate 已并入加成(大关不食) */
  prep: BreakthroughPrepView
}

/** 蒙特卡洛采样次数;波次 4~15,几千次仍在毫秒级 */
const TRIB_SAMPLE = 4000

/**
 * 按玩家词条推演渡劫成功率:审计口径,只服务平衡审计与回归测试,不进 UI。
 * 不传 kind 时取五种劫型的平均。数学主干与 runTribulation 共用 tribulationDecision 的度量函数。
 */
export function tribulationSuccessRate(
  targetMajor: number,
  mods: StatMods,
  kind?: TribulationKind,
  relief: TribulationRelief = NO_RELIEF,
  /** 三维折算(防御→抗性 / 气血→水位);默认不传 = 只看词条,读数偏保守 */
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

export function breakthroughInfo(at: number = gameNow()): BreakthroughInfo {
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const isMajor = player.isMajorStep
  const nextMajor = isMajor ? player.major + 1 : player.major
  const nextSub = isMajor ? 0 : player.sub + 1
  /** 大关皆劫,跨界入口(真仙/神人/混沌真灵)不例外:小进阶掷点,大关渡劫 */
  const needTribulation = isMajor
  const qiCost = Math.floor(player.qiCapValue * BT_QI_COST_RATIO)
  const mods = player.finalStats.mods
  // 就绪的突破准备并入展示率;消费在 attemptBreakthrough,一次性
  const prep = breakthroughPrepState(at)
  // 4 项操作数先各自成行再合出 rate,供界面列明细
  const baseRate = breakthroughBaseRate(player.major, player.sub)
  const rateMod = modOf(mods, 'breakthroughRate')
  const luckPart = modOf(mods, 'luck') * 0.05
  // 大关成败走 runTribulation,不吃准备加成;须与消费端(仅无劫分支)同口径
  const prepBonus = !needTribulation && prep.ready ? prep.bonus : 0
  const rateParts: RatePart[] = [{ label: '基础', value: baseRate }]
  if (rateMod !== 0) rateParts.push({ label: '词条加成', value: rateMod })
  if (luckPart !== 0) rateParts.push({ label: '气运 ×5%', value: luckPart })
  if (prepBonus !== 0) rateParts.push({ label: prep.kind === 'meditate' ? '静坐调息' : '聚气丹', value: prepBonus })
  const rawRate = baseRate + rateMod + luckPart + prepBonus
  const rate = clampRate(rawRate)
  // 越过上下限的差额单列一行:各行相加正好是展示率
  if (Math.abs(rate - rawRate) > 1e-9) rateParts.push({ label: rate < rawRate ? '封顶' : '保底', value: rate - rawRate })
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
    rateParts,
    qiCost,
    isMajor,
    needTribulation,
    targetLabel: player.atMaxRealm ? breakthroughPeakReason() : realmLabel(nextMajor, nextSub),
    prep
  }
}

/**
 * 模拟渡劫:返回(是否渡过, 战报)。与预览同源:度量函数共用 tribulationDecision,
 * 灵根解法经 currentTribulationRelief,天时乘数与 currentTribulationPlan 相同(雷鸣日+8%)。
 */
function runTribulation(targetMajor: number): { survived: boolean; log: string[] } {
  const player = usePlayerStore()
  const mods = player.finalStats.mods
  const waves = tribulationWaves(targetMajor)
  const kind = rollTribulation(targetMajor)
  const tDef = tribulationDef(kind)
  const relief = currentTribulationRelief(kind)
  const weatherMult = todayWeather().tribulationMult
  // 三维折算与预览同源(currentTribulationPlan 走同一个 helper)
  const stat = currentStatGuard()
  const regen = sustainScore(mods, tDef, relief)
  let hpLeft = 1 + guardScore(mods, tDef, relief) + stat.guard
  const log: string[] = [`乌云压顶,${realmDef(targetMajor).name}劫将至。${tDef.name}之劫,共 ${waves} 道。`]
  if (reliefFelt(relief)) log.push('你体内灵根与此劫气机相应。')
  for (let w = 1; w <= waves; w += 1) {
    hpLeft =
      hpLeft - waveDamage(tDef, mods, targetMajor, w, hpLeft, relief, weatherMult, stat) * rng.float(0.85, 1.15) + regen
    if (hpLeft <= 0) {
      log.push(`第 ${w} 道天雷轰然落下,你护体灵光崩碎,重伤坠地。`)
      return { survived: false, log }
    }
    // 护持可使初值越过 1(1 + 护持 + 折算),结算照此走,但报数不能超过满值 ——
    // 「气血余 115%」是无意义读数,且会让同一场里的柱子与数字各说各话
    const pct = Math.min(100, Math.max(1, Math.round(hpLeft * 100)))
    log.push(`第 ${w} 道天雷落下,你咬牙硬撼,气血余 ${pct}%。`)
  }
  log.push('雷云散尽,你于劫灰中立起,渡劫已成。')
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
    // 失败不计数,否则连败三次即解锁 a_trib3
    if (success) track('tribulations')
  } else {
    // info.rate 已并入准备加成
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
    // 跨界飞升三步(入仙界/神界/混沌海)给独立叙事与跨世节点,人间界入口不算
    const crossedWorld = info.isMajor && player.major > 0 && isWorldEntry(player.major)
    const world = crossedWorld ? worldOf(player.major) : null
    // 跨界的那一跃:离开哪一界、进入哪一界、寿元翻几倍(只认跨界入口,不认同界域的大关)
    const leap = crossedWorld ? worldLeap(player.major) : undefined
    if (world) recordMilestone(`first_${world.id}`)
    const baseMessage = `${realm.desc}。寿元增至 ${formatYears(player.lifespanMax)}。`
    // 大关进阶附这一境的出处
    const loreLine = `——「${realm.basis}」${realm.lore}`
    view = {
      success: true,
      fromLabel,
      toLabel: player.realmName,
      isMajor: info.isMajor,
      tribulationLog,
      // 小进阶不附言:成败与境界去向弹窗已写明
      message: !info.isMajor
        ? ''
        : world
          ? `已入${world.name}。${world.desc}。${baseMessage}${loreLine}`
          : `${baseMessage}${loreLine}`,
      // 文本里那句「已入仙界」是文学;倍数才是分量,单独给弹窗画
      ...(leap ? { leap } : {})
    }
  } else {
    // 渡劫跬步(宿命传承):本世一次突破失败豁免,不散修为,跨世不带
    const exempted =
      hasBreakExemption(player.reincarnation.heritage) && player.consumeHeritageUse('dubu', 1)
    if (!exempted) {
      const mods = player.finalStats.mods
      const refund = Math.min(0.8, modOf(mods, 'breakRefund'))
      player.loseExpPct(BT_FAIL_EXP_LOSS * (1 - refund))
    }
    // 到期判定读游戏时钟(见 enginePause):写墙钟会在暂停恢复后多出一段
    cultivation.addBuff('injury', gameNow())
    track('breakthroughFails')
    playSfx('fail')
    view = {
      success: false,
      fromLabel,
      toLabel: info.targetLabel,
      isMajor: info.isMajor,
      tribulationLog,
      // 渡劫败局伤势已在劫报末行;小进阶无劫报,附一句状态
      message: info.needTribulation ? '' : '重伤'
    }
  }
  ui.breakthrough = view
  return view
}
