<template>
  <button
    class="relative aspect-square rounded-md border transition-transform active:scale-98"
    :style="{ borderColor: tint(quality.color, tier.border), background: tint(quality.color, tier.bg) }"
    :data-uid="props.item.uid"
    @click="emit('open', props.item.uid)"
  >
    <QualityAura :quality="props.item.quality" compact />
    <span v-if="props.equipped" class="absolute left-0.5 top-0.5 font-kai text-[8px] leading-none text-jade">佩</span>
    <span v-if="props.item.locked" class="absolute right-0.5 top-0.5 leading-none text-ink-faint">
      <GameIcon name="lock" :size="8" />
    </span>
    <!-- 天/仙/神盖章:色弱也能靠形状认出高档 -->
    <span v-if="rare" class="absolute right-0.5 top-3 leading-none">
      <QualitySeal :quality="props.item.quality" :size="14" />
    </span>
    <!-- 共鸣件(两件才亮,见 core/equipSet) -->
    <span
      v-if="setName"
      class="absolute bottom-0.5 left-1 font-kai text-[8px] leading-none text-violet-ink"
      :title="setName"
    >
      共
    </span>

    <span class="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1">
      <GameIcon :name="template?.icon ?? 'sword'" :size="20" :style="{ color: quality.color }" />
      <span
        class="w-full truncate text-center text-[9px] leading-tight"
        :class="{ 'q-plaque': plaque }"
        :style="{ color: quality.color }"
      >
        {{ template?.name ?? '?' }}
      </span>
    </span>

    <!-- 满级:与品阶光环分开的一套形状(顶边横杠),见 ui/masteryMark -->
    <span v-if="mastery" class="mastery-bar" :title="mastery.label" />
    <!-- role="img":满级时那句「强化已至上限 +10」须读得出;裸 span 属 generic,不接可访问名 -->
    <span
      v-if="props.item.level > 0"
      role="img"
      class="absolute bottom-0.5 right-1 text-[9px] leading-none text-gold-ink tabular"
      :aria-label="mastery ? `${mastery.label} +${props.item.level}` : undefined"
    >
      +{{ props.item.level }}
    </span>
    <!-- 自定标记(≤4 字):底边三枚角标共处,左右各让 24px(left-6/right-6),否则盖住「共」与「+N」 -->
    <span
      v-if="props.item.note"
      class="absolute bottom-0.5 left-6 right-6 truncate text-center text-[8px] leading-none text-ink-faint"
    >
      {{ props.item.note }}
    </span>
  </button>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { EquipmentInstance } from '@/types'
  import { equipmentTemplate } from '@/data/equipment'
  import { qualityDef } from '@/data/qualities'
  import { tint } from '@/utils/colorToken'
  import { equipSetDef } from '@/core/equipSet'
  import { isRareQuality, qualityTierStyle } from '@/ui/qualityTier'
  import { qualityAura } from '@/ui/qualityAura'
  import { equipMastery } from '@/ui/masteryMark'
  import { equipLevelCap } from '@/core/forge'
  import GameIcon from '@/components/common/GameIcon.vue'
  import QualitySeal from '@/components/common/QualitySeal.vue'
  import QualityAura from '@/components/common/QualityAura.vue'

  const props = defineProps<{ item: EquipmentInstance; equipped?: boolean }>()
  const emit = defineEmits<{ open: [uid: string] }>()

  const template = computed(() => equipmentTemplate(props.item.templateId))
  const quality = computed(() => qualityDef(props.item.quality))
  const tier = computed(() => qualityTierStyle(props.item.quality))
  const rare = computed(() => isRareQuality(props.item.quality))
  const plaque = computed(() => qualityAura(props.item.quality).plaque)
  // 上限随炼器台等级变,取值在组件里,判定在 ui/masteryMark
  const mastery = computed(() => equipMastery(props.item.level, equipLevelCap()))
  const setName = computed(() => (template.value?.set ? equipSetDef(template.value.set)?.name ?? '' : ''))
</script>
