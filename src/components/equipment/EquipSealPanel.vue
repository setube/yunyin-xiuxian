<template>
  <button
    v-if="canSealAffix"
    class="shrink-0 min-h-[28px] rounded-md px-1.5 py-1 text-[10px] text-azure active:scale-90 active:opacity-60 disabled:text-ink-faint"
    :disabled="sealShort"
    :aria-label="sealLabel"
    :title="sealShort ? `灵石尚差 ${formatGap(sealGap!)}` : undefined"
    @click="doSealAffix"
  >
    {{ sealShort ? `差${formatGap(sealGap!)}` : '封存' }}
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
  import { formatGap } from '@/utils/format'
  import GameIcon from '@/components/common/GameIcon.vue'

  /** 能封与否只问 core/reforge 的 sealCost / sealShortfall(与 sealAffix 同源);解封免费即时 */
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
    sealShort.value ? `封存词条${props.name},灵石尚差 ${formatGap(sealGap.value!)}` : `封存词条${props.name}`
  )

  function doSealAffix(): void {
    if (inst.value) sealAffix(inst.value.uid, props.affixId)
  }

  function doUnsealAffix(): void {
    if (inst.value) unsealAffix(inst.value.uid, props.affixId)
  }
</script>
