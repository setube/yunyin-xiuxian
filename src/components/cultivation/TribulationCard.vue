<template>
  <!-- 与「进阶成功率」同排:只报劫名与一句劫势 -->
  <div class="rounded-md bg-paper-deep/60 px-2.5 py-1.5">
    <p class="text-[10px] text-ink-faint">{{ needTribulation ? '此劫' : '渡劫' }}</p>
    <template v-if="tribPlan">
      <!-- 劫印:五种劫型各一枚单字印(雷/流/魂/躯/压),数据里早备好而界面一处未用 -->
      <p class="flex items-center gap-1.5">
        <span
          v-if="mark.seal"
          role="img"
          class="grid h-4 w-4 shrink-0 place-items-center rounded-[2px] bg-violet-ink font-kai text-[10px] leading-none seal-face"
          :aria-label="mark.label"
          :title="mark.label"
          >{{ mark.seal }}</span
        >
        <span class="tabular text-[16px] font-kai leading-tight" :class="PLAN_COLOR[tribPlan.verdict]">
          {{ tribPlan.title }}
        </span>
      </p>
      <p class="text-[10px] text-ink-faint">
        劫势:{{ verdictLabel(tribPlan.verdict) }}
        <template v-if="tribPlan.risks.length"> · {{ tribPlan.risks[0] }}</template>
      </p>
    </template>
    <p v-else class="text-[16px] font-kai leading-tight text-ink-faint">非大关</p>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { verdictLabel } from '@/core/tribulationDecision'
  import { useTribulation } from '@/composables/useTribulation'
  import { tribMarkOf } from '@/ui/tribMark'

  /** 读数与详情面板同走 useTribulation */
  const props = defineProps<{ needTribulation: boolean }>()
  const { PLAN_COLOR, tribPlan } = useTribulation(() => props.needTribulation)
  /** 劫印:五种劫型各一枚单字印(见 ui/tribMark) */
  const mark = computed(() => tribMarkOf(tribPlan.value?.def))
</script>
