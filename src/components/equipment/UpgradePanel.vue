<template>
  <template v-if="inst && upCost">
    <div class="ink-divider my-3" />
    <p class="flex items-center justify-between text-[12px] text-ink-faint">
      <!--
        刻度独占一行:放同一行会把「上限 10」挤断成两行(实测 375 宽下断成「上限 / 10」)。
        文字整句 nowrap,刻度另起一行 —— 见 ui/masteryMark 的 upgradeMark。
      -->
      <span class="min-w-0">
        <span class="upgrade-pips" :class="{ 'upgrade-pips--max': previewMark.mark.maxed }" role="img" :aria-label="`强化 +${previewMark.level} / 上限 ${previewMark.cap}`">
          <i v-for="(on, i) in upgradePips(previewMark.mark)" :key="i" :class="{ on }" />
        </span>
        <span class="mt-0.5 block whitespace-nowrap">强化 +{{ previewMark.level }} / 上限 {{ previewMark.cap }}</span>
      </span>
      <span class="tabular">器灵尘×{{ upCost.dust }} · 灵石 {{ formatGN(upCost.stone) }}</span>
    </p>
    <p class="mt-1 text-[11px] tabular text-azure">{{ equipNextLevelText(inst.level) }}</p>
    <p v-if="short" class="mt-1 text-[10px] leading-relaxed text-cinnabar tabular">
      <template v-if="gap.dust > 0">器灵尘尚差 {{ gap.dust }}</template><template v-if="gap.dust > 0 && gap.stone.m > 0"> · </template><template v-if="gap.stone.m > 0">灵石尚差 {{ formatGap(gap.stone) }}</template>
    </p>
    <!--
      连升二步确认与分解/散去同款。
      flex-wrap + 文本保底宽不可去:否则窄屏 flex-1 文本被 shrink-0 钮压成 0 宽竖排。
    -->
    <!--
      外层不再 flex-wrap:正文与钮组各占一行(钮组自带 w-full),两态段高因此相同。
      留着 flex-wrap 的话,320 宽下确认态的钮组会先挤进正文那一行再折 —— 段高 52.5 → 66.8(实测)。
    -->
    <div v-if="batchPlan.levels > 0" class="mt-2 rounded-md border border-ink/10 bg-paper-deep/50 px-2.5 py-2">
      <!--
        正文两态同一段、钮组自成一行 —— 与洞府连升同一套做法。
        原先确认态正文压成一行、再多两枚钮:一段从两行缩成一行,钮却多出来。
      -->
      <div class="min-w-[5rem] flex-1">
        <p class="text-[10px] text-ink-faint">
          连升至 <span class="font-kai text-[12px] text-cinnabar">+{{ inst.level + batchPlan.levels }}</span> 级
        </p>
        <p class="mt-0.5 text-[9px] text-ink-faint tabular">共耗 器灵尘×{{ batchPlan.dust }} · 灵石 {{ formatGN(batchPlan.stone) }}</p>
      </div>
      <div class="flex w-full shrink-0 justify-end gap-1.5">
        <button v-if="batchConfirm === inst.uid" class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" @click="batchConfirm = null">再想想</button>
        <button
          v-if="batchConfirm === inst.uid"
          class="btn-seal shrink-0 !px-2.5 !py-2 !text-[11px]"
          @click="runBatchUpgrade"
        >连 升</button>
        <button v-else class="btn-ghost shrink-0 !px-3 !py-2 !text-[11px]" @click="batchConfirm = inst.uid">连 升</button>
      </div>
    </div>
  </template>
  <!--
    满级时原先整块消失:面板里既没有「已至上限」也没有下一级预览,
    玩家只看到强化那一段凭空不见。保留一条状态行,直接说原因。
  -->
  <template v-else-if="inst && !upCost">
    <div class="ink-divider my-3" />
    <p class="flex items-center justify-between text-[12px] text-ink-faint">
      <span class="min-w-0">
        <span class="upgrade-pips" :class="{ 'upgrade-pips--max': currentMark.mark.maxed }" role="img" :aria-label="`强化 +${currentMark.level} / 上限 ${currentMark.cap}`">
          <i v-for="(on, i) in upgradePips(currentMark.mark)" :key="i" :class="{ on }" />
        </span>
        <span class="mt-0.5 block whitespace-nowrap">强化 +{{ currentMark.level }} / 上限 {{ currentMark.cap }}</span>
      </span>
      <span class="text-gold-ink">{{ upgradeCapToast() }}</span>
    </p>
  </template>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { useInventoryStore } from '@/stores/inventory'
  import { upgradeCapToast } from '@/ui/forgeText'
  import { upgradeMark, upgradePips } from '@/ui/masteryMark'
  import { equipLevelCap, equipUpgradeCost, upgradeBatchPlan, upgradeEquipmentBatch, upgradeShort, upgradeShortfall, type UpgradeBatchPlan } from '@/core/forge'
  import { formatGN, formatGap } from '@/utils/format'
  import { gnZero } from '@/utils/gnum'
  import { equipNextLevelText } from '@/ui/equipText'

  /** 成本与预览全读 core/forge,不持第二本账;当前件取 ui.equipDetailUid,与宿主同一份 inst */
  const ui = useUiStore()
  const inventory = useInventoryStore()

  const inst = computed(() => (ui.equipDetailUid ? inventory.findItem(ui.equipDetailUid) : undefined))
  const upCost = computed(() => (inst.value ? equipUpgradeCost(inst.value.uid) : null))
  const short = computed(() => (upCost.value ? upgradeShort(upCost.value) : null))
  const gap = computed(() => (upCost.value ? upgradeShortfall(upCost.value) : { dust: 0, stone: gnZero() }))
  /** 强化等级形制:上限随炼器台等级变,故在调用点取值(见 ui/masteryMark 的 upgradeMark) */
  function mark(level: number) {
    return upgradeMark(level, equipLevelCap())
  }

  /**
   * 两处刻度各算一次。
   *
   * 每块里 `mark(...)` 被调 2 次(刻度类名、刻度点)、`equipLevelCap()` 被调 2 次,
   * 而 `equipLevelCap()` 还要进 `mark` 里再查一次 —— 一个块算五六遍。
   * 两块的差别只在等级:能升时预览 `+1`,满级时报当前。
   */
  const previewMark = computed(() => {
    const level = (inst.value?.level ?? 0) + 1
    return { level, cap: equipLevelCap(), mark: mark(level) }
  })
  const currentMark = computed(() => {
    const level = inst.value?.level ?? 0
    return { level, cap: equipLevelCap(), mark: mark(level) }
  })

  /** 连升计划:预览与执行同一份;升不动时 levels=0,整块隐藏 */
  const batchPlan = computed<UpgradeBatchPlan>(() =>
    inst.value ? upgradeBatchPlan(inst.value.uid) : { levels: 0, dust: 0, stone: gnZero(), atCap: false }
  )
  /** 连升二步确认态:按 uid 记,换件即失效 */
  const batchConfirm = ref<string | null>(null)

  function runBatchUpgrade(): void {
    if (!inst.value) return
    batchConfirm.value = null
    upgradeEquipmentBatch(inst.value.uid)
  }
</script>
