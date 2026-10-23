<template>
  <span
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
   * 品阶阴文小章 —— 高品阶的第二条区分线索,不靠颜色单打。
   *
   * 九档品阶里良品与精品同属青绿系,纸面上几乎难分;色弱玩家更难只凭色相读出档位。
   * 章用形状补这一层:天/仙/神把名字首字盖在角上,扫一眼格子就知道「这几件不一样」。
   *
   * 采用阴文(淡色底 + 主题墨字 + 品阶色细边),不拿品阶色铺满底:天品的藤黄、
   * 仙品的青碧当底色都托不住浅色字。品阶色只留在边框与淡底上;9-11px 的字形
   * 改用随主题翻转的 ink —— 品阶色直接当字色会在同色淡底上掉到 2~4:1。
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
