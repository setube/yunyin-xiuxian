<template>
  <button
    class="relative aspect-square rounded-md border transition-transform active:scale-95"
    :style="{ borderColor: quality.color + '55', background: quality.color + '0f' }"
    @click="emit('open', props.item.uid)"
  >
    <!-- 角标:佩戴 / 上锁 -->
    <span v-if="props.equipped" class="absolute left-0.5 top-0.5 font-kai text-[8px] leading-none text-jade">佩</span>
    <span v-if="props.item.locked" class="absolute right-0.5 top-0.5 leading-none text-ink-faint">
      <GameIcon name="lock" :size="8" />
    </span>

    <!-- 主图标 -->
    <span class="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1">
      <GameIcon :name="template?.icon ?? 'sword'" :size="20" :style="{ color: quality.color }" />
      <span class="w-full truncate text-center text-[9px] leading-tight" :style="{ color: quality.color }">
        {{ template?.name ?? '?' }}
      </span>
    </span>

    <!-- 强化等级:右下角,格子背包的惯例位置 -->
    <span v-if="props.item.level > 0" class="absolute bottom-0.5 right-1 text-[9px] leading-none text-gold-ink tabular">
      +{{ props.item.level }}
    </span>
  </button>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { EquipmentInstance } from '@/types'
  import { equipmentTemplate } from '@/data/equipment'
  import { qualityDef } from '@/data/qualities'
  import GameIcon from '@/components/common/GameIcon.vue'

  const props = defineProps<{ item: EquipmentInstance; equipped?: boolean }>()
  const emit = defineEmits<{ open: [uid: string] }>()

  const template = computed(() => equipmentTemplate(props.item.templateId))
  const quality = computed(() => qualityDef(props.item.quality))
</script>
