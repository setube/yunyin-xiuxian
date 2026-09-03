<template>
  <header
    class="relative z-20 flex shrink-0 items-center justify-between border-b border-ink/10 bg-paper-deep/90 px-4 py-2 backdrop-blur"
    :style="`padding-top: max(env(safe-area-inset-top), ${Capacitor.isNativePlatform() ? `16px` : `8px`})`"
  >
    <div class="flex items-center gap-2 min-w-0">
      <div class="min-w-0 leading-tight">
        <p class="truncate font-kai text-[13px] tracking-wider text-ink">{{ player.name }}</p>
        <p class="text-[10px] text-ink-faint">{{ player.realmName }}</p>
      </div>
    </div>
    <div class="flex items-center gap-3 text-[11px] text-ink-soft tabular">
      <span class="flex items-center gap-1" title="灵石">
        <GameIcon name="gem" :size="13" class="text-gold-ink" />
        {{ formatGN(resources.spiritStone) }}
      </span>
      <span class="flex items-center gap-1" title="灵气">
        <GameIcon name="wind" :size="13" class="text-azure" />
        {{ formatNum(Math.floor(resources.qi)) }}
      </span>
      <RouterLink to="/settings" class="text-ink-faint active:scale-90">
        <GameIcon name="settings" :size="15" />
      </RouterLink>
    </div>
  </header>
</template>

<script setup lang="ts">
  import { usePlayerStore } from '@/stores/player'
  import { useResourcesStore } from '@/stores/resources'
  import { formatGN, formatNum } from '@/utils/format'
  import { Capacitor } from '@capacitor/core'
  import GameIcon from './GameIcon.vue'

  const player = usePlayerStore()
  const resources = useResourcesStore()
</script>
