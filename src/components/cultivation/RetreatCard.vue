<template>
  <div class="card-ink flex items-start gap-3 px-4 py-3" :class="retreating ? 'bg-amber-ink/6' : ''">
    <span
      class="grid h-9 w-9 shrink-0 place-items-center rounded-md font-kai text-[15px]"
      :class="retreating ? 'animate-breathe border border-amber-ink/40 bg-amber-ink/15 text-ink' : 'border border-jade/40 bg-jade/15 text-ink'"
    >静</span>
    <div class="min-w-0 grow">
      <div class="flex items-center justify-between">
        <span class="text-[11px] text-ink-soft">闭关参悟</span>
        <span v-if="retreating" class="text-[10px] text-amber-ink tabular">
          闭关中 · <span class="countdown-slot">{{ formatCountdown(retreatRemaining) }}</span>
        </span>
      </div>
      <p class="mt-0.5 text-[10px] text-ink-faint">
        {{ retreatSpan }} · 修炼 +{{ retreatPct }}% · 期间不可历练
      </p>
      <p v-if="retreating && retreatSoFarGain" class="mt-1 text-[10px] text-jade">{{ retreatSoFarGain }}</p>
      <p v-if="!retreating" class="mt-1 text-[10px] text-jade">{{ retreatGain }}</p>
      <button v-if="!retreating" type="button" class="chip-ink mt-2 w-full !py-1.5 text-[11px]" @click="beginRetreat">
        闭关
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { startRetreat, isRetreating, getRetreatRemainingSec } from '@/core/earlyGameService'
  import { retreatGainText, retreatGainedText } from '@/core/progress'
  import { buffDef } from '@/data/buffs'
  import { classicalDuration } from '@/data/timeUnits'
  import { formatCountdown } from '@/utils/format'
  import { useNow } from '@/composables/useNow'

  /**
   * 状态与倒计时接 earlyGameService(buff 为真相源)。
   * 时长与加成取自 buffs.ts 的 retreat 本体,文案数字不手抄。
   */
  const ui = useUiStore()
  const now = useNow()

  const retreating = computed(() => isRetreating())
  const retreatRemaining = computed(() => getRetreatRemainingSec(now.value))
  const retreatDef = buffDef('retreat')
  const retreatPct = Math.round((retreatDef?.mods.cultivationSpeed ?? 0) * 100)
  const retreatSpan = classicalDuration(retreatDef?.durationSec ?? 0)
  const retreatGain = computed(() => retreatGainText())
  /** 「已多得」:速率与预览同一份 */
  const retreatSoFarGain = computed(() => {
    if (!retreating.value) return ''
    const dur = retreatDef?.durationSec ?? 0
    if (!(dur > 0)) return ''
    return retreatGainedText(Math.max(0, dur - retreatRemaining.value))
  })

  function beginRetreat(): void {
    if (startRetreat()) {
      ui.toast('已闭关', 'info')
    }
  }
</script>
