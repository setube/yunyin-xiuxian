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

  /**
   * 0~1,坏值(NaN/Infinity)按 0 画。
   *
   * `Math.max(0, Math.min(1, NaN))` 仍是 NaN —— 两道钳制都留不住它(AGENTS.md 记过这一类),
   * 拼出来的是 `width: NaN%`。
   *
   * **`NaN%` 不是「画成 0」,也不是「保持原值」** —— 它被 CSS 当成语法不合法的值直接丢弃,
   * 于是结果取决于这条声明是**首帧就有**还是**后来才赋上**:
   *   · 首帧就在(本组件的情形:Vue 第一次 patch 内联 style)→ 等于没写 → 块级子元素 `width: auto`
   *     → **把槽画满**。真浏览器实测(300px 的槽):NaN% 得 300px,0% 得 0px。
   *   · 运行中才赋值 → 声明被丢弃 → 元素**保持上一个值**。
   * 两条都不对:一条「还差得远」的进度条会显示成 100%,或者卡在过期读数上,且不报任何错。
   *
   * 调用方多半是 `cur / target` 这种除法,目标为 0 或坏档里的非数都能走到这里。
   */
  const width = computed(() => {
    if (!Number.isFinite(props.value)) return '0%'
    return `${Math.max(0, Math.min(1, props.value)) * 100}%`
  })
</script>
