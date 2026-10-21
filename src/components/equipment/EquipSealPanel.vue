<template>
  <button
    v-if="canSealAffix"
    class="shrink-0 min-h-[28px] rounded-md px-1.5 py-1 text-[10px] text-azure active:scale-90 active:opacity-60 disabled:text-ink-faint disabled:opacity-60"
    :disabled="sealShort"
    :aria-label="sealLabel"
    :title="sealShort ? `灵石尚差 ${formatGN(sealGap!)}` : undefined"
    @click="doSealAffix"
  >
    {{ sealShort ? `差${formatGN(sealGap!)}` : '封存' }}
  </button>
  <button
    v-else-if="sealed"
    class="shrink-0 min-h-[28px] rounded-md px-1.5 py-1 text-[10px] text-jade active:scale-90 active:opacity-60"
    :aria-label="`解封词条${name}`"
    @click="doUnsealAffix"
  >
    <GameIcon name="unlock" :size="12" />
  </button>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { useInventoryStore } from '@/stores/inventory'
  import { sealAffix, sealCost, sealShortfall, unsealAffix } from '@/core/reforge'
  import { formatGN } from '@/utils/format'
  import GameIcon from '@/components/common/GameIcon.vue'

  /**
   * 封存操作 —— 词条行上的「封存 / 解封」一组,自 EquipmentDetailDialog 迁入。
   *
   * 能封与否只问 core/reforge 的 sealCost / sealShortfall(与 sealAffix 同源):
   * 价签读不出、或这条已在封存名单里,就换上解封钮;付不起则保留封存钮但置灰,
   * 并把实际石差写在钮上。解封免费即时 —— 锁是花过的沉没成本。
   */
  const props = defineProps<{ affixId: string; name: string }>()

  const ui = useUiStore()
  const inventory = useInventoryStore()

  const inst = computed(() => (ui.equipDetailUid ? inventory.findItem(ui.equipDetailUid) : undefined))
  const sealCostVal = computed(() => (inst.value ? sealCost(inst.value) : null))
  const sealGap = computed(() => (inst.value ? sealShortfall(inst.value) : null))
  const sealShort = computed(() => sealGap.value !== null && sealGap.value.m > 0)
  const sealed = computed(() => (inst.value?.sealedAffixIds ?? []).includes(props.affixId))
  const canSealAffix = computed(() => inst.value !== undefined && sealCostVal.value !== null && !sealed.value)
  const sealLabel = computed(() =>
    sealShort.value ? `封存词条${props.name},灵石尚差 ${formatGN(sealGap.value!)}` : `封存词条${props.name}`
  )

  function doSealAffix(): void {
    if (inst.value) sealAffix(inst.value.uid, props.affixId)
  }

  function doUnsealAffix(): void {
    if (inst.value) unsealAffix(inst.value.uid, props.affixId)
  }
</script>
