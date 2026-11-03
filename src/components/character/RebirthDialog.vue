<template>
  <BaseModal :open="open" title="轮回" @close="emit('close')">
    <p class="flex justify-between text-[12px]">
      <span class="text-ink-soft">
        道果
        <span class="ml-1 text-[10px] text-violet-ink">【永久积累】</span>
        <span class="block text-[10px] text-ink-faint">
          每枚至多 修行 +{{ formatPercent(DAO_FRUIT_CULT_BONUS) }} · 道躯 +{{
            formatPercent(DAO_FRUIT_COMBAT_BONUS)
          }} · 边际渐减
        </span>
      </span>
      <span class="tabular font-kai text-[15px] text-cinnabar">{{ player.reincarnation.daoFruit }}</span>
    </p>
    <!-- 边际刻度:当前这枚还剩几成力。递减是这条曲线的全部要义,不该只写四个字 -->
    <div v-if="fruitInfo.total > 0" class="mt-1 flex items-center gap-2">
      <span class="text-[10px] text-ink-faint">本枚边际</span>
      <span
        class="fruit-pips shrink-0"
        role="img"
        :aria-label="`${curMargin.label} · 六格中 ${curMargin.pips} 格`"
      >
        <i v-for="n in MARGIN_PIPS" :key="n" :class="{ on: n <= curMargin.pips }" />
      </span>
      <!-- 折线只在已过前几枚才有意义:一两枚时曲线是平的,画出来只是占位 -->
      <svg
        v-if="showCurve"
        class="fruit-curve min-w-0 flex-1"
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <polyline :points="curvePoints" />
      </svg>
    </div>
    <p class="mt-1 text-[11px] text-ink-faint tabular">
      有效
      <span class="text-gold-ink">{{ fruitCountLabel(fruitInfo.effective) }}</span>
      {{
        fruitInfo.total > 0
          ? `· 当前修行 +${formatPercent(fruitInfo.effective * DAO_FRUIT_CULT_BONUS * stats.cultSpeedFactor)} · 道躯 +${formatPercent(fruitInfo.effective * DAO_FRUIT_COMBAT_BONUS)}`
          : ''
      }}
    </p>
    <!-- 逆旅契:花道果换一世逆境,回报只有履历 -->
    <p class="mt-2 flex items-center justify-between text-[12px]">
      <span class="text-ink-soft">
        逆旅契
        <span class="ml-1 text-[10px] text-violet-ink">【本世 · 消耗道果】</span>
        <span v-if="signedTrial" class="block text-[10px] text-ink-faint">
          已立「{{ signedTrial.name }}」· {{ signedTrial.ruleText }}
        </span>
      </span>
      <!-- 纯文字按钮补到 30px 高:弹窗可点元素受 28px 下限约束 -->
      <button
        v-if="!signedTrial"
        class="shrink-0 self-center -my-1.5 px-2 py-1.5 text-[12px] text-gold-ink underline underline-offset-2 active:text-cinnabar"
        @click="trialOpen = true"
      >
        立契
      </button>
      <span v-else class="shrink-0 font-kai text-[15px] text-cinnabar">{{ signedTrial.seal }}</span>
    </p>

    <div class="mt-2">
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="t in ownedTalents"
          :key="t!.id"
          class="chip-ink !py-1.5 border-current bg-transparent text-left"
          :style="{ color: TALENT_GRADE_COLORS[t!.grade] }"
          :title="t!.desc"
          :aria-expanded="talentTap === t!.id"
          @click="talentTap = talentTap === t!.id ? null : t!.id"
        >
          {{ t!.name }}
        </button>
        <span v-if="!ownedTalents.length" class="text-[11px] text-ink-faint">暂无先天之姿</span>
      </div>
      <p v-if="talentTap && tappedTalent" class="mt-1.5 text-[10px] leading-relaxed text-ink-faint">
        <span :style="{ color: TALENT_GRADE_COLORS[tappedTalent.grade] }">{{ tappedTalent.name }}</span>
        ：{{ tappedTalent.desc }}
        <span v-if="modsText(tappedTalent.mods)" class="mt-0.5 block text-azure tabular">{{ modsText(tappedTalent.mods) }}</span>
      </p>
    </div>
    <div class="mt-3">
      <p class="text-[11px] text-ink-soft">
        宿命传承
        <span class="ml-1 text-[10px] text-violet-ink">【永久积累】</span>
        <span class="block text-[10px] text-ink-faint">需金丹境 · 每世至多一道</span>
      </p>
      <ul v-if="ownedHeritage.length" class="mt-1.5 space-y-1.5">
        <li v-for="h in ownedHeritage" :key="h!.id" class="rounded-md border border-jade/40 bg-jade/5 px-2.5 py-1.5">
          <p class="flex items-baseline justify-between text-[11px] font-kai text-jade">
            <span>{{ h!.name }}</span>
            <span class="text-[9px] tracking-[0.2em] text-jade">{{ h!.axis === 'choice' ? '· 选择' : h!.axis === 'fault-tolerant' ? '· 容错' : '· 荣誉' }}</span>
          </p>
          <p class="text-[10px] leading-relaxed text-ink-soft">{{ h!.desc }}</p>
        </li>
      </ul>
      <p v-else class="mt-1.5 text-[11px] text-ink-faint">暂无传承</p>
    </div>
    <button
      class="mt-3 flex w-full items-center justify-between px-2 py-2 text-left text-[11px] text-ink-soft active:opacity-60"
      @click="heritageOpen = true"
    >
      <span>转世去留一览({{ keepCount }} 留 · {{ resetCount }} 去)</span>
      <span class="text-[10px] text-azure">→</span>
    </button>
    <p class="mt-3 text-[11px] leading-relaxed text-ink-faint">{{ rebirthHint }}</p>
    <template #footer>
      <!-- 门槛读 MANUAL_REBIRTH_MIN_MAJOR,境名读 REALMS,不手写「金丹」 -->
      <button class="btn-ghost w-full !text-[12px]" :disabled="!canRebirth" @click="rebirth">
        {{ canRebirth ? '兵解转世' : `兵解需${REALMS[MANUAL_REBIRTH_MIN_MAJOR]?.name ?? ''}境` }}
      </button>
    </template>
  </BaseModal>

  <BaseModal :open="heritageOpen" title="转世去留一览" top @close="heritageOpen = false">
    <div class="space-y-1 rounded-md bg-paper-deep/60 px-3 py-2">
      <p v-for="row in heritageKeepRows" :key="row.id" class="flex items-baseline justify-between gap-2 text-[11px]">
        <span class="text-ink-soft">{{ row.name }}</span>
        <span class="shrink-0" :class="row.cls">{{ row.modeLabel }}</span>
      </p>
      <div class="my-1 border-t border-ink/6" />
      <p v-for="row in heritageResetRows" :key="row.id" class="flex items-baseline justify-between gap-2 text-[11px]">
        <span class="text-ink-faint">{{ row.name }}</span>
        <span class="shrink-0" :class="row.cls">{{ row.modeLabel }}</span>
      </p>
    </div>
  </BaseModal>

  <!-- 逆旅契弹窗:只加难度,不给任何属性或资源 -->
  <BaseModal :open="trialOpen" title="逆旅契" @close="trialOpen = false">
    <p class="text-[11px] leading-relaxed text-ink-faint">一世一契 · 立下不可解 · 转世失效 · 回报仅履历</p>
    <div class="mt-3 space-y-2">
      <button
        v-for="t in LIFE_TRIALS"
        :key="t.id"
        :class="['card-ink w-full px-3 py-2 text-left', canSignLifeTrial(t.id) ? '' : 'opacity-40', lifeTrialShortfall(t.id) !== null ? 'cursor-not-allowed' : '']"
        :disabled="!canSignLifeTrial(t.id)"
        :title="lifeTrialShortfall(t.id) !== null ? `道果尚差 ${lifeTrialShortfall(t.id)}` : undefined"
        @click="requestTrial(t.id)"
      >
        <span class="flex items-baseline justify-between">
          <span class="font-kai text-[14px] text-ink">{{ t.seal }} · {{ t.name }}</span>
          <span class="tabular text-[12px]" :class="player.reincarnation.daoFruit >= t.cost ? 'text-cinnabar' : 'text-ink-faint'">
            {{ t.cost }} 道果
          </span>
        </span>
        <span class="mt-0.5 block text-[11px] leading-relaxed text-ink-soft">{{ t.desc }}</span>
        <span class="mt-0.5 block text-[10px] text-ink-faint">{{ t.ruleText }}</span>
        <span v-if="lifeTrialShortfall(t.id) !== null" class="mt-0.5 block text-[10px] tabular text-cinnabar">
          道果尚差 {{ lifeTrialShortfall(t.id) }}
        </span>
      </button>
    </div>
  </BaseModal>

  <BaseModal :open="pendingTrial !== null" title="立契确认" @close="pendingTrial = null">
    <template v-if="pendingTrial">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        「{{ pendingTrial.seal }} · {{ pendingTrial.name }}」· 消耗 {{ pendingTrial.cost }} 道果 · 立下不可解 · 回报仅履历
      </p>
      <p class="mt-2 text-[12px] leading-relaxed text-ink-soft">{{ pendingTrial.desc }}</p>
      <p class="mt-1 text-[10px] text-ink-faint">{{ pendingTrial.ruleText }}</p>
      <div class="mt-3 flex gap-2">
        <button class="btn-seal grow" @click="confirmSignTrial">确认立契</button>
        <button class="btn-ink grow" @click="pendingTrial = null">再想想</button>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { usePlayerStore } from '@/stores/player'
  import { useUiStore } from '@/stores/ui'
  import { LIFE_TRIALS, type LifeTrialDef } from '@/data/lifeTrials'
  import { activeLifeTrial, canSignLifeTrial, lifeTrialShortfall, signLifeTrial } from '@/core/lifeTrialService'
  import { talentDef, TALENT_GRADE_COLORS } from '@/data/talents'
  import { heritageDef } from '@/data/heritage'
  import { REALMS } from '@/data/realms'
  import { prepareReincarnation, MANUAL_REBIRTH_MIN_MAJOR } from '@/core/reincarnation'
  import { DAO_FRUIT_COMBAT_BONUS, DAO_FRUIT_CULT_BONUS } from '@/data/constants'
  import { fruitCountLabel, fruitMarginalInfo } from '@/core/resourceGuidance'
