<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getCurrentCaveEvent, chooseCaveOption, dismissCaveEvent } from '@/core/earlyGameService'
import { gameNow } from '@/core/enginePause'
import { useGameClock } from '@/composables/useGameClock'
import { caveOptionText } from '@/ui/caveText'
import type { CaveEvent } from '@/types'
import BaseModal from '@/components/common/BaseModal.vue'

/*
 * 洞府巡游 —— 与顿悟同一个毛病(自己铺 fixed inset-0):没有 dialog 语义、
 * 没有焦点管理、样式也自成一套。改用 BaseModal,行为一字不改:
 * 秒数照刷、到点由引擎收场、「离开」= 关掉即散(背板/Esc/关闭键同义)。
 */
const event = ref<CaveEvent | null>(null)
const remaining = ref(0)

const locationNames: Record<string, string> = {
  field: '灵田',
  furnace: '丹炉',
  library: '藏经阁',
  array: '聚灵阵',
  garden: '灵兽园'
}

function refresh() {
  event.value = getCurrentCaveEvent()
  if (event.value) {
    remaining.value = Math.max(0, Math.ceil((event.value.expiresAt - gameNow()) / 1000))
  }
}

function handleChoose(index: number) {
  chooseCaveOption(index)
  event.value = null
}

function handleIgnore() {
  dismissCaveEvent() // 清模块级事件,轮询才不会把它弹回来
  event.value = null
}

onMounted(() => {
  refresh()
})

// 轮询随心跳冻结:确认窗背后不该再叠一扇巡游窗(与 useNow 同一条口径)
useGameClock(refresh, 1000)

const show = computed(() => event.value !== null)
const locationLabel = computed(() =>
  event.value ? locationNames[event.value.location] ?? '未知' : ''
)
</script>

<template>
  <BaseModal :open="show" title="洞府巡游" @close="handleIgnore">
    <p class="flex items-center justify-between text-[11px] text-ink-faint">
      <span class="chip-ink !py-0 text-[10px] text-jade">{{ locationLabel }}</span>
      <span class="tabular text-gold-ink">{{ remaining }} 秒后自散</span>
    </p>
    <p class="mt-3 font-kai text-[14px] tracking-widest text-ink">{{ event?.title }}</p>
    <p class="mt-1 text-[12px] leading-relaxed text-ink-soft">{{ event?.desc }}</p>
    <div class="mt-3 space-y-2">
      <button
        v-for="(opt, idx) in event?.options ?? []"
        :key="idx"
        class="w-full rounded-lg border border-ink/25 px-4 py-2.5 text-left transition-all active:scale-98 active:bg-ink/5"
        @click="handleChoose(idx)"
      >
        <span class="block font-kai text-[14px] tracking-widest text-ink">{{ opt.label }}</span>
        <span class="mt-0.5 block text-[11px] leading-relaxed text-ink-faint">{{ caveOptionText(opt) }}</span>
      </button>
    </div>
    <template #footer>
      <button class="btn-ghost w-full" @click="handleIgnore">离 开(今日不再巡游)</button>
    </template>
  </BaseModal>
</template>
