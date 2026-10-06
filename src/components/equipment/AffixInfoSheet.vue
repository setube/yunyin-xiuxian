<template>
  <!--
    topmost:装备详情自己就是 top(z-60)。叠在它之上看词条信息,少这一档会沉到详情下面。
    玩家反馈「层级不对、弹在下面」—— 详情盖过列表用 z-60,弹框盖详情就得 z-70。
  -->
  <BaseModal
    :open="open"
    :title="def?.name ?? '词条'"
    :topmost="true"
    closable
    @close="emit('close')"
  >
    <div v-if="def" class="space-y-2.5">
      <div class="flex items-center gap-2">
        <span
          class="shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-relaxed"
          :style="{ background: tint(color, 0.15), color }"
        >
          {{ label }}
        </span>
        <span class="truncate font-kai text-[16px] tracking-[0.2em]" :style="{ color }">{{ def.name }}</span>
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
    <template #footer>
      <div v-if="targetable" class="grid grid-cols-2 gap-2">
        <button class="btn-ghost !py-2 !text-[11px]" :disabled="!selected && !canSelect" @click="emit('toggle-target', affixId)">
          {{ selected ? '取消自动重铸目标' : '设为自动重铸目标' }}
        </button>
        <button class="btn-seal !py-2 !text-[11px]" @click="emit('close')">收 下</button>
      </div>
      <button v-else class="btn-seal w-full !py-2 !text-[11px]" @click="emit('close')">收 下</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { affixDef } from '@/data/affixes'
  import { tint } from '@/utils/colorToken'
  import {
    affixRangeEnds,
    affixRangeText,
    affixRankText,
    affixRarityColor,
    affixRarityLabel,
    affixSlotsText
  } from '@/ui/affixInfoText'
  import BaseModal from '@/components/common/BaseModal.vue'

  const props = defineProps<{
    open: boolean
    /** 要看哪条就传哪条的 id —— 词条信息只以「点哪条弹哪条」的方式出现 */
    affixId: string
    /** 只在自动重铸语境传:页脚多一个「设为目标 / 取消」 */
    targetable?: boolean
    /** 这条当前是不是已设为自动重铸目标(决定按钮文案与可否再设) */
    selected?: boolean
    /** 目标还没满三个时才能再设(满的位子给「取消」留着) */
    canSelect?: boolean
  }>()
  const emit = defineEmits<{ close: []; 'toggle-target': [id: string] }>()

  const def = computed(() => affixDef(props.affixId))
  const color = computed(() => (def.value ? affixRarityColor(def.value) : 'currentColor'))
  const label = computed(() => (def.value ? affixRarityLabel(def.value) : ''))
  const rangeText = computed(() => (def.value ? affixRangeText(def.value) : ''))
  const rangeEnds = computed(() => (def.value ? affixRangeEnds(def.value) : { lo: 0, hi: 0 }))
  const slotsText = computed(() => (def.value ? affixSlotsText(def.value) : ''))
  const rankText = computed(() => (def.value ? affixRankText(def.value) : null))
</script>
