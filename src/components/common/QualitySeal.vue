<template>
  <!--
    role="img" 不可去:ARIA 规定 `generic`(无 role 的 span/div)不接受可访问名,
    裸 span 上的 aria-label 在严格实现里会被丢掉。角章只有一个字(天/仙/神),
    读屏要念的正是「天品档」这三个字,所以按「一段有名字的图」暴露。
    与此同源:InventoryView 的「可换」角标、AffixTransferPanel 的封存锁。
  -->
  <span
    role="img"
    class="inline-flex shrink-0 items-center justify-center rounded-[3px] border font-kai leading-none text-ink"
    :style="{
      ...boxStyle,
      borderColor: tint(tone, 0.45),
      background: tint(tone, 0.12)
    }"
    :class="sizeClass"
    :aria-label="`${qualityName}档`"
    >{{ qualityName.charAt(0) }}</span
  >
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { QualityId } from '@/types'
  import { qualityDef } from '@/data/qualities'
  import { tint } from '@/utils/colorToken'

  /**
   * 品阶阴文小章:高品阶的形状线索,不只靠颜色区分。
   * 品阶色只留在边框与淡底;9-11px 字形用随主题翻转的 ink,品阶色当字色会在同色淡底上掉到 2~4:1。
   */
  const props = withDefaults(
    defineProps<{
      quality: QualityId
      /** 章边长(px);行内用 14,格子上用 16 */
      size?: number
    }>(),
    { size: 14 }
  )

  const qualityName = computed(() => qualityDef(props.quality).name)
  const tone = computed(() => qualityDef(props.quality).color)
  const sizeClass = computed(() => (props.size >= 16 ? 'text-[11px]' : 'text-[9px]'))
  const boxStyle = computed(() => ({ width: `${props.size}px`, height: `${props.size}px` }))
</script>
