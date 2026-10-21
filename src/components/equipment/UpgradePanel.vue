<template>
  <template v-if="inst && upCost">
    <div class="ink-divider my-3" />
    <p class="flex items-center justify-between text-[12px] text-ink-faint">
      <span>强化 +{{ inst.level + 1 }} / 上限 {{ equipLevelCap() }}</span>
      <span class="tabular">器灵尘×{{ upCost.dust }} · 灵石 {{ formatGN(upCost.stone) }}</span>
    </p>
    <p class="mt-1 text-[11px] tabular text-azure">{{ equipNextLevelText(inst.level) }}</p>
    <p v-if="short" class="mt-1 text-[10px] leading-relaxed text-cinnabar tabular">
      <template v-if="gap.dust > 0">器灵尘尚差 {{ gap.dust }}</template><template v-if="gap.dust > 0 && gap.stone.m > 0"> · </template><template v-if="gap.stone.m > 0">灵石尚差 {{ formatGN(gap.stone) }}</template>
    </p>
    <!--
      连升:逐级成本一次算清(预览与执行共用 upgradeBatchPlan),省掉逐级一按。
      花的是累计总账,按一下不该就此了结 —— 二步确认与分解/散去同款。
      flex-wrap + 文本保底宽:窄屏(320 的弹窗内宽约 280px)说明与双钮放不下同排时,
      说明独占整行、钮换行 —— 否则 flex-1 文本被 shrink-0 钮压成 0 宽竖排。
    -->
    <div v-if="batchPlan.levels > 0" class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-ink/10 bg-paper-deep/50 px-2.5 py-2">
      <template v-if="batchConfirm !== inst.uid">
        <div class="min-w-[5rem] flex-1">
          <p class="text-[10px] text-ink-faint">
            连升至 <span class="font-kai text-[12px] text-cinnabar">+{{ inst.level + batchPlan.levels }}</span> 级
          </p>
          <p class="mt-0.5 text-[9px] text-ink-faint tabular">共 器灵尘×{{ batchPlan.dust }} · 灵石 {{ formatGN(batchPlan.stone) }}</p>
        </div>
        <button class="btn-ghost shrink-0 !px-3 !py-2 !text-[11px]" @click="batchConfirm = inst.uid">连 升</button>
      </template>
      <template v-else>
        <p class="min-w-[5rem] flex-1 text-[10px] leading-relaxed text-cinnabar">
          一步连升 {{ batchPlan.levels }} 级,花上面那笔总账 —— 仍要?
        </p>
        <button class="btn-ghost shrink-0 !px-2.5 !py-2 !text-[11px]" @click="batchConfirm = null">再想想</button>
        <button class="btn-seal shrink-0 !px-2.5 !py-2 !text-[11px]" @click="runBatchUpgrade">连 升</button>
      </template>
    </div>
  </template>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { useInventoryStore } from '@/stores/inventory'
  import { equipLevelCap, equipUpgradeCost, upgradeBatchPlan, upgradeEquipmentBatch, upgradeShort, upgradeShortfall, type UpgradeBatchPlan } from '@/core/forge'
  import { formatGN } from '@/utils/format'
  import { gnZero } from '@/utils/gnum'
  import { equipNextLevelText } from '@/ui/equipText'

  /**
   * 强化面板 —— 「强化 +N / 上限」「每级加成」「连升」一组,自 EquipmentDetailDialog 迁入。
   *
   * 成本与预览全读 core/forge(equipUpgradeCost / upgradeBatchPlan),面板不持第二本账;
   * 当前件仍取全局 ui.equipDetailUid,与宿主拿到同一份 inst。
   * 连升的确认态随面板走 —— 换件即由 uid 比对自然失效,不必宿主再复位。
   */
  const ui = useUiStore()
  const inventory = useInventoryStore()

  const inst = computed(() => (ui.equipDetailUid ? inventory.findItem(ui.equipDetailUid) : undefined))
  const upCost = computed(() => (inst.value ? equipUpgradeCost(inst.value.uid) : null))
  const short = computed(() => (upCost.value ? upgradeShort(upCost.value) : null))
  const gap = computed(() => (upCost.value ? upgradeShortfall(upCost.value) : { dust: 0, stone: gnZero() }))
  /** 连升计划:受余额与上限约束,预览与执行同一份(升不动时 levels=0,隐藏整块) */
  const batchPlan = computed<UpgradeBatchPlan>(() =>
    inst.value ? upgradeBatchPlan(inst.value.uid) : { levels: 0, dust: 0, stone: gnZero(), atCap: false }
  )
  /** 连升二步确认态:按 uid 记,换一件自然落回未确认 */
  const batchConfirm = ref<string | null>(null)

  function runBatchUpgrade(): void {
    if (!inst.value) return
    batchConfirm.value = null
    upgradeEquipmentBatch(inst.value.uid)
  }
</script>
