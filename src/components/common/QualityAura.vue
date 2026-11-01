<template>
  <!--
    品阶光环:稀有件的形制层。
    纯装饰,整体 aria-hidden —— 品阶名已由角章 QualitySeal 的 aria-label 报出,不重复念。
    色相由调用方给(品阶表或丹药专属的道品金),经 --q-tone 注入 CSS,组件里不写死任何色值。
    宿主元素须是 position: relative 且 overflow 可见,否则角饰会被裁掉。

    `compact`:格子类宿主(装备/丹药格)底边已被角标占满、右上还有品阶章,
    四个角只有一个空着,故紧凑模式一律只画**左上**这一枚。
    枚数差异在紧凑格上改由光晕档位与角章承担(角章本就只用稀有件盖),
    换尺寸不换语义:任何尺寸下「有角饰 = 进阶以上」都成立。

    `rank`:丹药的道品(rank 9)不在 QualityId 联合里,传 rank + tone 走这条;
    其余内容传 quality 即从品阶表取,不重复写色值。
  -->
  <span
    v-if="aura.tier !== 'plain'"
    aria-hidden="true"
    class="pointer-events-none absolute inset-0"
    :style="{ '--q-tone': tone, '--q-glow': `${aura.glow}px` }"
  >
    <span class="q-aura-halo" :class="{ 'q-aura-halo--radiant': aura.tier === 'radiant' }" />
    <span class="q-aura-corner q-aura-corner--tl" :class="{ 'q-aura-corner--radiant': aura.tier === 'radiant' }" />
    <template v-if="!compact">
      <span class="q-aura-corner q-aura-corner--br" :class="{ 'q-aura-corner--radiant': aura.tier === 'radiant' }" />
      <span v-if="hasTopCorner" class="q-aura-corner q-aura-corner--tr" />
    </template>
    <span v-if="aura.sheen" class="q-aura-sheen" />
  </span>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { QualityId } from '@/types'
  import { qualityDef } from '@/data/qualities'
  import { qualityAura, qualityAuraByRank } from '@/ui/qualityAura'

  const props = withDefaults(
    defineProps<{
      /** 品阶 id;给了它就不必再给 rank/tone */
      quality?: QualityId
      /** 按 rank 走(丹药道品 rank 9 不在 QualityId 里) */
      rank?: number
      /** 按 rank 走时必给:品阶色由调用方从自己的色表取 */
      tone?: string
      compact?: boolean
    }>(),
    // quality / rank / tone 三者按需给其一,默认值用 undefined 表达「没给」
    { compact: false, quality: undefined, rank: undefined, tone: undefined }
  )

  const aura = computed(() => (props.quality ? qualityAura(props.quality) : qualityAuraByRank(props.rank ?? 0)))
  /** 角饰与光晕都吃品阶色;按 quality 走时取 data/qualities 的唯一事实源 */
  const tone = computed(() => props.tone ?? (props.quality ? qualityDef(props.quality).color : 'transparent'))
  /** 宽卡上的第三枚角只在仙/神档出现:这是「形制可数」的那一格差异 */
  const hasTopCorner = computed(() => aura.value.radiant === 'immortal' || aura.value.radiant === 'divine')
</script>
