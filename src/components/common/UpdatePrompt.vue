<template>
  <Transition name="modal-fade">
    <div v-if="ui.pwaUpdatePending" class="pointer-events-none absolute inset-0 z-50 flex justify-center px-4 pt-14">
      <div
        class="pointer-events-auto flex w-full max-w-90 items-center gap-2 rounded-xl border border-cinnabar/30 bg-paper-deep/95 px-3 py-2.5 shadow-lg backdrop-blur"
        role="status"
      >
        <p class="min-w-0 grow text-[12px] leading-snug text-ink-soft">新版本已就绪</p>
        <!--
          !py-1.5 不可降回 !py-1:11px 字 + 上下各 4px 只有 24.5px,
          低于 28px 触控线(layout-check 的尺子,其余按钮都按它量)。
          这条横幅只在 Service Worker 更新后出现,巡页摸不到,所以更容易漏。
        -->
        <button class="btn-seal shrink-0 !px-2.5 !py-1.5 !text-[11px]" @click="ui.applyPwaUpdate()">重新加载</button>
        <!-- 关闭钮是纯图标:负外边距抵回视觉位移,触面抬到 28px -->
        <button
          class="-my-1 -mr-1 grid h-7 w-7 shrink-0 place-items-center text-ink-faint active:scale-90"
          aria-label="关闭"
          @click="ui.dismissPwaUpdate()"
        >
          <GameIcon name="x" :size="14" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
  import { useUiStore } from '@/stores/ui'
  import GameIcon from './GameIcon.vue'

  const ui = useUiStore()
</script>
