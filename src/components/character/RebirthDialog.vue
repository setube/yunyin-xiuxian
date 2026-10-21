<template>
  <!-- 轮回弹窗(自 CharacterView 迁入;逆旅契的「立契」入口在轮回弹窗内,两浮层同宿主不拆散) -->
  <BaseModal :open="open" title="轮回" @close="emit('close')">
    <p class="flex justify-between text-[12px]">
      <span class="text-ink-soft">
        道果
        <span class="ml-1 text-[10px] text-violet-ink">【永久积累】</span>
        <span class="block text-[10px] text-ink-faint">
          每枚至多:修行 +{{ formatPercent(DAO_FRUIT_CULT_BONUS) }},道躯 +{{
            formatPercent(DAO_FRUIT_COMBAT_BONUS)
          }};边际渐减(见下),转世保留
        </span>
      </span>
      <span class="tabular font-kai text-[15px] text-cinnabar">{{ player.reincarnation.daoFruit }}</span>
    </p>
    <!-- S3 道果收益:有效值与软上限白话 -->
    <p class="mt-1 text-[11px] text-ink-faint tabular">
      有效收益
      <span class="text-gold-ink">{{ fruitCountLabel(fruitInfo.effective) }}</span>
      (边际渐减)·
      {{
        fruitInfo.total > 0
          ? `当前修行 +${formatPercent(fruitInfo.effective * DAO_FRUIT_CULT_BONUS * stats.cultSpeedFactor)} · 道躯 +${formatPercent(fruitInfo.effective * DAO_FRUIT_COMBAT_BONUS)}`
          : ''
      }}
    </p>
    <!-- 逆旅契:道果的第一个消费出口。花道果换一世逆境,回报只有履历 -->
    <p class="mt-2 flex items-center justify-between text-[12px]">
      <span class="text-ink-soft">
        逆旅契
        <span class="ml-1 text-[10px] text-violet-ink">【本世 · 消耗道果】</span>
        <span class="block text-[10px] text-ink-faint">
          {{ signedTrial ? `此生已立「${signedTrial.name}」·${signedTrial.ruleText}` : '以道果换一世逆境,所得唯有履历一笔' }}
        </span>
      </span>
      <!-- 拇指够得着:纯文字按钮只有 18px 高,补成 30px(弹窗里的可点元素同样受 28px 那条约束) -->
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
        <!-- 天赋效果不再只藏 hover:点一下芯片,下面展开一行说明(手机上看得见才算数) -->
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
        <span v-if="!ownedTalents.length" class="text-[11px] text-ink-faint">转世后可觉醒先天之姿</span>
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
        <span class="ml-1 text-[10px] text-violet-ink">【永久积累 · 随神魂不灭】</span>
        <span class="block text-[10px] text-ink-faint">
          某道境界走到底,才留下独有一道传承(能力位)。金丹以下浅修,永远锻造不出。
        </span>
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
      <p v-else class="mt-1.5 text-[11px] text-ink-faint">尚未铸得传承 —— 金丹及以上的深修,方有一道可留</p>
    </div>
    <!--
      去留一览:兵解是不可逆的大事,一句「随皮囊散去」盖不住整本账 ——
      每一样去了哪、留下什么,读的就是结算弹窗那份 HERITAGE(同表,不另写)。
      默认收起:不压弹窗高度,按下前点开即可核对
    -->
    <button
      class="mt-3 flex w-full items-center justify-between px-2 py-2 text-left text-[11px] text-ink-soft active:opacity-60"
      :aria-expanded="heritageOpen"
      @click="heritageOpen = !heritageOpen"
    >
      <span>转世去留一览({{ keepCount }} 留 · {{ resetCount }} 去)</span>
      <span class="text-[10px] text-azure">{{ heritageOpen ? '▾ 收 起' : '▸ 展 开' }}</span>
    </button>
    <div v-if="heritageOpen" class="mt-1.5 rounded-md bg-paper-deep/60 px-3 py-2">
      <p class="text-[10px] text-ink-soft">随魂弥留 · 与结算弹窗同表</p>
      <div class="mt-1 space-y-1">
        <p v-for="row in heritageKeepRows" :key="row.id" class="flex items-baseline justify-between gap-2 text-[10px]">
          <span class="text-ink-soft">{{ row.name }}</span>
          <span class="shrink-0" :class="row.cls">{{ row.modeLabel }}</span>
        </p>
        <div class="my-1 border-t border-ink/6" />
        <p v-for="row in heritageResetRows" :key="row.id" class="flex items-baseline justify-between gap-2 text-[10px]">
          <span class="text-ink-faint">{{ row.name }}</span>
          <span class="shrink-0" :class="row.cls">{{ row.modeLabel }}</span>
        </p>
      </div>
    </div>
    <p class="mt-3 text-[11px] leading-relaxed text-ink-faint">{{ rebirthHint }}</p>
    <template #footer>
      <!--
        未达金丹仍可点、点了才 toast 拦 —— 与全库「不可行就置灰 + 就地列因」相反。
        门槛读 MANUAL_REBIRTH_MIN_MAJOR,境名读 REALMS,不手写「金丹」。
      -->
      <button class="btn-ghost w-full !text-[12px]" :disabled="!canRebirth" @click="rebirth">
        {{
          canRebirth
            ? '兵解转世'
            : `${REALMS[MANUAL_REBIRTH_MIN_MAJOR]?.name ?? ''}境方可自行兵解`
        }}
      </button>
    </template>
  </BaseModal>

  <!-- 逆旅契弹窗:一世一份,签下不可解除;只加难度,不给任何属性或资源 -->
  <BaseModal :open="trialOpen" title="逆旅契" @close="trialOpen = false">
    <p class="text-[11px] leading-relaxed text-ink-faint">
      道果本是历世所积,却一向只堆在身上。立一份契,把它押在这一世的逆境里——
      契不予你分毫气力,只把路走窄。走完了,它会留在你的履历上。
    </p>
    <div class="mt-3 space-y-2">
      <button
        v-for="t in LIFE_TRIALS"
        :key="t.id"
        :class="['card-ink w-full px-3 py-2 text-left', canSignLifeTrial(t.id) ? '' : 'opacity-40']"
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
      </button>
    </div>
    <p class="mt-3 text-[11px] leading-relaxed text-ink-faint">一世只可立一契,立下不可解。转世时契随皮囊散去,履历长存。</p>
  </BaseModal>

  <!-- 逆旅契 · 确认:不可逆、花费高,先给一次反悔的机会再立 -->
  <BaseModal :open="pendingTrial !== null" title="立契确认" @close="pendingTrial = null">
    <template v-if="pendingTrial">
      <p class="text-[11px] leading-relaxed text-ink-faint">
        立下「{{ pendingTrial.seal }} · {{ pendingTrial.name }}」,押上 {{ pendingTrial.cost }} 道果。此世再无回头路,回报只在履历。
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
  import { activeLifeTrial, canSignLifeTrial, signLifeTrial } from '@/core/lifeTrialService'
  import { talentDef, TALENT_GRADE_COLORS } from '@/data/talents'
  import { heritageDef } from '@/data/heritage'
  import { REALMS } from '@/data/realms'
  import { prepareReincarnation, MANUAL_REBIRTH_MIN_MAJOR } from '@/core/reincarnation'
  import { DAO_FRUIT_COMBAT_BONUS, DAO_FRUIT_CULT_BONUS } from '@/data/constants'
  import { fruitCountLabel, fruitMarginalInfo } from '@/core/resourceGuidance'
  import { modsText } from '@/data/statNames'
  import { heritageViewRows, rebirthDecisionHint } from '@/ui/rebirthText'
  import { formatPercent } from '@/utils/format'
  import BaseModal from '@/components/common/BaseModal.vue'

  /**
   * 轮回弹窗(含逆旅契弹窗,同一宿主)。
   *
   * 自 CharacterView 迁入:轮回弹窗里的「立契」按钮是逆旅契弹窗的唯一出处,
   * 两个浮层拆到两处文件就成了「出处不在一起」—— 沿用 ReincarnationDialog
   * 一个文件宿多个 BaseModal 的先例,弹窗自己的状态(talentTap / heritageOpen /
   * trialOpen / pendingTrial)也一并随迁,关弹窗复位的行为不变。
   */
  const props = defineProps<{ open: boolean }>()
  const emit = defineEmits<{ close: [] }>()

  const player = usePlayerStore()
  const ui = useUiStore()
  const stats = computed(() => player.finalStats)

  /** S3 道果链路:有效收益与软上限白话 */
  const fruitInfo = computed(() => fruitMarginalInfo())
  const ownedTalents = computed(() => player.reincarnation.talents.map(id => talentDef(id)).filter(t => t !== undefined))
  const ownedHeritage = computed(() => player.reincarnation.heritage.map(id => heritageDef(id)).filter(d => d !== undefined))

  /** 转世去留一览:展开态由玩家决定;行取自 HERITAGE 同表,见 ui/rebirthText */
  const heritageOpen = ref(false)
  const heritageRowsView = computed(() => heritageViewRows())
  const heritageKeepRows = computed(() => heritageRowsView.value.filter(r => r.mode !== 'reset'))
  const heritageResetRows = computed(() => heritageRowsView.value.filter(r => r.mode === 'reset'))
  const keepCount = computed(() => heritageKeepRows.value.length)
  const resetCount = computed(() => heritageResetRows.value.length)
  /** 兵解提示是纯常量文案(rebirthDecisionHint 无依赖),setup 只算一次 */
  const rebirthHint = rebirthDecisionHint()
  /** 天赋芯片点按展开(移动端无 hover,效果说明内联显示);关弹窗复位 */
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
  // 待确认的契:点卡只进这层,确认弹窗通过后才会真的 signLifeTrial —— 不可逆,先给反悔
  const pendingTrial = ref<LifeTrialDef | null>(null)
  function requestTrial(id: string): void {
    const def = LIFE_TRIALS.find(t => t.id === id)
    if (!def) return
    if (player.reincarnation.trial) {
      ui.toast('此生已有契在身', 'warn')
      return
    }
    if (player.reincarnation.daoFruit < def.cost) {
      ui.toast('道果不足', 'warn')
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
      // 与弹窗内那句「金丹境方可兵解」同源:门槛挪动,toast 跟着走,不手抄境名
      ui.toast(`至少${REALMS[MANUAL_REBIRTH_MIN_MAJOR]?.name ?? ''}境方可自行兵解`, 'warn')
      return
    }
    emit('close')
    prepareReincarnation()
  }
</script>
