<template>
  <!--
    图标是装饰:文字(按钮名 / 状态标签 / aria-label)已承载语义，
    SVG 再被读屏念一次只是噪音。lucide 生成的 svg 默认无 aria-hidden,
    焦点顺序也管不到它,故在此统一隐藏,别处不必逐个补。
  -->
  <component :is="icon" :size="props.size" :stroke-width="1.8" aria-hidden="true" focusable="false" />
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { iconOf } from '@/ui/icons'

  const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 16 })

  const icon = computed(() => iconOf(props.name))
</script>
