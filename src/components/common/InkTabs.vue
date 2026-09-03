<template>
  <div class="card-ink relative flex overflow-hidden p-1">
    <!-- 墨块滑动指示:随选中页签平滑游走 -->
    <span
      class="pointer-events-none absolute inset-y-1 left-1 rounded-md bg-ink shadow transition-transform duration-300"
      :style="{
        width: `calc((100% - 8px) / ${tabs.length})`,
        transform: `translateX(${activeIdx * 100}%)`,
        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)'
      }"
    />
    <button
      v-for="t in tabs"
      :key="t.id"
      class="relative z-10 flex-1 rounded-md py-1.5 font-kai text-[13px] tracking-[0.2em] transition-colors duration-200"
      :class="model === t.id ? 'text-paper' : 'text-ink-faint active:text-ink-soft'"
      @click="model = t.id"
    >
      {{ t.label }}
      <span
        v-if="t.dot"
        class="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-cinnabar"
        :class="model === t.id ? '' : 'animate-breathe'"
      />
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
  import { computed } from 'vue'

  const props = defineProps<{
    tabs: readonly { id: T; label: string; dot?: boolean }[]
  }>()

  const model = defineModel<T>({ required: true })

  const activeIdx = computed(() =>
    Math.max(
      0,
      props.tabs.findIndex(t => t.id === model.value)
    )
  )
</script>
