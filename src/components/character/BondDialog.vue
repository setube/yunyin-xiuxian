<template>
  <!-- 道侣弹窗:这一世的关系与历世的同行 -->
  <BaseModal :open="open" :title="bondDef ? `道侣 · ${bondDef.name}` : '道侣'" @close="emit('close')">
    <template v-if="bondDef && bond">
      <p class="font-kai text-[14px] text-ink">{{ bondDef.name }}</p>
      <p class="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{{ bondDef.brief }}</p>
      <p class="mt-2 text-[11px] text-ink-soft">
        {{ TEMPER_NAMES[bondDef.temper] }} · {{ LEAN_NAMES[bondDef.lean] }}道
        <span class="ml-1 text-azure">{{ STAGE_NAMES[bond.stage] }}</span>
        <span v-if="bond.fallen" class="ml-1 text-cinnabar">已殁</span>
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
      <p v-if="responseLine" class="mt-1 text-[11px] text-ink-faint">她开的口,你历次回应:{{ responseLine }}</p>

      <p class="mt-3 text-[11px] leading-relaxed text-ink-soft">她所求:{{ bondDef.pursuit }}</p>
      <p class="mt-0.5 text-[11px] leading-relaxed text-ink-faint">她不越的线:{{ bondDef.taboo }}</p>

      <p v-if="gateHint" class="mt-3 text-[11px] text-gold-ink">
        离「{{ STAGE_NAMES[gateHint.stage] }}」尚差:{{ gateHint.lacking.join('、') }}
      </p>

      <!-- 她自己提出的事(Phase 34.1):不是世界安排的事件,是她开的口 -->
      <template v-if="herIntent">
        <div class="mt-4 border-t border-ink/10 pt-3">
          <p class="text-[12px] leading-relaxed text-gold-ink">{{ herIntent.line }}</p>
          <p class="mt-1 text-[10px] text-ink-faint">她所求:{{ herIntent.wish }}</p>
          <!-- 意图由经历催生,不是凭空的:把「因何而起」摆出来 -->
          <p v-if="herIntentSparks" class="text-[10px] text-ink-faint">因何而起:{{ herIntentSparks }}</p>
          <div class="mt-2.5 flex gap-2">
            <button
              v-for="r in INTENT_CHOICES"
              :key="r.id"
              class="card-ink grow px-2 py-2 text-center text-[12px] text-ink-soft active:scale-98"
              @click="answerIntent(r.id)"
            >
              {{ r.label }}
            </button>
          </div>
        </div>
      </template>

      <!-- 共同事件:她的诉求与底线在此第一次被玩家看见并回应 -->
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
    <p v-else class="text-[12px] leading-relaxed text-ink-faint">
      此生尚未遇见谁。人是在路上碰到的,不是挑出来的 —— 多走几处地界,或许自有相逢。
    </p>

    <template v-if="pastBonds.length">
      <p class="mt-4 font-kai text-[13px] tracking-widest text-ink-soft">历世同行</p>
      <div class="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
        <p v-for="(r, i) in pastBonds" :key="i" class="flex justify-between text-[11px]">
          <span class="text-ink-soft">{{ r.name }}</span>
          <span class="text-ink-faint">{{ STAGE_NAMES[r.stage] }} · {{ ENDING_NAMES[r.ending] }}</span>
        </p>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { ENDING_NAMES, LEAN_NAMES, STAGE_NAMES, TEMPER_NAMES } from '@/data/daolu'
  import { chooseBondEvent, herStance, nextGateHint, respondIntent } from '@/core/daoluService'
  import { RESPONSE_NAMES, SPARK_NAMES } from '@/data/bondIntent'
  import { TRIGGER_NAMES } from '@/data/bondEvents'
  import { useBondOverview } from '@/composables/useBondOverview'
  import BaseModal from '@/components/common/BaseModal.vue'

  /**
   * 道侣弹窗 —— 这一世的关系与历世的同行。
   *
   * 自 CharacterView 迁入:关系状态的本体投影(bond/bondDef/pastBonds/pendingEvent/herIntent)
   * 收在 composables/useBondOverview.ts —— 入口卡与这里共用同一份定义;
   * 本组件只留弹窗自己的交互态:回应后的尾账(lastEventText)、三维条、门槛提示、回应史。
   */
  const props = defineProps<{ open: boolean }>()
  const emit = defineEmits<{ close: [] }>()

  const { bond, bondDef, pastBonds, pendingEvent, herIntent } = useBondOverview()

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
  /** 这件事因何而来(触发名取自 bondEvents,不在视图里手写) */
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

  /** 这份心意因何而起(经历名取自 bondIntent) */
  const herIntentSparks = computed(() => {
    const sparks = herIntent.value?.sparks ?? []
    return [...new Set(sparks)].map(s => SPARK_NAMES[s]).join('、')
  })
  /** 她记得你怎么答的 —— 回应名取自 bondIntent,视图不另写一份 */
  const responseLine = computed(() => {
    const rs = bond.value?.intent?.responses ?? []
    return rs.length ? rs.map(r => RESPONSE_NAMES[r]).join(' · ') : ''
  })
  const INTENT_CHOICES = [
    { id: 'accept' as const, label: '与她同去' },
    { id: 'refuse' as const, label: '婉言谢绝' },
    { id: 'ignore' as const, label: '不作声' }
  ]
  function answerIntent(r: 'accept' | 'refuse' | 'ignore'): void {
    const a = respondIntent(r)
    lastEventText.value = a?.text ?? ''
  }
</script>
