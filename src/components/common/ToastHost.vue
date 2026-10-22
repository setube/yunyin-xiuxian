<template>
  <!-- 稀有天降:全屏金光一闪 -->
  <div v-if="flashId !== null" :key="flashId" class="rare-flash" />
  <!--
    外框不吃事件(留出底下页面的点击),但**提示条本身要吃** ——
    它挂着 @click 关掉自己,也写着 cursor-pointer 与按下反馈。
    此前只有外框写了 pointer-events-none,按钮继承成 none:
    dismissToast 从来没有被触发过,提示条只能等超时自己消失。
  -->
  <div class="pointer-events-none fixed inset-x-0 top-12 z-70 flex flex-col items-center gap-1.5 px-6">
    <TransitionGroup name="toast-slide" :duration="TOAST_ANIM_MS">
      <button
        v-for="t in ui.toasts"
        :key="t.id"
        type="button"
        class="pointer-events-auto max-w-90 cursor-pointer rounded-lg border px-4 py-2 text-left text-[13px] shadow-md font-kai tracking-wide active:opacity-60 whitespace-pre-line"
        :class="KIND_CLASS[t.kind]"
        @click="ui.dismissToast(t.id)"
      >
        {{ t.text }}
      </button>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
  import { onUnmounted, ref, watch } from 'vue'
  import { useUiStore } from '@/stores/ui'
  import type { Toast } from '@/stores/ui'
  import { playSfx, type SfxName } from '@/core/audio'
  import { createToastAnnouncer, createToastFlashTimer } from '@/ui/toastFlash'

  const ui = useUiStore()

  /**
   * 离场动画时长 —— 必须与 style.css 里 .toast-slide-* 的 0.25s 对齐。
   *
   * 之所以要显式写死:稀有提示带着 animate-glow-pulse(2.4s **无限**动画),
   * 过渡的自动探测会把那 2.4 秒当成离场时长,而无限动画的 animationend 永远不来,
   * 于是它只能等满这个超时 —— 玩家点掉一条提示后,它还得在原地杵两秒才消失,
   * 手感就是「点了没反应」。写死时长让 Vue 到点就摘,不必等 anim.
   */
  const TOAST_ANIM_MS = 250

  const flashId = ref<number | null>(null)
  const flashTimer = createToastFlashTimer(flashId)

  const KIND_CLASS: Record<Toast['kind'], string> = {
    info: 'border-ink/25 text-ink-soft bg-paper',
    success: 'border-jade/60 text-jade bg-paper',
    warn: 'border-cinnabar/60 text-cinnabar bg-paper',
    rare: 'border-gold-ink/70 text-gold-ink bg-paper animate-glow-pulse'
  }

  const KIND_SFX: Record<Toast['kind'], SfxName> = { info: 'info', success: 'success', warn: 'warn', rare: 'rare' }

  const announcer = createToastAnnouncer(
    kind => playSfx(KIND_SFX[kind as Toast['kind']] ?? 'info'),
    id => flashTimer.flash(id)
  )

  // 新 toast 落地时按类型配一声提示音;稀有品级另加全屏金光
  watch(
    () => ui.toasts.map(t => t.id),
    () => announcer.announce(ui.toasts)
  )

  onUnmounted(flashTimer.dispose)
</script>
