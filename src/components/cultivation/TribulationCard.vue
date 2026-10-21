<template>
  <!-- 劫势摘要卡:与「进阶成功率」同排,只报劫名与一句话劫势 -->
  <div class="rounded-md bg-paper-deep/60 px-2.5 py-1.5">
    <p class="text-[10px] text-ink-faint">{{ needTribulation ? '此劫' : '渡劫' }}</p>
    <template v-if="tribPlan">
      <p class="tabular text-[16px] font-kai leading-tight" :class="PLAN_COLOR[tribPlan.verdict]">
        {{ tribPlan.title }}
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
  import { verdictLabel } from '@/core/tribulationDecision'
  import { useTribulation } from '@/composables/useTribulation'

  /** 劫势摘要卡 —— 自 CultivationView 迁入;读数与详情面板同走 useTribulation */
  const props = defineProps<{ needTribulation: boolean }>()
  const { PLAN_COLOR, tribPlan } = useTribulation(() => props.needTribulation)
</script>
