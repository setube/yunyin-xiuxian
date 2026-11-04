<template>
  <!--
    外距挂在**外壳**上,槽体只管画。
    原先调用方传进来的 class(pb-1.5 之类)直接落到槽体:padding-bottom 与内联 height 相叠,
    槽体被撑到 6px、内条仍按父高的百分比算 —— 组内那片细条于是成为一根空槽,填充高度 0。
    $attrs 自带 class/style,故这里显式接到外壳,槽体只留 track-ink。
  -->
  <div v-bind="$attrs">
    <div class="track-ink w-full" :style="{ height: `${props.height}px` }">
      <div class="bar-fill" :style="{ width, background: props.color }" />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  const props = withDefaults(
    defineProps<{
      /** 0~1 */
      value: number
      color?: string
      height?: number
    }>(),
    { color: 'var(--color-jade)', height: 6 }
  )

  const width = computed(() => `${Math.max(0, Math.min(1, props.value)) * 100}%`)
</script>
