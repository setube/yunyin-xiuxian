<template>
  <BaseModal
    :open="open"
    :title="focus === null ? '词条全表' : (focusDef?.name ?? '词条')"
    closable
    @close="emit('close')"
  >
    <div class="max-h-[62vh] overflow-y-auto pr-1">
      <AffixCodexList :focus="focus" @update:focus="focus = $event" />
    </div>
    <template #footer>
      <button class="btn-seal w-full" @click="emit('close')">收 起</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { affixDef } from '@/data/affixes'
  import BaseModal from '@/components/common/BaseModal.vue'
  import AffixCodexList from './AffixCodexList.vue'

  const props = defineProps<{ open: boolean; affixId: string | null }>()
  const emit = defineEmits<{ close: [] }>()

  /** 表内只能有一页:要么全表,要么某一条;每次打开都从头来 */
  const focus = ref<string | null>(null)
  watch(
    () => props.open,
    (o) => {
      if (o) focus.value = props.affixId
    },
    { immediate: true }
  )

  const focusDef = computed(() => (focus.value ? affixDef(focus.value) : undefined))
</script>
