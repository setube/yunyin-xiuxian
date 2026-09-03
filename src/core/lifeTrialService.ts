/**
 * 逆旅契服务 —— 道果的第一个非效率出口
 *
 * 链路只有一条,刻意做到最小:
 *
 *   spendDaoFruit(cost)  余额真的下降
 *     → reincarnation.trial  这一世的契
 *     → lifeTrialRules()  注入本世历练战斗
 *     → 转世时写入 LifeRecord.trialId  成为履历
 *
 * ## 本模块刻意不做的事(这是判据,不是遗漏)
 *
 * 以下四种「回报」都被出口空间审计否掉,因此本文件**不得**出现:
 *   - player.addDaoFruit  自供能循环:道果生道果
 *   - player.addInsight   宿慧 → aptitudeFloorNow → growthMult → cultivationSpeed
 *   - 任何资源发放        灵石/丹药 → 强化 → 战力 → 历练更快
 *   - 任何 StatMods       直接落在效率链上
 *
 * 履历是唯一合格的回报:它不进任何计算。
 * `lifeTrialService.spec.ts` 会扫描本文件源码强制这四条。
 */
import type { CombatRules } from '@/types'
import { type LifeTrialDef, isPurelyAdverse, lifeTrialDef } from '@/data/lifeTrials'
export type { LifeTrialState } from '@/data/lifeTrials'
import { usePlayerStore } from '@/stores/player'
import { useUiStore } from '@/stores/ui'

/** 当前这一世的契;未签为 null */
export function activeLifeTrial(): LifeTrialDef | null {
  const t = usePlayerStore().reincarnation.trial
  return t ? (lifeTrialDef(t.trialId) ?? null) : null
}

/** 本世契约施加的战斗规则;未签约时为 undefined */
export function lifeTrialRules(): CombatRules | undefined {
  return activeLifeTrial()?.rules
}

/** 能否签下某契(余额足够、本世尚未签过、规则合法) */
export function canSignLifeTrial(id: string): boolean {
  const player = usePlayerStore()
  if (player.reincarnation.trial) return false
  const def = lifeTrialDef(id)
  if (!def) return false
  if (!isPurelyAdverse(def.rules)) return false
  return player.reincarnation.daoFruit >= def.cost
}

/**
 * 签下这一世的逆旅契。
 *
 * 一世只能签一份,签下不可解除 —— 可退款等于没花掉,
 * 出口就退回成「记一笔已花费」的假消费
 */
export function signLifeTrial(id: string): boolean {
  const player = usePlayerStore()
  const ui = useUiStore()
  const def = lifeTrialDef(id)
  if (!def) return false
  if (player.reincarnation.trial) {
    ui.toast('此生已有契在身', 'warn')
    return false
  }
  // 规则不合法则拒签:契约只许加难,这是硬约束
  if (!isPurelyAdverse(def.rules)) return false
  if (!player.spendDaoFruit(def.cost)) {
    ui.toast('道果不足', 'warn')
    return false
  }
  player.setLifeTrial({ trialId: def.id, at: Date.now(), paid: def.cost })
  ui.toast(`「${def.name}」既立,此生再无回头路`, 'rare')
  return true
}

/** 归档本世的契,供 LifeRecord 记录;随后由转世流程清空 */
export function archiveLifeTrial(): string | null {
  return usePlayerStore().reincarnation.trial?.trialId ?? null
}
