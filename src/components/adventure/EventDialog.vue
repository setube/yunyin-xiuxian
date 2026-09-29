<template>
  <!--
    标题带档位:从前三档(际遇/机缘/奇缘)共用「际遇」一个名,玩家撞上千分之几的机缘
    与撞上一件小事,看到的字一模一样 —— 稀有度白设了。档名一律取自 core/eventTier。
  -->
  <!-- 标题始终是这件事自己的名字(结算后 pendingEventId 已清,故沿用上一次记下的那个) -->
  <BaseModal :open="open" :closable="false" :title="def?.title ?? lastTitle">
    <!-- 抉择阶段 -->
    <template v-if="!result && def">
      <!--
        档位横幅:名字 + 这一档是什么 + 多久能撞上一次。
        数字不是手写的 —— tierOddsText 按引擎的闸门顺序(先奇缘、再机缘、余下际遇)
        与 data/constants 的三个概率算出来,并把「此刻有没有缘在续」算进去。
      -->
      <div class="mb-2.5 rounded-md border-l-2 bg-ink/4 px-2.5 py-1.5" :style="{ borderColor: tierDef.color }">
        <p class="flex items-center gap-2">
          <span class="chip-ink text-[10px]" :style="{ color: tierDef.color }">{{ tierDef.name }}</span>
          <span class="text-[10px] tabular text-ink-faint">{{ tierOdds }}</span>
        </p>
        <p class="mt-0.5 text-[10px] leading-relaxed text-ink-faint">{{ tierDef.brief }}</p>
      </div>
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
          :class="choiceAvailable(choice, tier) ? 'border-ink/25 text-ink active:scale-98 active:bg-ink/5' : 'border-ink/10 text-ink-faint'"
          :disabled="!choiceAvailable(choice, tier)"
          @click="choose(idx)"
        >
          {{ choice.label }}
          <span v-if="choiceHintText(choice, tier)" class="ml-2 text-[11px] font-normal text-ink-faint">
            {{ choiceHintText(choice, tier) }}
          </span>
        </button>
      </div>
    </template>
    <!-- 结果阶段 -->
    <template v-else-if="result">
      <p class="mb-1.5 text-[10px] text-ink-faint">{{ tierDef.name }} · {{ tierDef.brief }}</p>
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
  import { computed, ref, watch } from 'vue'
  import { useAdventureStore } from '@/stores/adventure'
  import { eventDef } from '@/data/events'
  import { choiceAvailable, resolveEventChoice, type EventResolution } from '@/core/eventEngine'
  import { pendingChainStages } from '@/core/eventEngine'
  import { usePlayerStore } from '@/stores/player'
  import { afterEventResolved } from '@/core/exploration'
  import { aftermathText, shouldTriggerAftermath } from '@/core/worldMemory'
  import { echoFor, rollEcho, ECHO_CHANCE } from '@/core/fortuneEcho'
  import { eventTierDef, eventTierOf, tierOddsText, type EventTier } from '@/core/eventTier'
  import { choiceHintText } from '@/ui/eventText'
  import BaseModal from '@/components/common/BaseModal.vue'

  const adventure = useAdventureStore()

  const result = ref<EventResolution | null>(null)
  /** 本次弹窗的回声 roll(打开时一次,会话内稳定) */
  let echoRolled = false
  let echoActive = false

  const def = computed(() => (adventure.pendingEventId ? eventDef(adventure.pendingEventId) : undefined))
  /**
   * 这一档是谁 —— 档位只在「事件已经定了」时才成立:
   * 结算阶段 pendingEventId 已被清掉(Tick 里 setPendingEvent(null)),
   * 故结果阶段沿用上一次算出的档位,不让横幅在结算的一瞬间闪成「际遇」。
   */
  const tierId = ref<EventTier>('jingyu')
  /** 结算阶段事件定义已查不到(pendingEventId 被清),故把它的名字一并记下 */
  const lastTitle = ref('际遇')
  watch(
    () => adventure.pendingEventId,
    id => {
      if (!id) return
      tierId.value = eventTierOf(id)
      lastTitle.value = eventDef(id)?.title ?? lastTitle.value
    },
    { immediate: true }
  )
  /** 档位定义(名字/颜色/一句话)与概率文案 */
  const tierDef = computed(() => eventTierDef(tierId.value))
  const tierOdds = computed(() => tierOddsText(tierId.value, chainPending.value))
  /** 有没有缘在续 —— 奇缘与机缘的实际概率都受它影响(见 core/eventTier.tierChances) */
  const chainPending = computed(() => pendingChainStages(usePlayerStore().major).length > 0)
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
