<template>
  <!--
    界域印:四界各一枚,框形分家(见 ui/worldMark)。
    纯装饰 —— 界域名就在旁边,读屏已念得出;重复念一遍是噪声,故整枚 aria-hidden。
    宿主宽度由调用点定:行内 18px,标题旁也用同一个尺寸(小印不放大,放大就不再是印)。
  -->
  <span
    v-if="mark"
    class="world-seal-mark"
    :class="`world-seal-mark--${mark.frame}`"
    :style="{ '--world-tone': mark.tone }"
    aria-hidden="true"
    >{{ mark.seal }}</span
  >
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { worldMark } from '@/ui/worldMark'

  /** 认不出界域 id 时不出图 —— 与其它形制同一取舍:不画错的印 */
  const props = defineProps<{ world: string }>()

  const mark = computed(() => worldMark(props.world))
</script>
