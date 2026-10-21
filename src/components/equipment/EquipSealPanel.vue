<template>
  <button
    v-if="canSealAffix"
    class="shrink-0 min-h-[28px] rounded-md px-1.5 py-1 text-[10px] text-azure active:scale-90 active:opacity-60"
    :aria-label="`封存词条${name}`"
    @click="doSealAffix"
  >
    封存
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
  import { sealAffix, sealCost, unsealAffix } from '@/core/reforge'
  import GameIcon from '@/components/common/GameIcon.vue'

  /**
   * 封存操作 —— 词条行上的「封存 / 解封」一组,自 EquipmentDetailDialog 迁入。
   *
   * 能封与否只问 core/reforge 的 sealCost(与 sealAffix 同源):价签读不出、
   * 或这条已在封存名单里,就换上解封钮。解封免费即时 —— 锁是花过的沉没成本。
   */
  const props = defineProps<{ affixId: string; name: string }>()

  const ui = useUiStore()
  const inventory = useInventoryStore()

  const inst = computed(() => (ui.equipDetailUid ? inventory.findItem(ui.equipDetailUid) : undefined))
  const sealCostVal = computed(() => (inst.value ? sealCost(inst.value) : null))
  const sealed = computed(() => (inst.value?.sealedAffixIds ?? []).includes(props.affixId))
  const canSealAffix = computed(() => inst.value !== undefined && sealCostVal.value !== null && !sealed.value)

  function doSealAffix(): void {
    if (inst.value) sealAffix(inst.value.uid, props.affixId)
  }

  function doUnsealAffix(): void {
    if (inst.value) unsealAffix(inst.value.uid, props.affixId)
  }
</script>
