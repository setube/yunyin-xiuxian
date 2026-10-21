<template>
  <!-- Phase 32.0 劫势详情(决意前评估:风险维度 + 建议,信息给足,决定留给玩家) -->
  <div v-if="tribPlan" class="mt-2 rounded-md border border-violet-ink/25 bg-violet-ink/5 px-3 py-2">
    <!-- 总评:劫名一眼可读,形态(逐道加重/起手最重)挪到行尾 —— 不再以十行小字开场 -->
    <div class="flex items-baseline gap-2">
      <p class="grow text-[12px] font-kai leading-snug text-violet-ink">{{ tribPlan.desc }}</p>
      <span class="shrink-0 text-[10px] text-ink-faint">{{ tribPlan.def.waveShape === 'frontLoaded' ? '起手两道最重' : '逐道加重' }}</span>
    </div>

    <!-- 准备四维:一行四格星级槽,缺口一眼可见(0 星置灰,不熟也不糊弄) -->
    <div class="mt-2 grid grid-cols-4 gap-1.5">
      <div v-for="(name, key) in PREP_NAMES" :key="key" class="rounded bg-paper-deep/60 px-0.5 py-1 text-center">
        <p class="text-[9px] text-ink-faint">{{ name }}</p>
        <p class="tabular text-[12px] font-kai" :class="tribPlan.prep[key] === 0 ? 'text-ink-faint' : 'text-ink-soft'">{{ PREP_STARS[tribPlan.prep[key]] }}</p>
      </div>
    </div>

    <div class="ink-divider my-2" />
    <!-- 此劫账单:四项百分比指标两两并排,别有十逗号长句了 -->
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
        <span v-if="tribLedger.lowHpReduction > 0" class="text-ink-faint">濒危垂危再 {{ formatPercent(tribLedger.lowHpReduction, 0) }}</span>
      </p>
      <p class="flex flex-col gap-0.5 text-[10px] tabular">
        <span class="text-ink-faint">开劫护持</span>
        <span class="text-ink-soft leading-tight">
          {{ formatPercent(tribLedger.guard, 0) }}
          <span class="text-ink-faint">(气血折 {{ formatPercent(tribLedger.statGuard, 0) }})</span>
        </span>
      </p>
    </div>
    <p class="mt-2 text-[10px] leading-relaxed text-ink-faint">
      攻伐之力不助渡劫;防御与气血按当下境界另算,再厚也只能硬抗一隅,余者靠抗性、减伤与恢复;晋升与准备只能帮小进阶,渡劫大关不认。
    </p>

    <!-- 界膜之劫:跨界规则加难(见 TRIB_WORLD_STEP_STAT_FOLD),决意之前必须说清 -->
    <div v-if="worldStep" class="mt-2 rounded-md border border-cinnabar/30 bg-cinnabar/5 px-2.5 py-2">
      <p class="text-[10px] leading-relaxed text-cinnabar">界膜之劫:跨界这一关血肉之厚一概不算 —— 防御与气血折算出的抗性、开劫护持在此作废,只认词条与准备。</p>
    </div>
    <!-- 天威长相:道数随境界涨、单波逐道加重,摊出来才知道护持该留到哪一段 -->
    <p v-if="tribWeatherLine" class="mt-1.5 text-[10px] leading-relaxed text-cinnabar">{{ tribWeatherLine }}</p>
    <p v-if="tribWave" class="mt-1 text-[10px] text-ink-faint tabular">
      共 {{ tribWave.waves }} 道,单波 {{ formatPercent(tribWave.min, 0) }}–{{ formatPercent(tribWave.max, 0) }} 最大生命(合计约 {{ formatPercent(tribWave.total, 0) }})
    </p>

    <div class="ink-divider my-1.5" />
    <p class="text-[10px] leading-relaxed text-ink-faint"><span class="text-ink-soft">主要风险:</span>{{ tribPlan.risks.join('; ') }}</p>
    <p class="mt-1 text-[10px] leading-relaxed text-ink-faint">{{ tribPlan.advice }}</p>
    <!-- Phase 32.2:灵根解开的那条路——说明这道劫为何对你不太一样(留一线,不是免死) -->
    <p v-if="reliefRoots.length" class="mt-1.5 text-[10px] leading-relaxed text-jade">
      灵根相应:{{ reliefRoots.map(e => ELEMENTS[e].name).join('、') }} —— 此劫为你留了一线,能走到哪一步仍看自身准备。
    </p>
  </div>
  <p class="mt-1 flex items-center gap-1.5 text-[11px] text-ink-faint tabular">
    耗灵气 {{ formatNum(qiCost) }}
    <!-- 大关/大槛落在小印章上,与全页「静/备/主/秘」一套印章语言呼应,不再是一行朱砂裸字 -->
    <span v-if="needTribulation" class="rounded bg-violet-ink/10 px-1.5 py-0.5 text-[10px] leading-none text-violet-ink">
      大关 · 渡劫
    </span>
  </p>
</template>

<script setup lang="ts">
  import { ELEMENTS } from '@/data/linggen'
  import { formatNum, formatPercent } from '@/utils/format'
  import { useTribulation } from '@/composables/useTribulation'

  /**
   * 劫势详情 —— 自 CultivationView 迁入。
   *
   * 与摘要卡同读 useTribulation:两处若各算一遍,迟早出现「卡上写着有护持、
   * 点开又说没有」。界面只负责摊开,数全来自 core/tribulationDecision。
   */
  const props = defineProps<{ needTribulation: boolean; qiCost: number }>()
  const { tribPlan, tribLedger, worldStep, tribWeatherLine, tribWave, reliefRoots } = useTribulation(() => props.needTribulation)

  const PREP_NAMES = { guard: '护持', sustain: '恢复', resist: '抗性', burst: '爆发' } as const
  const PREP_STARS = ['·', '✧', '✧✧', '✧✧✧'] as const
</script>
