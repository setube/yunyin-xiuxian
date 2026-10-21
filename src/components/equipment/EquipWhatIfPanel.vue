<template>
  <!-- 修士实验室:反事实换装推演(真仙可用) -->
  <template v-if="canWhatIf">
    <div class="ink-divider my-3" />
    <button v-if="!whatIf" class="btn-ghost w-full !py-2 !text-[12px]" @click="runWhatIf">
      天机推演 · 若换此装,四天局面如何?
    </button>
    <template v-else>
      <p class="mb-1.5 font-kai text-[12px] tracking-[0.3em] text-ink-faint">天机推演</p>
      <p class="text-[11px] text-ink-soft tabular">
        构筑:{{ whatIf.buildBefore?.displayName ?? '未成路' }}
        <span class="text-ink-faint">→</span>
        {{ whatIf.buildAfter?.displayName ?? '流派散去' }}
      </p>
      <div class="mt-1 space-y-0.5">
        <p v-for="w in whatIf.worlds" :key="w.name" class="flex justify-between text-[11px]">
          <span class="text-ink-faint">{{ w.name }}</span>
          <span class="tabular">
            <span class="text-ink-faint">{{ w.beforeText }}</span>
            <span class="mx-1 text-ink-faint">→</span>
            <span :class="w.trend === 'up' ? 'text-jade' : w.trend === 'down' ? 'text-cinnabar' : 'text-ink-soft'">
              {{ w.afterText }}
            </span>
          </span>
        </p>
      </div>
      <p v-if="whatIf.modChanges.length" class="mt-1 text-[10px] text-azure tabular">
        主要变化:{{ whatIf.modChanges.map(c => `${c.label} ${c.delta > 0 ? '+' : ''}${Math.round(c.delta * 100)}%`).join(' · ') }}
      </p>
      <p class="mt-0.5 text-[10px] text-ink-faint">推演只述局面,不替你定夺。</p>
    </template>
  </template>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { useInventoryStore } from '@/stores/inventory'
  import { equipmentTemplate } from '@/data/equipment'
  import { endgameUnlocked } from '@/core/endgameService'
  import { whatIfEquip, type WhatIfReport } from '@/core/lab'

  /**
   * 天机推演面板 —— 自 EquipmentDetailDialog 迁入。
   *
   * 推演的账全在 core/lab(whatIfEquip),面板只持一份报表状态;
   * 「换一件就清空上一份推演」的 watch 随块搬入,不再由宿主代管。
   * 未装备判定与宿主同一判据(inventory.equipped[slot] === uid),不另立一套。
   */
  const ui = useUiStore()
  const inventory = useInventoryStore()

  const inst = computed(() => (ui.equipDetailUid ? inventory.findItem(ui.equipDetailUid) : undefined))
  const isEquipped = computed(() => {
    const t = inst.value ? equipmentTemplate(inst.value.templateId) : undefined
    return inst.value && t ? inventory.equipped[t.slot] === inst.value.uid : false
  })

  const whatIf = ref<WhatIfReport | null>(null)
  const canWhatIf = computed(() => endgameUnlocked() && !isEquipped.value && inst.value !== undefined)

  function runWhatIf(): void {
    if (inst.value) whatIf.value = whatIfEquip(inst.value.uid)
  }

  watch(inst, () => {
    whatIf.value = null
  })
</script>
