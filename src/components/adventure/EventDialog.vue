<template>
  <BaseModal :open="open" :closable="false" :title="result ? '际遇' : (def?.title ?? '际遇')">
    <!-- 抉择阶段 -->
    <template v-if="!result && def">
      <!-- Phase 31.3 遗产回声:曾弃之缘,世界记得(叙事,无数值) -->
      <p v-if="echo" class="mb-2 rounded-md border border-azure/30 bg-azure/5 px-3 py-2 text-[12px] leading-relaxed text-azure">
        {{ echo.line }}
      </p>
      <!-- 世界记忆:余波文本(曾经完成过的事件,再次遭遇时概率出现) -->
      <p v-else-if="aftermath" class="mb-2 border-l-2 border-gold-ink/60 pl-2 text-[11px] text-gold-ink">
        {{ aftermath }}
      </p>
      <p class="text-[13px] leading-relaxed text-ink-soft">{{ def.text }}</p>
      <div class="mt-4 space-y-2">
        <button
          v-for="(choice, idx) in def.choices"
          :key="idx"
          class="w-full rounded-lg border px-4 py-2.5 text-left font-kai text-[14px] tracking-widest transition-all"
          :class="choiceAvailable(choice, tier) ? 'border-ink/25 text-ink active:scale-98 active:bg-ink/5' : 'border-ink/10 text-ink-ghost'"
          :disabled="!choiceAvailable(choice, tier)"
          @click="choose(idx)"
        >
          {{ choice.label }}
          <span v-if="choice.hint" class="ml-2 text-[11px] font-normal text-ink-faint">{{ choice.hint }}</span>
        </button>
      </div>
    </template>
    <!-- 结果阶段 -->
    <template v-else-if="result">
      <p class="text-[13px] leading-relaxed text-ink-soft animate-ink-pop">{{ result.outcomeText }}</p>
      <ul v-if="result.lines.length" class="mt-3 space-y-1.5">
        <li v-for="(line, i) in result.lines" :key="i" class="rounded bg-paper-deep/70 px-3 py-1.5 text-[12px] text-ink tabular">
          {{ line }}
        </li>
      </ul>
    </template>
    <template v-if="result" #footer>
      <button class="btn-seal w-full" @click="finish">继续赶路</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useAdventureStore } from '@/stores/adventure'
  import { eventDef } from '@/data/events'
  import { choiceAvailable, resolveEventChoice, type EventResolution } from '@/core/eventEngine'
  import { afterEventResolved } from '@/core/exploration'
  import { aftermathText, shouldTriggerAftermath } from '@/core/worldMemory'
  import { echoFor, rollEcho, ECHO_CHANCE } from '@/core/fortuneEcho'
  import BaseModal from '@/components/common/BaseModal.vue'

  const adventure = useAdventureStore()

  const result = ref<EventResolution | null>(null)
  /** 本次弹窗的回声 roll(打开时一次,会话内稳定) */
  let echoRolled = false
  let echoActive = false

  const def = computed(() => (adventure.pendingEventId ? eventDef(adventure.pendingEventId) : undefined))
  const tier = computed(() => adventure.currentRegion?.tier ?? 1)
  const open = computed(() => def.value !== undefined || result.value !== null)

  /** Phase 31.3 遗产回声:曾弃机缘,极低概率(5%)触发"世界认出你"(打开时一次) */
  const echo = computed(() => {
    if (!def.value || result.value) return null
    const evId = def.value.id
    if (!evId.startsWith('ft_')) return null
    if (!echoRolled) {
      echoRolled = true
      echoActive = rollEcho() < ECHO_CHANCE
    }
    return echoActive ? echoFor(evId) : null
  })

  /** 世界记忆:此事件是否已完过,若是则按概率决定余波文案 */
  const aftermath = computed<string | null>(() => {
    if (!def.value || result.value) return null
    const mem = adventure.eventMemories[def.value.id]
    if (!mem) return null
    // 打开时由事件 id 的确定性 hash 决定(同一事件在整个会话内行为一致)
    const roll = ((def.value.id.length * 31 + def.value.id.charCodeAt(0) * 7) % 100) / 100
    if (!shouldTriggerAftermath(adventure.eventMemories, def.value.id, roll)) return null
    return aftermathText(def.value.title, mem.times >= 3 ? 'good' : mem.times >= 2 ? 'echo' : 'silence')
  })

  function choose(idx: number): void {
    if (!def.value) return
    const choice = def.value.choices[idx]
    if (!choice || !choiceAvailable(choice, tier.value)) return
    result.value = resolveEventChoice(def.value, idx, tier.value)
    afterEventResolved(Date.now())
  }

  function finish(): void {
    result.value = null
  }
</script>
