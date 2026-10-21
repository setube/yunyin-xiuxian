import { computed, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useInventoryStore } from '@/stores/inventory'
import { equipmentTemplate } from '@/data/equipment'
import { AFFIXES, affixDef, affixFitBlock, affixesByRarity } from '@/data/affixes'
import { qualityDef } from '@/data/qualities'
import {
  autoReforge,
  autoReforgeBudget,
  reforgeCost,
  AUTO_REFORGE_MAX_TARGETS,
  type ReforgeTarget
} from '@/core/reforge'
import { formatGN } from '@/utils/format'
import { mulN } from '@/utils/gnum'
import { playSfx } from '@/core/audio'
import { AFFIX_RARITY_META } from '@/data/statNames'

/**
 * 自动重铸 —— 「洗到指定词条即停」的整本账。
 *
 * 候选池、预算归一、至多花销、开洗结账与换件复位原本挤在 817 行的装备详情里;
 * 现收进这一处,面板(AutoReforgePanel)与页脚开关同读一份,不各留一套 ref。
 * 价签与抽取规则全转调 core/reforge:候选只问 affixFitBlock,不另抄 slots/minRank。
 */
export function useAutoReforge() {
  const ui = useUiStore()
  const inventory = useInventoryStore()

  const inst = computed(() => (ui.equipDetailUid ? inventory.findItem(ui.equipDetailUid) : undefined))
  const reforgeCostVal = computed(() => (inst.value ? reforgeCost(inst.value) : null))

  const autoBudget = ref(50)
  /** 停止条件:任一命中即停;minRoll 给「数值范围」那一嘴 */
  const autoTargets = ref<ReforgeTarget[]>([])
  /** 一键洗到预算上限是批量动作:同分解/连升一样先摆总账,第二步才动手 */
  const autoArm = ref(false)

  /**
   * 可选的停止词条:当前装备**真能洗到**的那些 —— 与重铸抽取池同规则
   * (槽位匹配 + 品质门槛不高于当前),而不是全 113 条里按权重取前 24。
   * 否则连「想洗的词条在 24 名开外」都选不进去,自动重铸就等于承诺了
   * 一份它兑现不了的面板。
   */
  const affixOptions = computed(() => {
    if (!inst.value) return []
    const tpl = equipmentTemplate(inst.value.templateId)
    const q = inst.value && qualityDef(inst.value.quality)
    if (!tpl || !q) return []
    return [...AFFIXES].filter(a => affixFitBlock(a, tpl.slot, q.rank) === null).sort((a, b) => b.weight - a.weight)
  })

  function isAutoTarget(id: string): boolean {
    return autoTargets.value.some(t => t.affixId === id)
  }

  /** 候选按四档品质成组(传世→常见,空组不占位);组内延续 affixOptions 的权重序 */
  const rarityGroups = computed(() => affixesByRarity(affixOptions.value))

  /** 已选目标的名字颜色:它从哪一档领出,就用哪一档的品质色 */
  function targetColor(id: string): string {
    return AFFIX_RARITY_META[affixDef(id)?.rarity ?? 'common'].color
  }

  function toggleAutoTarget(id: string): void {
    if (isAutoTarget(id)) autoTargets.value = autoTargets.value.filter(t => t.affixId !== id)
    // 默认先求「高值」(≥50%);拉到底 0% 即回到「出现就行」
    else if (autoTargets.value.length < AUTO_REFORGE_MAX_TARGETS) autoTargets.value = [...autoTargets.value, { affixId: id, minRoll: 0.5 }]
  }

  const autoMaxCost = computed(() => {
    const r = reforgeCostVal.value
    if (!r) return null
    // 预览用**归一后的**预算 —— 与执行同一处(autoReforgeBudget),
    // 手输 800 时预览与实洗都是 500,不再按 800 虚报花销
    const n = autoReforgeBudget(autoBudget.value)
    return { stone: mulN(r.stone, n), dust: r.dust * n }
  })

  // 改目标/预算后动作不再是同一笔,确认态一并复位
  watch([autoTargets, autoBudget], () => {
    autoArm.value = false
  })
  function runAutoReforge(): void {
    if (!inst.value) return
    autoArm.value = false
    const targets = autoTargets.value
    const budget = autoReforgeBudget(autoBudget.value)
    const out = autoReforge(inst.value.uid, targets, budget)
    const cost = `花 ${formatGN(out.stone)} · 尘×${out.dust}`
    // 「没洗到目标」不等于「没洗动」:每次重铸词条都尽数重掷,结账要报清现在这一身落在哪
    const wanted = autoTargets.value.map(t => affixDef(t.affixId)?.name ?? t.affixId).join('、')
    const now = out.affixIds.map(id => affixDef(id)?.name ?? id).join('、') || '空'
    if (out.stop === 'target' && out.hit) {
      playSfx('success') // 结账一声:洗到了
      ui.toast(
        `洗出「${affixDef(out.hit.id)?.name ?? out.hit.id}」值 ${Math.round(out.hit.roll * 100)}% —— 共洗 ${out.rolls} 次,${cost}`,
        'success'
      )
    } else if (out.stop === 'budget') {
      playSfx('warn')
      ui.toast(`定好的次数用完了:连洗 ${out.rolls} 次,未能撞上「${wanted}」。如今这一身是:${now},${cost}`, 'warn')
    } else if (out.stop === 'broke') {
      playSfx('warn')
      if (out.rolls === 0) {
        // 缺哪一样说哪一样:灵石去历练/悬赏挣,器灵尘靠分解闲置装备 —— 两条去路相反
        const short = out.short === 'dust' ? '器灵尘未足(分解闲置装备可得)' : '灵石未足(历练与悬赏可得)'
        ui.toast(`${short},难开这一炉,${cost}`, 'warn')
      } else {
        ui.toast(`灵石/器灵尘见底,洗了 ${out.rolls} 次即止;今一身为 ${now},${cost}`, 'warn')
      }
    } else {
      // frozen 是「没得洗」不是「没洗成」,不响;这一档兼两种收法:无位可洗(全封存/无词条),或装备已不在行囊
      const gone = inst.value !== undefined && !inventory.findItem(inst.value.uid)
      ui.toast(gone ? '此物已不在行囊,重铸无从谈起' : '此物已无未封存词条,无从重铸', 'info')
    }
    // 结账即收板(由面板通知宿主收起):结果已写在 toast 与装备词条上,想再调条件重开一次即可
  }

  /** 收起自动重铸(宿主换件/转移时调用):勾选与确认态一并作废 */
  function closeAuto(): void {
    autoArm.value = false
    autoTargets.value = []
  }

  return {
    reforgeCostVal,
    autoBudget,
    autoTargets,
    autoArm,
    affixOptions,
    rarityGroups,
    autoMaxCost,
    isAutoTarget,
    targetColor,
    toggleAutoTarget,
    closeAuto,
    runAutoReforge
  }
}
