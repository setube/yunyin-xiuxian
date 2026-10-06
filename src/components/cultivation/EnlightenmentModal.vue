<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getCurrentEnlightenment, chooseEnlightenment, dismissEnlightenment } from '@/core/earlyGameService'
import { enlightenmentOptionText } from '@/ui/enlightenmentText'
import type { EnlightenmentEvent } from '@/types'
import BaseModal from '@/components/common/BaseModal.vue'

/*
 * 顿悟弹窗 —— 曾经是自己铺的一层 fixed inset-0。
 *
 * 那样写有三个代价,而它们都不会在界面上露馅:没有 role=dialog / aria-modal
 * (读屏不知道有弹窗开了)、没有焦点管理(打开后焦点还在背后的按钮上,Tab 会跑出去)、
 * 样式也自成一套(font-bold/text-sm/rounded,与本作的水墨设计系统两回事)。
 * 全屏浮层只该有一个出处 —— 故改用 BaseModal:语义、焦点、Esc/背板关闭、
 * 以及排版自检里那两条尺子(控件要有名、不小于 28px)一并继承。
 *
 * 倒计时的口径不变:秒数每秒刷一次,到点由引擎自己收场;「忽略」= 关掉即散。
 */
const event = ref<EnlightenmentEvent | null>(null)
const remaining = ref(0)
let timer: number | undefined

function refresh() {
  event.value = getCurrentEnlightenment()
  if (event.value) {
    remaining.value = Math.max(0, Math.ceil((event.value.expiresAt - Date.now()) / 1000))
  }
}

function handleChoose(index: number) {
  chooseEnlightenment(index)
  event.value = null
}

function handleIgnore() {
  dismissEnlightenment() // 清模块级事件,轮询才不会把它弹回来
  event.value = null
}

onMounted(() => {
  refresh()
  timer = window.setInterval(refresh, 1000)
})

onUnmounted(() => {
  if (timer !== undefined) window.clearInterval(timer)
})

const show = computed(() => event.value !== null)
</script>

<template>
  <!-- 背板/Esc/关闭键一律等于「忽略」:与从前点背板的语义一致 -->
  <BaseModal :open="show" title="悟道顿悟" @close="handleIgnore">
    <p class="flex items-center justify-between text-[11px] text-ink-faint">
      <span>灵光一闪,选择一项增益</span>
      <span role="status" aria-live="polite" aria-atomic="true" class="tabular text-gold-ink">{{ remaining }} 秒后自散</span>
    </p>
    <div class="mt-3 space-y-2">
      <button
        v-for="(opt, idx) in event?.options ?? []"
        :key="idx"
        class="w-full rounded-lg border border-ink/25 px-4 py-2.5 text-left transition-all active:scale-98 active:bg-ink/5"
        @click="handleChoose(idx)"
      >
        <span class="block font-kai text-[14px] tracking-widest text-ink">{{ opt.label }}</span>
        <span class="mt-0.5 block text-[11px] leading-relaxed text-ink-faint">{{ enlightenmentOptionText(opt) }}</span>
      </button>
    </div>
    <template #footer>
      <button class="btn-ghost w-full" @click="handleIgnore">忽 略</button>
    </template>
  </BaseModal>
</template>
