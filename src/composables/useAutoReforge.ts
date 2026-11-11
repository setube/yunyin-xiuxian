import { computed, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useInventoryStore } from '@/stores/inventory'
import { equipmentTemplate } from '@/data/equipment'
import { AFFIXES, affixDef, affixFitBlock, affixesByRarity } from '@/data/affixes'
import { qualityDef } from '@/data/qualities'
import {
  autoReforge,
  autoReforgeBudget,
  reforgePlanShortfall,
  reforgeCost,
  reforgeShortfall,
  AUTO_REFORGE_MAX_TARGETS,
  type ReforgeTarget
} from '@/core/reforge'
import { TRANSFER_LABELS } from '@/ui/affixTransferText'
import { formatGN, formatGap } from '@/utils/format'
import { mulN } from '@/utils/gnum'
import { playSfx } from '@/core/audio'
import { AFFIX_RARITY_META } from '@/data/statNames'
import { reforgeEmptyToast, reforgeShortToast } from '@/ui/reforgeText'
import { affixRollText } from '@/ui/equipText'

/**
 * 自动重铸:洗到指定词条即停。面板(AutoReforgePanel)与页脚开关同读这一份。
 * 价签与抽取规则归 core/reforge:候选只问 affixFitBlock,不另抄 slots/minRank。
 */
export function useAutoReforge() {
  const ui = useUiStore()
  const inventory = useInventoryStore()

  const inst = computed(() => (ui.equipDetailUid ? inventory.findItem(ui.equipDetailUid) : undefined))
  const reforgeCostVal = computed(() => (inst.value ? reforgeCost(inst.value) : null))

  const autoBudget = ref(50)
  /** 停止条件:任一命中即停;minRoll 对应「数值范围」 */
  const autoTargets = ref<ReforgeTarget[]>([])
  /** 批量动作的确认态:先摆总账,第二步才动手(同分解/连升) */
  const autoArm = ref(false)

  /** 可选的停止词条:当前装备真能洗到的全部,与重铸抽取池同规则(槽位匹配 + 品质门槛不高于当前);不按权重取前 24 */
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

  /** 已选目标的名字颜色:取其所在档的品质色 */
  function targetColor(id: string): string {
    return AFFIX_RARITY_META[affixDef(id)?.rarity ?? 'common'].color
  }

  function toggleAutoTarget(id: string): void {
    if (isAutoTarget(id)) autoTargets.value = autoTargets.value.filter(t => t.affixId !== id)
    // 默认「高值」(≥50%);0% 即「出现就行」
    else if (autoTargets.value.length < AUTO_REFORGE_MAX_TARGETS) autoTargets.value = [...autoTargets.value, { affixId: id, minRoll: 0.5 }]
  }

  const autoMaxCost = computed(() => {
    const r = reforgeCostVal.value
    if (!r) return null
    // 预览与执行同用归一后的预算(autoReforgeBudget)
    const n = autoReforgeBudget(autoBudget.value)
    return { stone: mulN(r.stone, n), dust: r.dust * n }
  })

  /** 至多花销的缺口:按归一后的预算整批算,与确认钮和开洗结账同源 */
  const autoMaxGap = computed(() => {
    const r = reforgeCostVal.value
    if (!r) return null
    return reforgePlanShortfall(r, autoBudget.value)
  })

  watch([autoTargets, autoBudget], () => {
    autoArm.value = false
  })
  function runAutoReforge(): void {
    /**
     * 不在这里按 inst 提前返回:装备已被分解/转移时 inst 就是 undefined,
     * 提前 return 会让下面「未找到装备」那条提示永远走不到,玩家点了没反应。
     * core/reforge.autoReforge 对查不到的 uid 会安全返回 stop='frozen'(第 310 行),
     * 交给它结账,再按 equipDetailUid 判是否已不在行囊。
     */
    const uid = ui.equipDetailUid
    if (!uid) return
    autoArm.value = false
    const targets = autoTargets.value
    const budget = autoReforgeBudget(autoBudget.value)
    const out = autoReforge(uid, targets, budget)
    const tally = `${out.rolls} 次 · 花 ${formatGN(out.stone)} · 尘×${out.dust}`
    if (out.stop === 'target' && out.hit) {
      playSfx('success')
      ui.toast(`洗出「${affixDef(out.hit.id)?.name ?? out.hit.id}」${affixRollText(out.hit.roll)} · ${tally}`, 'success')
    } else if (out.stop === 'budget') {
      playSfx('warn')
      ui.toast(`未洗出目标 · ${tally}`, 'warn')
    } else if (out.stop === 'broke') {
      playSfx('warn')
      const short = out.short === 'dust' ? 'dust' : 'stone'
      if (out.rolls === 0) {
        // 与手动重铸缺料同一句
        const gap = reforgeCostVal.value ? reforgeShortfall(reforgeCostVal.value) : null
        ui.toast(reforgeShortToast(short, gap ? { stone: formatGap(gap.stone), dust: gap.dust } : undefined), 'warn')
      } else {
        ui.toast(`${reforgeShortToast(short)} · ${tally}`, 'warn')
      }
    } else {
      // frozen = 没得洗(全封存/无词条)或装备已不在行囊。
      // 判据取 equipDetailUid 而非 inst:inst 本身就是「按 uid 查行囊」的结果,
      // 装备不在行囊时它已经是 undefined,再拿它反查永远得不出「已不在」——
      // 那个分支原先恒不成立,玩家只会看到「无可重铸」,看不到「未找到装备」。
      const gone = !!ui.equipDetailUid && !inventory.findItem(ui.equipDetailUid)
      ui.toast(gone ? TRANSFER_LABELS.gone : reforgeEmptyToast(), 'info')
    }
    // 结账即收板(由面板通知宿主收起)
  }

  /** 收起自动重铸(宿主换件/转移时调用);勾选与确认态一并作废 */
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
    autoMaxGap,
    isAutoTarget,
    targetColor,
    toggleAutoTarget,
    closeAuto,
    runAutoReforge
  }
}