import { MARGIN_PIPS, marginCurvePoints, marginMark } from '@/ui/fruitMargin'
  import { modsText } from '@/data/statNames'
  import { heritageViewRows, rebirthDecisionHint } from '@/ui/rebirthText'
  import { formatPercent } from '@/utils/format'
  import BaseModal from '@/components/common/BaseModal.vue'

  /** 轮回弹窗及其子弹窗(去留一览、逆旅契、立契确认):入口都在本弹窗内,同一文件 */
  const props = defineProps<{ open: boolean }>()
  const emit = defineEmits<{ close: [] }>()

  const player = usePlayerStore()
  const ui = useUiStore()
  const stats = computed(() => player.finalStats)

  /** 道果有效收益与当前加成 */
  const fruitInfo = computed(() => fruitMarginalInfo())
/** 当前这枚的边际形制;一枚都没有时不显示 */
const curMargin = computed(() => marginMark(fruitInfo.value.total))
const curvePoints = computed(() => marginCurvePoints(Math.max(0, fruitInfo.value.total - 1)))
/** 一两枚时曲线是平的:没有可读的形状,不如不画 */
const showCurve = computed(() => fruitInfo.value.total >= 4)
  const ownedTalents = computed(() => player.reincarnation.talents.map(id => talentDef(id)).filter(t => t !== undefined))
  const ownedHeritage = computed(() => player.reincarnation.heritage.map(id => heritageDef(id)).filter(d => d !== undefined))

  /** 转世去留一览弹窗:行取自 HERITAGE 同表(见 ui/rebirthText),与结算弹窗同源 */
  const heritageOpen = ref(false)
  const heritageRowsView = computed(() => heritageViewRows())
  const heritageKeepRows = computed(() => heritageRowsView.value.filter(r => r.mode !== 'reset'))
  const heritageResetRows = computed(() => heritageRowsView.value.filter(r => r.mode === 'reset'))
  const keepCount = computed(() => heritageKeepRows.value.length)
  const resetCount = computed(() => heritageResetRows.value.length)
  /** 纯常量文案,setup 只算一次 */
  const rebirthHint = rebirthDecisionHint()
  /** 天赋芯片点按展开说明(移动端无 hover);关弹窗复位 */
  const talentTap = ref<string | null>(null)
  const tappedTalent = computed(() => (talentTap.value ? talentDef(talentTap.value) : undefined))
  watch(
    () => props.open,
    open => {
      if (!open) {
        talentTap.value = null
        heritageOpen.value = false
      }
    }
  )

  const trialOpen = ref(false)
  /** 本世已立的逆旅契;未立为 null */
  const signedTrial = computed(() => activeLifeTrial())
  // 待确认的契:确认后才 signLifeTrial(不可逆)
  const pendingTrial = ref<LifeTrialDef | null>(null)
  function requestTrial(id: string): void {
    const def = LIFE_TRIALS.find(t => t.id === id)
    if (!def) return
    if (player.reincarnation.trial) {
      ui.toast('已立契', 'warn')
      return
    }
    const short = lifeTrialShortfall(id)
    if (short !== null) {
      ui.toast(`道果尚差 ${short}`, 'warn')
      return
    }
    pendingTrial.value = def
  }
  function confirmSignTrial(): void {
    if (!pendingTrial.value) return
    const id = pendingTrial.value.id
    pendingTrial.value = null
    if (signLifeTrial(id)) trialOpen.value = false
  }
  const canRebirth = computed(() => player.major >= MANUAL_REBIRTH_MIN_MAJOR)

  function rebirth(): void {
    if (!canRebirth.value) {
      // 与按钮置灰文案同源,不手抄境名
      ui.toast(`兵解需${REALMS[MANUAL_REBIRTH_MIN_MAJOR]?.name ?? ''}境`, 'warn')
      return
    }
    emit('close')
    prepareReincarnation()
  }
</script>
