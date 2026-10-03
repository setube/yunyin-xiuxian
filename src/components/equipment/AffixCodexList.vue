<template>
  <div>
    <!-- 单条详情:从全表点进来,看毕回表再比别的 -->
    <div v-if="focusDef" class="space-y-2.5">
      <button type="button" class="btn-ghost !px-2.5 !py-1.5 !text-[11px]" @click="emit('update:focus', null)">‹ 回词条全表</button>
      <div class="flex items-center gap-2">
        <span
          class="shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-relaxed"
          :style="{ background: tint(color, 0.15), color }"
        >
          {{ label }}
        </span>
        <span class="truncate font-kai text-[16px] tracking-[0.2em]" :style="{ color }">{{ focusDef.name }}</span>
      </div>
      <p class="text-[12px] leading-relaxed text-ink">{{ rangeText }}</p>
      <div class="space-y-1 rounded-md bg-paper-deep/60 px-2.5 py-2 text-[11px]">
        <p class="flex justify-between gap-2">
          <span class="shrink-0 text-ink-faint">数值区间</span>
          <span class="min-w-0 truncate text-right tabular text-ink">{{ rangeEnds.lo }} ~ {{ rangeEnds.hi }}</span>
        </p>
        <p class="flex justify-between gap-2">
          <span class="shrink-0 text-ink-faint">可出部位</span>
          <span class="min-w-0 truncate text-right text-ink">{{ slotsText }}</span>
        </p>
        <p class="flex justify-between gap-2">
          <span class="shrink-0 text-ink-faint">品质门槛</span>
          <span class="min-w-0 truncate text-right text-ink">{{ rankText ?? '无' }}</span>
        </p>
      </div>
      <p class="text-[10px] leading-relaxed text-ink-faint">
        自动重铸以「出现即停」为旨:定几成只定它须达到的数值底线,掷点仍在这一区间里摇。
      </p>
    </div>

    <!-- 全表:按四档品质成组(传世→常见),组内延续词条池的出场权重序 -->
    <template v-else>
      <p v-if="!groups.length" class="py-6 text-center text-[11px] text-ink-faint">词条库空空如也</p>
      <div v-for="group in groups" :key="group.rarity" class="mt-2 first:mt-0">
        <p class="flex items-center gap-1.5 text-[9px] tracking-widest" :style="{ color: affixRarityColor(group.rarity) }">
          <span class="h-px w-3 shrink-0" :style="{ background: affixRarityColor(group.rarity) }"></span>
          {{ affixRarityLabel(group.rarity) }} · {{ group.items.length }} 条
        </p>
        <div class="mt-1 space-y-1">
          <button
            v-for="af in group.items"
            :key="af.id"
            type="button"
            class="block w-full rounded-md border border-ink/10 bg-paper-deep/50 px-2.5 py-1.5 text-left active:opacity-70"
            @click="emit('update:focus', af.id)"
          >
            <span class="flex items-baseline gap-1.5">
              <span class="shrink-0 font-kai text-[12px]" :style="{ color: affixRarityColor(af) }">{{ af.name }}</span>
              <span class="shrink-0 text-[9px]" :style="{ color: affixRarityColor(af) }">{{ affixRarityLabel(af) }}</span>
              <span v-if="affixRankText(af)" class="shrink-0 text-[9px] text-ink-faint">{{ affixRankText(af) }}</span>
            </span>
            <span class="mt-0.5 block text-[11px] leading-snug text-ink-soft">{{ affixRangeText(af) }}</span>
            <span class="mt-0.5 block text-[9px] text-ink-faint">{{ affixSlotsText(af) }}</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { AffixDef } from '@/types'
  import { AFFIXES, affixesByRarity, affixDef } from '@/data/affixes'
  import { tint } from '@/utils/colorToken'
  import {
    affixRangeEnds,
    affixRangeText,
    affixRankText,
    affixRarityColor,
    affixRarityLabel,
    affixSlotsText
  } from '@/ui/affixCodexText'

  const props = defineProps<{ focus: string | null }>()
  const emit = defineEmits<{ 'update:focus': [id: string | null] }>()

  /** 全表:承接随机词条池,按稀有度分组成组 */
  const groups = computed(() => affixesByRarity(AFFIXES))

  const focusDef = computed<AffixDef | undefined>(() => (props.focus ? affixDef(props.focus) : undefined))
  const color = computed(() => (focusDef.value ? affixRarityColor(focusDef.value) : 'currentColor'))
  const label = computed(() => (focusDef.value ? affixRarityLabel(focusDef.value) : ''))
  const rangeText = computed(() => (focusDef.value ? affixRangeText(focusDef.value) : ''))
  const rangeEnds = computed(() => (focusDef.value ? affixRangeEnds(focusDef.value) : { lo: 0, hi: 0 }))
  const slotsText = computed(() => (focusDef.value ? affixSlotsText(focusDef.value) : ''))
  const rankText = computed(() => (focusDef.value ? affixRankText(focusDef.value) : null))
</script>
