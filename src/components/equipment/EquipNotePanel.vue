<template>
  <div class="mt-2 flex items-center gap-2">
    <input
      v-model="noteDraft"
      :maxlength="4"
      aria-label="装备标记"
      placeholder="标记(≤4字)"
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
  import { truncateCodePoints } from '@/utils/saveShape'

  /** 草稿随当前件走(与宿主同读 ui.equipDetailUid);写回直落 inventory,空串 = 清除 */
  const ui = useUiStore()
  const inventory = useInventoryStore()

  const inst = computed(() => (ui.equipDetailUid ? inventory.findItem(ui.equipDetailUid) : undefined))

  const noteDraft = ref('')
  watch(
    () => inst.value?.note,
    (n, old) => {
      // 只在来源变化时同步草稿;applyNote 写回的同值回灌跳过
      if (n === noteDraft.value || n === old) return
      noteDraft.value = n ?? ''
    },
    { immediate: true }
  )

  function applyNote(): void {
    if (!inst.value) return
    const note = noteDraft.value.trim()
    inventory.replaceItem({ ...inst.value, note: note.length > 0 ? truncateCodePoints(note, 4) : undefined })
  }

  function clearNote(): void {
    noteDraft.value = ''
    applyNote()
  }
</script>
