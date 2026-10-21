<template>
  <!-- 装备标记(玩家反馈:同名装备想按不同流派区分) -->
  <div class="mt-2 flex items-center gap-2">
    <input
      v-model="noteDraft"
      :maxlength="4"
      aria-label="为这件装备加个标记区分流派(最多四个字)"
      placeholder="加个标记区分流派(≤4字)"
      class="min-w-0 grow rounded-md border border-ink/15 bg-paper-deep/60 px-2 py-1 text-[12px] text-ink outline-none placeholder:text-ink-faint focus:border-azure"
      @change="applyNote"
    />
    <button v-if="noteDraft" class="-my-1 flex min-h-[28px] items-center px-1 py-1 text-[11px] text-ink-faint active:opacity-60" @click="clearNote">
      清除
    </button>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { useInventoryStore } from '@/stores/inventory'

  /**
   * 装备标记 —— 自 EquipmentDetailDialog 迁入。
   *
   * 草稿随当前件走(自读 ui.equipDetailUid + inventory,与宿主同一份 inst),
   * 写回也直接落 inventory,空串 = 清除。面板不持任何独立账。
   */
  const ui = useUiStore()
  const inventory = useInventoryStore()

  const inst = computed(() => (ui.equipDetailUid ? inventory.findItem(ui.equipDetailUid) : undefined))

  const noteDraft = ref('')
  watch(
    () => inst.value?.note,
    (n, old) => {
      // 只在来源变化时同步草稿;自己写回(applyNote)引发的同一值回灌不迭代
      if (n === noteDraft.value || n === old) return
      noteDraft.value = n ?? ''
    },
    { immediate: true }
  )

  function applyNote(): void {
    if (!inst.value) return
    const note = noteDraft.value.trim()
    inventory.replaceItem({ ...inst.value, note: note.length > 0 ? note.slice(0, 4) : undefined })
  }

  function clearNote(): void {
    noteDraft.value = ''
    applyNote()
  }
</script>
