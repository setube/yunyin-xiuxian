/**
 * 词条转移面板状态:选词条 → 选目标 → 选位置 → 二步确认。判据与价签归 core/affixTransfer,本文件不算价、不判合法。
 * 返回 reactive 整体:正文(AffixTransferPanel)与页脚(AffixTransferFooter)共用,由详情弹窗创建一次、整体当 prop 传下去;
 * 子组件只读字段、只调方法(vue/no-mutating-props)。
 */
import { computed, reactive, toRefs, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { EquipmentInstance } from '@/types'
import { qualityDef } from '@/data/qualities'
import { equipmentTemplate } from '@/data/equipment'
import { resolveEquipStats, type ResolvedEquipStats } from '@/core/equipGen'
import {
  planTransfer,
  targetBlock,
  transferAffix,
  transferCandidates,
  transferLandings,
  transferShort,
  transferShortfall,
  type TransferCheck,
  type TransferLanding
} from '@/core/affixTransfer'
import { useInventoryStore } from '@/stores/inventory'
import {
  TRANSFER_LABELS,
  transferAffixText,
  transferBlockText,
  transferDeltaText,
  transferShortText
} from '@/ui/affixTransferText'
import { formatGap } from '@/utils/format'

/** 目标件上的一条词条展示行(landings 直接带上,模板不再逐处 find) */
type AffixLine = ResolvedEquipStats['affixLines'][number]

/** 候选目标默认列几件;其余由「全部 N 件」展开 */
const PREVIEW_LIMIT = 8
/** 进出确认态后这段时间内的点按不作数,防连点跳过确认 */
const CONFIRM_GUARD_MS = 400

interface FlowState {
  affixId: string | null
  targetUid: string | null
  /** undefined = 未选;null = 新增 */
  replaceId: string | null | undefined
  sealWanted: boolean
  showAll: boolean
  /** 按下第一步时的计划键;计划任一项变了,确认即作废 */
  armedKey: string | null
}

function initialState(): FlowState {
  return { affixId: null, targetUid: null, replaceId: undefined, sealWanted: true, showAll: false, armedKey: null }
}

/** 默认落位:唯一可选就选它,否则可新增就新增,否则不替玩家选 */
function preselect(landings: readonly TransferLanding[]): string | null | undefined {
  const ok = landings.filter(l => l.check.ok)
  if (ok.length === 1) return ok[0]!.replaceId
  if (ok.some(l => l.replaceId === null)) return null
  return undefined
}

export function useAffixTransfer(sourceUid: MaybeRefOrGetter<string | null>) {
  const inventory = useInventoryStore()
  const state = reactive<FlowState>(initialState())

  const source = computed<EquipmentInstance | undefined>(() => {
    const uid = toValue(sourceUid)
    return uid ? inventory.findItem(uid) : undefined
  })
  const target = computed<EquipmentInstance | undefined>(() => (state.targetUid ? inventory.findItem(state.targetUid) : undefined))
  const sourceWorn = computed(() => source.value !== undefined && inventory.equippedUids.has(source.value.uid))
  const sourceLines = computed(() => (source.value ? resolveEquipStats(source.value).affixLines : []))
  const sourceSealed = computed(() => new Set(source.value?.sealedAffixIds ?? []))

  const candidates = computed(() => (source.value && state.affixId ? transferCandidates(source.value, state.affixId) : []))
  const shownCandidates = computed(() => (state.showAll ? candidates.value : candidates.value.slice(0, PREVIEW_LIMIT)))
  const hiddenCount = computed(() => candidates.value.length - shownCandidates.value.length)
  const targetName = computed(() => (target.value ? (equipmentTemplate(target.value.templateId)?.name ?? '') : ''))
  const targetCap = computed(() => (target.value ? qualityDef(target.value.quality).affixes[1] : 0))
  const targetLines = computed(() => (target.value ? resolveEquipStats(target.value).affixLines : []))
  const targetSealed = computed(() => new Set(target.value?.sealedAffixIds ?? []))

  /**
   * 落位行 + 该落位对应目标件上那一行的形制。
   *
   * 模板里原先逐处调 `targetLine(l.replaceId)` —— 同一颗钮里 5 次、每行都重算,
   * 而它只是 `targetLines.find(...)`。与 TrialPanel 的 pactRows / MarksPanel 的 markRows 同法:
   * 纯查表在 setup 里算一次,模板只读字段。
   */
  const landings = computed<(TransferLanding & { target?: AffixLine })[]>(() => {
    if (!source.value || !target.value || !state.affixId) return []
    const lines = targetLines.value
    return transferLandings(source.value, target.value, state.affixId).map(l => ({
      ...l,
      target: l.replaceId === null ? undefined : lines.find(x => x.id === l.replaceId)
    }))
  })

  /** 不封存口径的计划;落位未选完为 null */
  const basePlan = computed<TransferCheck | null>(() => {
    if (!source.value || !target.value || !state.affixId || state.replaceId === undefined) return null
    return planTransfer(source.value, target.value, state.affixId, state.replaceId, false)
  })
  /** 付费同时封存口径的计划:沿用封存、或已封满时为 null */
  const sealedPlan = computed<TransferCheck | null>(() => {
    const base = basePlan.value
    if (!base?.ok || base.plan.sealMode === 'inherit' || !base.plan.canSeal) return null
    return planTransfer(source.value!, target.value!, state.affixId!, state.replaceId!, true)
  })
  /** 实际执行的计划 */
  const check = computed<TransferCheck | null>(() => (state.sealWanted && sealedPlan.value ? sealedPlan.value : basePlan.value))
  const plan = computed(() => (check.value?.ok ? check.value.plan : null))
  /** 同时封存的费用;不勾也给出 */
  const sealFee = computed(() => (sealedPlan.value?.ok ? sealedPlan.value.plan.cost.sealStone : null))
  const short = computed(() => (plan.value ? transferShort(plan.value.cost) : null))
  /** 两样各差多少;主按钮「尚差 N」与服务拒因同读这一处 */
  const shortfall = computed(() => (plan.value ? transferShortfall(plan.value.cost) : null))

  /** 主按钮上的字:还差哪一步、被什么挡住或缺哪样;null = 可转 */
  const blockLabel = computed<string | null>(() => {
    if (sourceLines.value.length === 0) return TRANSFER_LABELS.noAffix
    if (!state.affixId) return TRANSFER_LABELS.pendingAffix
    if (!state.targetUid) return TRANSFER_LABELS.pendingTarget
    if (!source.value || !target.value) return TRANSFER_LABELS.gone
    if (state.replaceId === undefined) return TRANSFER_LABELS.pendingSlot
    const c = check.value
    if (!c) return TRANSFER_LABELS.gone
    if (!c.ok) return transferBlockText(c.block, state.affixId)
    if (short.value && shortfall.value) {
      return transferShortText(short.value, {
        stone: formatGap(shortfall.value.stone),
        dust: shortfall.value.dust
      })
    }
    return null
  })

  const planKey = computed(() =>
    [toValue(sourceUid), state.targetUid, state.affixId, String(state.replaceId), plan.value?.sealMode ?? ''].join('|')
  )
  /** 确认态:计划没变且此刻仍可转;资源被别处花掉时自动退回 */
  const armed = computed(() => state.armedKey !== null && state.armedKey === planKey.value && blockLabel.value === null)

  const resultLines = computed(() => (plan.value ? resolveEquipStats(plan.value.target).affixLines : []))
  const resultSealed = computed(() => new Set(plan.value?.target.sealedAffixIds ?? []))
  const deltaText = computed(() =>
    plan.value && target.value ? transferDeltaText(resolveEquipStats(target.value).mods, resolveEquipStats(plan.value.target).mods) : ''
  )
  const movedText = computed(() => (plan.value ? transferAffixText(plan.value.moved) : ''))
  const replacedText = computed(() => (plan.value?.replaced ? transferAffixText(plan.value.replaced) : ''))

  /** 进出确认态的时刻;「转 移」/「确认转移」、「取消」/「返回」在页脚同一位置 */
  let switchedAt = -Infinity

  function settling(): boolean {
    return Date.now() - switchedAt < CONFIRM_GUARD_MS
  }

  function disarm(): void {
    if (state.armedKey !== null) switchedAt = Date.now()
    state.armedKey = null
  }

  function pickAffix(id: string | null): void {
    // 再点已选的那条不算改选,否则手选落位会被改回默认
    if (id === state.affixId) return
    state.affixId = id
    state.showAll = false
    if (id && source.value && target.value && targetBlock(source.value, target.value, id) !== null) state.targetUid = null
    if (!id) state.targetUid = null
    state.replaceId = preselect(landings.value)
    disarm()
  }

  function pickTarget(uid: string | null): void {
    if (uid === state.targetUid) return
    state.targetUid = uid
    state.replaceId = preselect(landings.value)
    disarm()
  }

  function pickSlot(replaceId: string | null): void {
    state.replaceId = replaceId
    disarm()
  }

  function toggleSeal(): void {
    state.sealWanted = !state.sealWanted
    disarm()
  }

  function expandAll(): void {
    state.showAll = true
  }

  function arm(): void {
    if (blockLabel.value !== null) return
    state.armedKey = planKey.value
    switchedAt = Date.now()
  }

  /** 二步确认的第二步;成功后留在转移模式,目标保持选中 */
  function confirm(): boolean {
    const uid = toValue(sourceUid)
    if (!armed.value || settling() || !uid || !state.affixId || !state.targetUid || state.replaceId === undefined) return false
    const ok = transferAffix({
      sourceUid: uid,
      targetUid: state.targetUid,
      affixId: state.affixId,
      replaceId: state.replaceId,
      seal: plan.value?.sealMode === 'paid'
    })
    if (ok) {
      state.affixId = null
      state.replaceId = undefined
    }
    disarm()
    return ok
  }

  function reset(): void {
    Object.assign(state, initialState())
  }

  watch(() => toValue(sourceUid), reset)

  return reactive({
    ...toRefs(state),
    source,
    target,
    sourceWorn,
    sourceLines,
    sourceSealed,
    candidates,
    shownCandidates,
    hiddenCount,
    targetName,
    targetCap,
    targetSealed,
    landings,
    check,
    plan,
    sealFee,
    shortfall,
    blockLabel,
    armed,
    resultLines,
    resultSealed,
    deltaText,
    movedText,
    replacedText,
    pickAffix,
    pickTarget,
    pickSlot,
    toggleSeal,
    expandAll,
    arm,
    disarm,
    settling,
    confirm,
    reset
  })
}

export type AffixTransferFlow = ReturnType<typeof useAffixTransfer>
