<template>
  <!-- Phase 28 闭关:5 分钟 +150% 修炼,期间禁止历练(数值唯一来源 = buffs.ts retreat + earlyGameService) -->
  <div class="card-ink flex items-start gap-3 px-4 py-3" :class="retreating ? 'bg-amber-ink/6' : ''">
    <!-- 静修印:与全页印章同一块语言;闭关中转为琥珀并在原地呼吸,静而有觉 -->
    <span
      class="grid h-9 w-9 shrink-0 place-items-center rounded-md font-kai text-[15px]"
      :class="retreating ? 'animate-breathe bg-amber-ink/15 text-amber-ink' : 'bg-jade/15 text-jade'"
    >静</span>
    <div class="min-w-0 grow">
      <div class="flex items-center justify-between">
        <span class="text-[11px] text-ink-soft">闭关参悟</span>
        <span v-if="retreating" class="text-[10px] text-amber-ink tabular">
          闭关中 · <span class="countdown-slot">{{ formatCountdown(retreatRemaining) }}</span>
        </span>
      </div>
      <p class="mt-0.5 text-[10px] text-ink-faint">
        静坐{{ retreatSpan }},修炼速度 +{{ retreatPct }}%;闭关期间无法外出历练。
      </p>
      <!-- 闭关中:倒计时旁边补一枚「已多得」的活数 —— 与预览行同一份每多得速率,一眼看见时间没有白熬 -->
      <p v-if="retreating && retreatSoFarGain" class="mt-1 text-[10px] text-jade">{{ retreatSoFarGain }}</p>
      <p v-if="!retreating" class="mt-1 text-[10px] text-jade">{{ retreatGain }}</p>
      <button v-if="!retreating" type="button" class="chip-ink mt-2 w-full !py-1.5 text-[11px]" @click="beginRetreat">
        闭关 · {{ retreatMinutes }}分钟 修炼 +{{ retreatPct }}%
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
   * 闭关卡 —— 自 CultivationView 迁入(沿用 xian 的同名拆法)。
   *
   * 状态与倒计时接 earlyGameService(buff 为真相源,重载后依旧可信);
   * 时长与加成取自 buffs.ts 的 retreat 本体,文案里的数字不在视图手抄。
   */
  const ui = useUiStore()
  const now = useNow()

  const retreating = computed(() => isRetreating())
  const retreatRemaining = computed(() => getRetreatRemainingSec(now.value))
  const retreatDef = buffDef('retreat')
  const retreatMinutes = Math.round((retreatDef?.durationSec ?? 0) / 60)
  const retreatPct = Math.round((retreatDef?.mods.cultivationSpeed ?? 0) * 100)
  /**
   * 静坐时长的古今对照 —— 从 buff 本体现算,不再手打「一炷香」。
   * 闭关实测 300s(5 分钟),而「一炷香」是 30 分钟:`classicalDuration(300)` 给
   * 「将近一刻(5 分钟)」,既守数据又仍给玩家一个现代读数。
   */
  const retreatSpan = classicalDuration(retreatDef?.durationSec ?? 0)
  /** 闭关「约多得」修为预览 —— 由 progress.retreatGainText 与 buff 本体同源算出;境界涨了跟着重算 */
  const retreatGain = computed(() => retreatGainText())
  /** 闭关中的「已多得」活数 —— 已走时长由 retreatRemaining 反推,速率与预览同一份 */
  const retreatSoFarGain = computed(() => {
    if (!retreating.value) return ''
    const dur = retreatDef?.durationSec ?? 0
    if (!(dur > 0)) return ''
    return retreatGainedText(Math.max(0, dur - retreatRemaining.value))
  })

  function beginRetreat(): void {
    if (startRetreat()) {
      ui.toast('你封洞闭关,心不外骛', 'info')
    }
  }
</script>
