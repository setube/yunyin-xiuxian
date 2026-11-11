<template>
  <div class="ink-divider my-4" />
  <div class="flex items-center justify-between text-[12px] text-ink-soft">
    <span>下一步:{{ btInfo.targetLabel }}</span>
  </div>
  <!-- 天劫步不显示「进阶成功率」:渡劫走 runTribulation 逐波推演,不掷这个率(见 breakthrough.attemptBreakthrough) -->
  <div class="mt-2 grid gap-2" :class="btInfo.needTribulation ? 'grid-cols-1' : 'grid-cols-2'">
    <div v-if="!btInfo.needTribulation" class="rounded-md bg-paper-deep/60 px-2.5 py-1.5">
      <!-- -my-1 py-2:触面抬到 31px(layout-check 查),负外边距抵回视觉位移 -->
      <button class="-my-1 flex w-full items-baseline justify-between gap-1 py-2 text-left" @click="rateOpen = true">
        <span class="text-[10px] text-ink-faint">进阶成功率</span>
        <span class="text-[9px] text-ink-faint">来路 →</span>
      </button>
      <p class="tabular text-[16px] font-kai leading-tight" :class="rateView.good ? 'text-jade' : 'text-cinnabar'">
        {{ rateView.text }}
      </p>
    </div>
    <TribulationCard :need-tribulation="btInfo.needTribulation" />
  </div>

  <TribulationDetail :need-tribulation="btInfo.needTribulation" :qi-cost="btInfo.qiCost" />

  <!-- 突破准备:静坐调息 / 服聚气丹(无劫突破时,一次性加成) -->
  <div v-if="!btInfo.needTribulation" class="mt-2 flex items-start gap-2.5 rounded-md border border-ink/10 bg-paper-deep/50 px-2.5 py-2">
    <span class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-jade/40 bg-jade/15 font-kai text-[12px] text-ink">备</span>
    <div class="min-w-0 grow">
      <div class="flex items-center justify-between text-[10px] text-ink-faint">
        <span>突破准备(一次有效)</span>
        <!-- 倒计时用定宽的 formatCountdown,不用 formatDuration(宽度逐秒变,整行会跳) -->
        <span v-if="btInfo.prep.sitting" class="text-amber-ink tabular">
          调息中 · <span class="countdown-slot">{{ formatCountdown(btInfo.prep.remainingSec) }}</span>
        </span>
        <span v-else-if="btInfo.prep.ready" class="text-jade">加成 +{{ Math.round(btInfo.prep.bonus * 100) }}% 就绪</span>
      </div>
      <!-- 允许换行:chip-ink 是 nowrap 胶囊,320px 窄屏放不下两枚 -->
      <div v-if="!btInfo.prep.sitting && !btInfo.prep.ready" class="mt-1.5 flex flex-wrap gap-1.5">
        <button type="button" class="chip-ink chip-ink-wrap !py-1.5 text-[10px]" @click="startPrep('meditate')">
          {{ prepMeditate.label }} · {{ Math.round(prepMeditate.duration / 60) }} 分钟
          +{{ Math.round(prepMeditate.bonusRate * 100) }}%
        </button>
        <button type="button" class="chip-ink chip-ink-wrap !py-1.5 text-[10px]" :disabled="!prepCanPill" @click="startPrep('pill')">
          {{ prepPill.label }} · 灵石 {{ prepPillCost }} +{{ Math.round(prepPill.bonusRate * 100) }}%
          <!-- 拒因用朱砂:.chip-ink:disabled 已把整枚胶囊压成 ink-faint,拒因再写同色就等于没写 -->
          <span v-if="!prepCanPill" class="text-cinnabar">({{ prepPillDisabledLabel(formatGap(prepPillShort)) }})</span>
        </button>
      </div>
    </div>
  </div>
  <button
    class="btn-seal mt-3 w-full !py-3"
    :class="{ 'animate-glow-pulse pulse-ready': btInfo.ready }"
    :disabled="!btInfo.ready"
    @click="attemptBreakthrough()"
  >
    {{ btInfo.ready ? (btInfo.needTribulation ? '引 劫 突 破' : '尝 试 突 破') : btInfo.reason }}
  </button>

  <BaseModal :open="rateOpen" title="进阶成功率 · 来路" @close="rateOpen = false">
    <!-- 来路与结算同一批(越过上下限另有差额行) -->
    <div class="space-y-0.5 rounded-md bg-paper-deep/60 px-2.5 py-2 text-[11px]">
      <p v-for="part in rateView.rows" :key="part.label" class="flex justify-between">
        <span class="text-ink-faint">{{ part.label }}</span>
        <span class="tabular" :class="part.value > 0 ? 'text-azure' : 'text-cinnabar'">{{ signedPercent(part.value) }}</span>
      </p>
      <p class="flex justify-between border-t border-ink/8 pt-1">
        <span class="text-ink-faint">合计</span>
        <span class="tabular font-kai text-[12px]" :class="rateView.good ? 'text-jade' : 'text-cinnabar'">{{ rateView.text }}</span>
      </p>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import { attemptBreakthrough, breakthroughInfo } from '@/core/breakthrough'
  import { breakthroughPrepShortfall, prepareBreakthrough } from '@/core/earlyGameService'
  import { gnZero } from '@/utils/gnum'
  import { formatCountdown, formatGap } from '@/utils/format'
  import { signedPercent } from '@/data/statNames'
  import { BREAKTHROUGH_PREP_OPTIONS } from '@/data/earlyGame'
  import { breakthroughRateView, prepPillDisabledLabel, prepPillShortToast } from '@/ui/cultivationText'
  import { useNow } from '@/composables/useNow'
  import TribulationCard from './TribulationCard.vue'
  import TribulationDetail from './TribulationDetail.vue'
  import BaseModal from '@/components/common/BaseModal.vue'

  /** 破境卡:成功率与备药判据读 core/breakthrough 与 BREAKTHROUGH_PREP_OPTIONS,视图不写第二份 */
  const ui = useUiStore()
  const now = useNow()

  const rateOpen = ref(false)
  // 倒计时与「坐满转就绪」走 1 秒游戏钟,不借 5 秒才刷新的修行时长
  const btInfo = computed(() => breakthroughInfo(now.value))
  // 卡面率与来路合计同一取整:各行相加等于合计
  const rateView = computed(() => breakthroughRateView(btInfo.value.rateParts))

  const prepMeditate = BREAKTHROUGH_PREP_OPTIONS.find(o => o.id === 'meditate')!
  const prepPill = BREAKTHROUGH_PREP_OPTIONS.find(o => o.id === 'pill')!
  const prepPillCost = prepPill.cost?.stone ?? 0
  const prepPillShort = computed(() => breakthroughPrepShortfall('pill') ?? gnZero())
  const prepCanPill = computed(() => prepPillShort.value.m === 0)

  function startPrep(option: 'meditate' | 'pill'): void {
    if (prepareBreakthrough(option)) {
      ui.toast(option === 'meditate' ? '开始调息' : '加成就绪', 'info')
    } else {
      ui.toast(prepPillShortToast(formatGap(prepPillShort.value)), 'warn')
    }
  }
</script>
