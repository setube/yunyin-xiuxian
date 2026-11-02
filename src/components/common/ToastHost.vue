<template>
  <!-- 稀有品全屏金光 -->
  <div v-if="flashId !== null" :key="flashId" class="rare-flash" />
  <!--
    外框 pointer-events-none 不吃事件。
    role=status + aria-live=polite 挂在这层实际渲染的 <div> 上:
    TransitionGroup 是 fragment,不产元素,把属性写它上面会被整个丢掉(实测 DOM 里查不到 role="status")。
    polite 不打断当前朗读;aria-atomic=false 逐条播报,不把同帧多条拼成一句。

    **提示条本体不吃事件,只有右侧关闭钮吃**。
    它浮在 top-12、最多叠五条约 260px,整条可点就等于一层盖住内容的透明遮罩:
    实测 /inventory 有 12 个可点元素被压住,每个 2.6 秒(稀有 4.2 秒),那段时间点不动。
    条身穿透之后,被盖住的按钮照常能点;关闭改由右侧的小叉承担。
  -->
  <div
    class="pointer-events-none fixed inset-x-0 top-12 z-70 flex flex-col items-center gap-1.5 px-6"
    role="status"
    aria-live="polite"
    aria-atomic="false"
  >
    <TransitionGroup name="toast-slide" :duration="TOAST_ANIM_MS">
      <!--
        tabindex=-1:toast 是 2.6 秒自动消失的状态播报,内容已由外层 role=status 念出。
        若进 Tab 序,键盘用户会跳到一条随时消失的元素上,焦点随之落空。
        键盘用户不必操作它 —— 它也自己会散。
      -->
      <div
        v-for="t in ui.toasts"
        :key="t.id"
        class="pointer-events-none relative max-w-90 rounded-lg border px-4 py-2 pr-8 text-left text-[13px] shadow-md font-kai tracking-wide whitespace-pre-line"
        :class="KIND_CLASS[t.kind]"
      >
        {{ t.text }}
        <!--
          关闭钮是整条提示里唯一吃事件的元素。刻意用 tabindex="-1":
          与提示本体同理,键盘焦点不该落到一条即将消失的元素上。
          视觉上做成右侧的小叉,热区按 28px 触控线下限撑开。
        -->
        <button
          type="button"
          tabindex="-1"
          class="pointer-events-auto absolute right-0 top-0 grid h-7 w-7 place-items-center rounded text-[13px] leading-none opacity-50 active:opacity-80"
          aria-label="关闭提示"
          @click="ui.dismissToast(t.id)"
        >
          ×
        </button>
      </div>
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
   * 离场动画时长,须与 style.css 里 .toast-slide-* 的 0.25s 对齐。
   * 须显式写死:稀有提示的 animate-glow-pulse 是 2.4s 无限动画,自动探测会把它当成离场时长。
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

  // 新 toast 按类型配提示音;稀有另加全屏金光
  watch(
    () => ui.toasts.map(t => t.id),
    () => announcer.announce(ui.toasts)
  )

  onUnmounted(flashTimer.dispose)
</script>
