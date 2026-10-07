<template>
  <div class="flex flex-col gap-2">
    <!-- 价签就是实扣:与服务同读 plan.cost -->
    <p v-if="flow.plan" class="flex items-baseline justify-between gap-2 text-[11px]">
      <span class="shrink-0 text-ink-faint">{{ TRANSFER_LABELS.cost }}</span>
      <span class="text-right tabular text-ink-soft">
        <span class="whitespace-nowrap">{{ transferStoneText(flow.plan.cost.stone) }}</span> ·
        <span class="whitespace-nowrap">尘×{{ flow.plan.cost.dust }}</span>
      </span>
    </p>
    <!-- 二步确认:第一步只亮出要做的事;计划任一项改了,确认自动作废 -->
    <template v-if="flow.armed && flow.plan">
      <p class="text-[11px] leading-relaxed text-ink-soft">{{ flow.movedText }} → {{ flow.targetName }}</p>
      <p v-if="flow.replacedText" class="text-[11px] leading-relaxed text-cinnabar">{{ TRANSFER_LABELS.replace }} {{ flow.replacedText }}</p>
      <p class="text-[11px] leading-relaxed text-cinnabar">
        {{ TRANSFER_LABELS.sourceLose }}「{{ movedName }}」<template v-if="flow.sourceWorn"> · {{ TRANSFER_LABELS.equipped }}</template>
      </p>
      <div class="flex gap-2">
        <button type="button" class="btn-ghost" @click="flow.disarm()">{{ TRANSFER_LABELS.cancel }}</button>
        <button type="button" class="btn-seal flex-1" @click="flow.confirm()">{{ TRANSFER_LABELS.confirm }}</button>
      </div>
    </template>
    <div v-else class="flex gap-2">
      <button type="button" class="btn-ghost" @click="onBack">{{ TRANSFER_LABELS.back }}</button>
      <!-- 禁用时按钮上的字就是原因:还差哪一步 / 被什么挡住 / 缺哪样 -->
      <button type="button" class="btn-seal flex-1" :disabled="flow.blockLabel !== null" @click="flow.arm()">
        {{ flow.blockLabel ?? TRANSFER_LABELS.go }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { affixDef } from '@/data/affixes'
  import { TRANSFER_LABELS, transferStoneText } from '@/ui/affixTransferText'
  import type { AffixTransferFlow } from '@/composables/useAffixTransfer'

  const props = defineProps<{ flow: AffixTransferFlow }>()
  const emit = defineEmits<{ back: [] }>()

  const movedName = computed(() => (props.flow.plan ? (affixDef(props.flow.plan.moved.id)?.name ?? '') : ''))

  /** 「取消」与「返回」同一个位置:刚取消完的那一下连点不该顺手退出转移 */
  function onBack(): void {
    if (props.flow.settling()) return
    emit('back')
  }
</script>
