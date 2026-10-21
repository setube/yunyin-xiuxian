<template>
  <div class="ink-divider my-4" />
  <div class="flex items-center justify-between text-[12px] text-ink-soft">
    <span>下一步:{{ btInfo.targetLabel }}</span>
  </div>
  <!--
    天劫步不显示「突破成功率」:那条路根本不掷这个骰子(见 breakthrough.attemptBreakthrough,
    渡劫走 runTribulation 的逐波推演),摆出来只会让人以为还有一个可以堆的概率。
  -->
  <div class="mt-2 grid gap-2" :class="btInfo.needTribulation ? 'grid-cols-1' : 'grid-cols-2'">
    <div v-if="!btInfo.needTribulation" class="rounded-md bg-paper-deep/60 px-2.5 py-1.5">
      <!-- 两段 10px 字的按钮,裸着只有 16px 高 —— layout-check 一嗓子喊出来(拇指点不着)。
           -my-1 py-2:靶面抬到 31px,负外边距把视觉位移抵回去,行高不动 -->
      <button class="-my-1 flex w-full items-baseline justify-between gap-1 py-2 text-left" @click="rateOpen = !rateOpen">
        <span class="text-[10px] text-ink-faint">进阶成功率(小进阶)</span>
        <span class="text-[9px] text-ink-faint">{{ rateOpen ? '▾' : '▸' }}来路</span>
      </button>
      <p class="tabular text-[16px] font-kai leading-tight" :class="btInfo.rate >= 0.7 ? 'text-jade' : 'text-cinnabar'">
        {{ btInfo.rateText }}
      </p>
      <!-- 率不是天外飞数:4 项操作数与结算同一批,展开即见 —— 0 贡献的档位渲染时就省略了 -->
      <template v-if="rateOpen">
        <p v-for="part in btInfo.rateParts" :key="part.label" class="mt-0.5 flex justify-between text-[10px]">
          <span class="text-ink-faint">{{ part.label }}</span>
          <span class="tabular" :class="part.value > 0 ? 'text-azure' : 'text-cinnabar'">{{ signedPercent(part.value) }}</span>
        </p>
        <p class="mt-1 text-[10px] leading-relaxed text-ink-faint">各项相加,再按上下限敛口,方成此数。</p>
      </template>
    </div>
    <TribulationCard :need-tribulation="btInfo.needTribulation" />
  </div>

  <TribulationDetail :need-tribulation="btInfo.needTribulation" :qi-cost="btInfo.qiCost" />

  <!-- Phase 28 突破准备:静坐调息 / 服聚气丹(无劫突破时,一次性加成) -->
  <div v-if="!btInfo.needTribulation" class="mt-2 flex items-start gap-2.5 rounded-md border border-ink/10 bg-paper-deep/50 px-2.5 py-2">
    <!-- 备:与全页印章同语言,一眼认出这是突破前的准备板 -->
    <span class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-jade/15 font-kai text-[12px] text-jade">备</span>
    <div class="min-w-0 grow">
      <div class="flex items-center justify-between text-[10px] text-ink-faint">
        <span>突破准备(一次有效)</span>
        <!--
          倒计时一律走 formatCountdown(定宽),不用 formatDuration:
          后者每秒都可能改宽度,这枚胶囊一涨一缩,同一行的其余内容会跟着跳。
        -->
        <span v-if="btInfo.prep.sitting" class="text-amber-ink tabular">
          调息中 · <span class="countdown-slot">{{ formatCountdown(btInfo.prep.remainingSec) }}</span>
        </span>
        <span v-else-if="btInfo.prep.ready" class="text-jade">加成 +{{ Math.round(btInfo.prep.bonus * 100) }}% 就绪</span>
      </div>
      <!--
        两个准备选项并排,但 chip-ink 是 nowrap 的胶囊,320px 窄屏放不下两枚
        (实测第二枚右缘到 331px,越界 11px)。故允许换行:宽屏并排、窄屏上下。
      -->
      <div v-if="!btInfo.prep.sitting && !btInfo.prep.ready" class="mt-1.5 flex flex-wrap gap-1.5">
        <button type="button" class="chip-ink chip-ink-wrap !py-1.5 text-[10px]" @click="startPrep('meditate')">
          {{ prepMeditate.label }} · {{ Math.round(prepMeditate.duration / 60) }}分钟
          +{{ Math.round(prepMeditate.bonusRate * 100) }}%
        </button>
        <button type="button" class="chip-ink chip-ink-wrap !py-1.5 text-[10px]" :disabled="!prepCanPill" @click="startPrep('pill')">
          {{ prepPill.label }} · {{ prepPillCost }}灵石 +{{ Math.round(prepPill.bonusRate * 100) }}%
          <span v-if="!prepCanPill" class="text-ink-faint">({{ prepPillDisabledLabel() }})</span>
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
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useResourcesStore } from '@/stores/resources'
  import { useUiStore } from '@/stores/ui'
  import { attemptBreakthrough, breakthroughInfo } from '@/core/breakthrough'
  import { prepareBreakthrough } from '@/core/earlyGameService'
  import { toNum } from '@/utils/gnum'
  import { formatCountdown } from '@/utils/format'
  import { signedPercent } from '@/data/statNames'
  import { BREAKTHROUGH_PREP_OPTIONS } from '@/data/earlyGame'
  import { prepPillDisabledLabel, prepPillShortToast } from '@/ui/cultivationText'
  import TribulationCard from './TribulationCard.vue'
  import TribulationDetail from './TribulationDetail.vue'

  /**
   * 破境卡 —— 自 CultivationView 迁入。
   *
   * 下一步、进阶成功率与来路、劫势摘要与详情、突破准备与引劫/尝试按钮同属一域;
   * 成功率与备药判据仍读 core/breakthrough 与 BREAKTHROUGH_PREP_OPTIONS,
   * 准备的两个选项文案与耗时也不在视图里写第二份。
   */
  const resources = useResourcesStore()
  const ui = useUiStore()

  const rateOpen = ref(false)
  const btInfo = computed(() => breakthroughInfo())

  const prepMeditate = BREAKTHROUGH_PREP_OPTIONS.find(o => o.id === 'meditate')!
  const prepPill = BREAKTHROUGH_PREP_OPTIONS.find(o => o.id === 'pill')!
  const prepPillCost = prepPill.cost?.stone ?? 0
  // toNum 在指数 >308 时返回 Infinity(见 utils/gnum)—— 先排掉非有限值,
  // 否则 Infinity >= cost 恒真会让「药价不足」的按钮误亮(与 progress.ts 同判据)
  const prepCanPill = computed(() => {
    const stone = toNum(resources.spiritStone)
    return Number.isFinite(stone) && stone >= prepPillCost
  })

  function startPrep(option: 'meditate' | 'pill'): void {
    if (prepareBreakthrough(option)) {
      ui.toast(option === 'meditate' ? '你盘膝入定,静待调息完成' : '丹药入腹,气机已然蓄足', 'info')
    } else {
      ui.toast(prepPillShortToast(), 'warn')
    }
  }
</script>
