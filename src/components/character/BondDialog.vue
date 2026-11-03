<template>
  <BaseModal :open="open" :title="bondDef ? `道侣 · ${bondDef.name}` : '道侣'" @close="emit('close')">
    <template v-if="bondDef && bond">
      <p class="flex items-center gap-1.5 font-kai text-[14px] text-ink">
        <!-- 缘阶:阶纹 + 阶点(一阶一点、七阶七点),不必读阶名也知道走到哪一步 -->
        <span
          class="bond-crest h-4 w-4 shrink-0"
          :class="`bond-crest--${mark.glyph}`"
          :style="{ color: mark.tone }"
          role="img"
          :aria-label="`${mark.label}阶`"
        />
        {{ bondDef.name }}
      </p>
      <p class="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{{ bondDef.brief }}</p>
      <p class="mt-2 flex items-center gap-2 text-[11px] text-ink-soft">
        <span>{{ TEMPER_NAMES[bondDef.temper] }} · {{ LEAN_NAMES[bondDef.lean] }}道</span>
        <span
          class="bond-pips"
          :class="{ 'bond-pips--top': mark.top }"
          :style="{ '--bond-tone': mark.tone }"
          aria-hidden="true"
        >
          <i v-for="p in mark.pips" :key="p" />
        </span>
        <span class="text-azure">{{ STAGE_NAMES[bond.stage] }}</span>
        <span v-if="bond.fallen" class="text-cinnabar">已殁</span>
      </p>

      <!-- 三维只影响关系推进,不进任何属性 -->
      <div class="mt-3 space-y-1.5">
        <p v-for="m in bondMeters" :key="m.label" class="flex items-center gap-2 text-[11px]">
          <span class="w-10 shrink-0 text-ink-faint">{{ m.label }}</span>
          <span class="h-1 grow rounded-full bg-ink/10">
            <span class="block h-1 rounded-full bg-azure/70" :style="{ width: `${m.v}%` }" />
          </span>
          <span class="w-8 shrink-0 text-right tabular text-ink-soft">{{ m.v }}</span>
        </p>
      </div>
      <p class="mt-2 text-[11px] text-ink-faint">共历 {{ bond.shared }} 次</p>
      <p v-if="responseLine" class="mt-1 text-[11px] text-ink-faint">历次回应:{{ responseLine }}</p>

      <p class="mt-3 text-[11px] leading-relaxed text-ink-soft">{{ pronoun }}所求:{{ bondDef.pursuit }}</p>
      <p class="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{{ pronoun }}不越的线:{{ bondDef.taboo }}</p>

      <p v-if="gateHint" class="mt-3 text-[11px] text-gold-ink">
        离「{{ STAGE_NAMES[gateHint.stage] }}」尚差:{{ gateHint.lacking.join('、') }}
      </p>

      <!-- 道侣自己提出的事,非世界安排的事件 -->
      <template v-if="herIntent">
        <div class="mt-4 border-t border-ink/10 pt-3">
          <p class="text-[12px] leading-relaxed text-gold-ink">{{ herIntent.line }}</p>
          <p class="mt-1 text-[10px] text-ink-faint">{{ pronoun }}所求:{{ herIntent.wish }}</p>
          <p v-if="herIntentSparks" class="text-[10px] text-ink-faint">因何而起:{{ herIntentSparks }}</p>
          <div class="mt-2.5 flex gap-2">
            <button
              v-for="r in intentChoices"
              :key="r.id"
              class="card-ink grow px-2 py-2 text-center text-[12px] text-ink-soft active:scale-98"
              @click="answerIntent(r.id)"
            >
              {{ r.label }}
            </button>
          </div>
        </div>
      </template>

      <!-- 共同事件 -->
      <template v-if="pendingEvent && !bond.fallen && !bond.departed">
        <div class="mt-4 border-t border-ink/10 pt-3">
          <p class="font-kai text-[13px] tracking-widest text-ink">{{ pendingEvent.title }}</p>
          <p class="text-[10px] text-ink-faint">因何而来:{{ pendingEventTriggers }}</p>
          <p class="mt-1 text-[11px] leading-relaxed text-ink-soft">{{ pendingEvent.text }}</p>
          <p class="mt-1.5 text-[11px] text-azure">{{ pendingEvent.herWish }}</p>
          <p class="text-[10px] text-ink-faint">{{ pendingEvent.herLimit }}</p>
          <p v-if="herLine" class="mt-1.5 text-[11px] text-gold-ink">{{ herLine }}</p>
          <div class="mt-2.5 space-y-1.5">
            <button
              v-for="ch in pendingEvent.choices"
              :key="ch.id"
              class="card-ink w-full px-3 py-2 text-left text-[12px] text-ink-soft active:scale-98"
              :class="{ '!border-cinnabar/50 text-cinnabar': ch.peril, '!border-gold-ink/40': ch.risky && !ch.peril }"
              @click="pickChoice(ch.id)"
            >
              {{ ch.label }}
              <span v-if="ch.peril" class="ml-1 text-[10px] text-cinnabar">〔共命之险〕</span>
            </button>
          </div>
        </div>
      </template>
      <p v-else-if="lastEventText" class="mt-4 border-t border-ink/10 pt-3 text-[11px] leading-relaxed text-ink-soft">
        {{ lastEventText }}
      </p>
    </template>
    <p v-else class="text-[12px] leading-relaxed text-ink-faint">尚未遇见</p>

    <template v-if="pastBonds.length">
      <p class="mt-4 font-kai text-[13px] tracking-widest text-ink-soft">历世同行</p>
      <div class="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
        <p v-for="(r, i) in pastBonds" :key="i" class="flex items-center justify-between text-[11px]">
          <span class="flex items-center gap-1.5">
            <span
              class="bond-crest h-3 w-3 shrink-0"
              :class="`bond-crest--${bondMark(r.stage).glyph}`"
              :style="{ color: bondMark(r.stage).tone }"
              aria-hidden="true"
            />
            <span class="text-ink-soft">{{ r.name }}</span>
          </span>
          <span class="text-ink-faint">{{ STAGE_NAMES[r.stage] }} · {{ ENDING_NAMES[r.ending] }}</span>
        </p>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { ENDING_NAMES, LEAN_NAMES, STAGE_NAMES, TEMPER_NAMES } from '@/data/daolu'
  import { bondMark } from '@/ui/bondMark'
  import { chooseBondEvent, herStance, nextGateHint, respondIntent } from '@/core/daoluService'
  import { RESPONSE_NAMES, SPARK_NAMES } from '@/data/bondIntent'
  import { TRIGGER_NAMES } from '@/data/bondEvents'
  import { useBondOverview } from '@/composables/useBondOverview'
  import BaseModal from '@/components/common/BaseModal.vue'

  /**
   * 道侣弹窗:这一世的关系与历世的同行。
   * 关系状态投影在 composables/useBondOverview.ts,与入口卡共用;本组件只留弹窗交互态。
   */
  const props = defineProps<{ open: boolean }>()
  const emit = defineEmits<{ close: [] }>()

  const { bond, bondDef, pastBonds, pendingEvent, herIntent, pronoun, ta } = useBondOverview()

  /** 当前缘阶形制;bond 未建立时按素昧平生画 */
  const mark = computed(() => bondMark(bond.value?.stage ?? 'none'))

  const bondMeters = computed(() =>
    bond.value
      ? [
          { label: '缘分', v: bond.value.fate },
          { label: '信任', v: bond.value.trust },
          { label: '契合', v: bond.value.accord }
        ]
      : []
  )
  const gateHint = computed(() => nextGateHint())
  /** 事件因何而来:触发名取自 bondEvents,不手写 */
  const pendingEventTriggers = computed(() =>
    (pendingEvent.value?.triggers ?? []).map(t => TRIGGER_NAMES[t]).filter(Boolean).join('、')
  )
  const lastEventText = ref('')
  const herLine = computed(() => (pendingEvent.value ? herStance(pendingEvent.value) : null))
  watch(
    () => props.open,
    open => {
      if (open) lastEventText.value = ''
    }
  )
  function pickChoice(choiceId: string): void {
    if (!pendingEvent.value) return
    const r = chooseBondEvent(pendingEvent.value.id, choiceId)
    lastEventText.value = r?.text ?? ''
  }

  /** 心意因何而起:经历名取自 bondIntent */
  const herIntentSparks = computed(() => {
    const sparks = herIntent.value?.sparks ?? []
    return [...new Set(sparks)].map(s => ta(SPARK_NAMES[s])).join('、')
  })
  /** 回应史:回应名取自 bondIntent,不另写 */
  const responseLine = computed(() => {
    const rs = bond.value?.intent?.responses ?? []
    return rs.length ? rs.map(r => RESPONSE_NAMES[r]).join(' · ') : ''
  })
  const intentChoices = computed(() => [
    { id: 'accept' as const, label: `与${pronoun.value}同去` },
    { id: 'refuse' as const, label: '婉言谢绝' },
    { id: 'ignore' as const, label: '不作声' }
  ])
  function answerIntent(r: 'accept' | 'refuse' | 'ignore'): void {
    const a = respondIntent(r)
    lastEventText.value = a?.text ?? ''
  }
</script>
