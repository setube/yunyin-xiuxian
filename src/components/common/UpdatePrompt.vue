<template>
  <Transition name="modal-fade">
    <div v-if="ui.pwaUpdatePending" class="pointer-events-none absolute inset-0 z-50 flex justify-center px-4 pt-14">
      <div
        class="pointer-events-auto flex w-full max-w-90 items-center gap-2 rounded-xl border border-cinnabar/30 bg-paper-deep/95 px-3 py-2.5 shadow-lg backdrop-blur"
        role="status"
      >
        <p class="min-w-0 grow text-[12px] leading-snug text-ink-soft">
          新版本已就绪,重新加载以应用
        </p>
        <button class="btn-seal shrink-0 !px-2.5 !py-1 !text-[11px]" @click="ui.applyPwaUpdate()">重新加载</button>
        <button
          class="shrink-0 p-1 -mr-1 text-ink-faint active:scale-90"
          aria-label="稍后再说"
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
