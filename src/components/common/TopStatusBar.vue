<template>
  <header
    class="relative z-20 flex shrink-0 items-center justify-between border-b border-ink/10 bg-paper-deep/90 px-4 py-2 backdrop-blur"
    :style="`padding-top: max(env(safe-area-inset-top), ${Capacitor.isNativePlatform() ? `20px` : `8px`})`"
  >
    <div class="flex items-center gap-2 min-w-0">
      <div class="min-w-0 leading-tight">
        <p class="truncate font-kai text-[13px] tracking-wider text-ink">{{ player.name }}</p>
        <p class="flex items-center gap-1.5 text-[10px] text-ink-faint">
          <span>{{ player.realmName }}</span>
          <!-- 年龄:寿元将尽时转朱砂,顶栏常驻便于随时察觉 -->
          <span class="tabular" :class="player.lifespanRatio < 0.15 ? 'text-cinnabar' : ''">
            {{ Math.floor(player.age) }}/{{ formatYears(player.lifespanMax) }}
          </span>
          <!-- 轮回次数:从主页人物卡移来,置于全局顶栏常驻 -->
          <span v-if="player.reincarnation.count > 0" class="text-violet-ink">{{ player.reincarnation.count }} 世</span>
        </p>
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
  import { formatGN, formatNum, formatYears } from '@/utils/format'
  import { Capacitor } from '@capacitor/core'
  import GameIcon from './GameIcon.vue'

  const player = usePlayerStore()
  const resources = useResourcesStore()
</script>
