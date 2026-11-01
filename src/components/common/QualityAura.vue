<template>
  <!--
    品阶光环:稀有件的形制层。
    纯装饰,整体 aria-hidden —— 品阶名已由角章 QualitySeal 的 aria-label 报出,不重复念。
    色相取品阶表,经 --q-tone 注入 CSS,组件里不写死任何一个品阶的颜色。
    宿主元素须是 position: relative 且 overflow 可见,否则角饰会被裁掉。

    `compact`:格子类宿主(装备格)底边已被「共」「+N」「自定标记」占满、右上还有角章,
    四个角只有一个空着,故紧凑模式一律只画**左上**这一枚。
    枚数差异在紧凑格上改由光晕档位与角章承担(角章本就只用稀有件盖),
    换尺寸不换语义:任何尺寸下「有角饰 = 进阶以上」都成立。
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
  import { qualityAura } from '@/ui/qualityAura'

  const props = withDefaults(defineProps<{ quality: QualityId; compact?: boolean }>(), { compact: false })

  const aura = computed(() => qualityAura(props.quality))
  /** 角饰与光晕都吃品阶色;取 data/qualities 的唯一事实源 */
  const tone = computed(() => qualityDef(props.quality).color)
  /** 宽卡上的第三枚角只在仙/神档出现:这是「形制可数」的那一格差异 */
  const hasTopCorner = computed(() => aura.value.radiant === 'immortal' || aura.value.radiant === 'divine')
</script>
