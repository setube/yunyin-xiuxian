<template>
  <div v-if="tribPlan" class="mt-2 rounded-md border border-violet-ink/25 bg-violet-ink/5 px-3 py-2">
    <div class="flex items-baseline gap-2">
      <p class="grow text-[12px] font-kai leading-snug text-violet-ink">{{ tribPlan.desc }}</p>
      <span class="shrink-0 text-[10px] text-ink-faint">{{ tribPlan.def.waveShape === 'frontLoaded' ? '起手两道最重' : '逐道加重' }}</span>
    </div>

    <div class="mt-2 grid grid-cols-4 gap-1.5">
      <div v-for="(name, key) in PREP_NAMES" :key="key" class="rounded bg-paper-deep/60 px-0.5 py-1 text-center">
        <p class="text-[9px] text-ink-faint">{{ name }}</p>
        <p class="tabular text-[12px] font-kai" :class="tribPlan.prep[key] === 0 ? 'text-ink-faint' : 'text-ink-soft'">{{ PREP_STARS[tribPlan.prep[key]] }}</p>
      </div>
    </div>

    <div class="ink-divider my-2" />
    <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
      <p class="flex flex-col gap-0.5 text-[10px] tabular">
        <span class="text-ink-faint">天劫抗性</span>
        <span class="text-ink-soft leading-tight">
          {{ formatPercent(tribLedger.resist, 0) }}
          <span class="text-ink-faint">(防御折 {{ formatPercent(tribLedger.statResist, 0) }})</span>
        </span>
      </p>
      <p class="flex items-baseline justify-between gap-2 text-[10px] tabular">
        <span class="text-ink-faint">每波恢复</span>
        <span class="text-ink-soft">{{ formatPercent(tribLedger.sustain, 1) }}</span>
      </p>
      <p class="flex flex-col gap-0.5 text-[10px] tabular">
        <span class="flex items-baseline justify-between gap-2">
          <span class="text-ink-faint">减伤</span>
          <span class="text-ink-soft">{{ formatPercent(tribLedger.reduction, 0) }}</span>
        </span>
        <span v-if="tribLedger.lowHpReduction > 0" class="text-ink-faint">濒危再 {{ formatPercent(tribLedger.lowHpReduction, 0) }}</span>
      </p>
      <p class="flex flex-col gap-0.5 text-[10px] tabular">
        <span class="text-ink-faint">开劫护持</span>
        <span class="text-ink-soft leading-tight">
          {{ formatPercent(tribLedger.guard, 0) }}
          <span class="text-ink-faint">(气血折 {{ formatPercent(tribLedger.statGuard, 0) }})</span>
        </span>
      </p>
    </div>
    <p class="mt-2 text-[10px] leading-relaxed text-ink-faint">不计:攻伐、进阶成功率、突破准备 · 防御/气血折算封顶</p>

    <!-- 界膜之劫(TRIB_WORLD_STEP_STAT_FOLD):须在决意前写明 -->
    <div v-if="worldStep" class="mt-2 rounded-md border border-cinnabar/30 bg-cinnabar/5 px-2.5 py-2">
      <p class="text-[10px] leading-relaxed text-cinnabar">界膜之劫:防御/气血折算作废</p>
    </div>
    <p v-if="tribWeatherLine" class="mt-1.5 text-[10px] leading-relaxed text-cinnabar">{{ tribWeatherLine }}</p>
    <p v-if="tribWave" class="mt-1 text-[10px] text-ink-faint tabular">
      共 {{ tribWave.waves }} 道,单波 {{ formatPercent(tribWave.min, 0) }}–{{ formatPercent(tribWave.max, 0) }} 最大生命(合计约 {{ formatPercent(tribWave.total, 0) }})
    </p>
    <!--
      逐波推演:决意前最该知道的是「最险会掉到哪」与「第几道不支」。
      core 的 traceTribulation 早算出了这两项,原只用来定「劫势」一档、算完即弃 ——
      界面上只有一句结论,没有结论的来路(见 ui/tribForecast)。
    -->
    <div v-if="forecast" class="mt-2">
      <div class="flex items-baseline justify-between gap-2 text-[10px]">
        <span class="text-ink-faint">推演水位</span>
        <span class="tabular" :class="FORECAST_COLOR[forecast.tone]">{{ forecast.line }}</span>
      </div>
      <span class="trib-forecast mt-1" :class="`trib-forecast--${forecast.tone}`" aria-hidden="true">
        <i :style="{ width: `${forecast.lowPct * 100}%` }" />
      </span>
    </div>

    <div class="ink-divider my-1.5" />
    <p class="text-[10px] leading-relaxed text-ink-faint"><span class="text-ink-soft">主要风险:</span>{{ tribPlan.risks.join('; ') }}</p>
    <p v-if="reliefRoots.length" class="mt-1.5 text-[10px] leading-relaxed text-jade">
      灵根相应:{{ reliefRoots.map(e => ELEMENTS[e].name).join('、') }}
    </p>
  </div>
  <p class="mt-1 flex items-center gap-1.5 text-[11px] text-ink-faint tabular">
    耗灵气 {{ formatNum(qiCost) }}
    <span v-if="needTribulation" class="rounded border border-violet-ink/40 bg-violet-ink/10 px-1.5 py-0.5 text-[10px] leading-none text-ink">
      大关 · 渡劫
    </span>
  </p>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { ELEMENTS } from '@/data/linggen'
  import { formatNum, formatPercent } from '@/utils/format'
  import { useTribulation } from '@/composables/useTribulation'
  import { forecastOf, type TribForecast } from '@/ui/tribForecast'

  /** 与摘要卡同读 useTribulation,不各算一份;数全来自 core/tribulationDecision */
  const props = defineProps<{ needTribulation: boolean; qiCost: number }>()
  const { tribPlan, tribLedger, worldStep, tribWeatherLine, tribWave, reliefRoots } = useTribulation(() => props.needTribulation)

  /** 逐波推演读数(见 ui/tribForecast);道数取 tribWave,不另数 */
  const FORECAST_COLOR: Record<TribForecast['tone'], string> = {
    safe: 'text-jade',
    graze: 'text-amber-ink',
    danger: 'text-cinnabar'
  }
  const forecast = computed(() => forecastOf(tribPlan.value, tribWave.value?.waves ?? 0))

  const PREP_NAMES = { guard: '护持', sustain: '恢复', resist: '抗性', burst: '爆发' } as const
  const PREP_STARS = ['·', '✧', '✧✧', '✧✧✧'] as const
</script>
