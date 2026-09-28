<template>
  <button
    class="relative aspect-square rounded-md border transition-transform active:scale-95"
    :style="{ borderColor: quality.color + '55', background: quality.color + '0f' }"
    :data-uid="props.item.uid"
    @click="emit('open', props.item.uid)"
  >
    <!-- 角标:佩戴 / 上锁 -->
    <span v-if="props.equipped" class="absolute left-0.5 top-0.5 font-kai text-[8px] leading-none text-jade">佩</span>
    <span v-if="props.item.locked" class="absolute right-0.5 top-0.5 leading-none text-ink-faint">
      <GameIcon name="lock" :size="8" />
    </span>
    <!-- 共鸣件:方格背包里也得看得出这一件拴着一条机制(两件才亮,见 core/equipSet) -->
    <span
      v-if="setName"
      class="absolute bottom-0.5 left-1 font-kai text-[8px] leading-none text-violet-ink/80"
      :title="`共鸣「${setName}」`"
    >
      共
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
    <!--
      自定标记:格子背包里也认得出「这件是哪个流派」(玩家反馈,≤4字)。
      三枚底角标(共 / 标记 / +N)共处底边,标记不再是居中飘 80% 宽 —— 那会把
      左「共」右「+N」都盖住(共鸣件 + 强化 + 带标记一件集齐时糊成一团)。
      改为左右各让出 24px(left-6/right-6),文字居中截断,三枚各就各位。
    -->
    <span
      v-if="props.item.note"
      class="absolute bottom-0.5 left-6 right-6 truncate text-center text-[8px] leading-none text-ink-faint"
    >
      {{ props.item.note }}
    </span>
  </button>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { EquipmentInstance } from '@/types'
  import { equipmentTemplate } from '@/data/equipment'
  import { qualityDef } from '@/data/qualities'
  import { equipSetDef } from '@/core/equipSet'
  import GameIcon from '@/components/common/GameIcon.vue'

  const props = defineProps<{ item: EquipmentInstance; equipped?: boolean }>()
  const emit = defineEmits<{ open: [uid: string] }>()

  const template = computed(() => equipmentTemplate(props.item.templateId))
  const quality = computed(() => qualityDef(props.item.quality))
  const setName = computed(() => (template.value?.set ? equipSetDef(template.value.set)?.name ?? '' : ''))
</script>
