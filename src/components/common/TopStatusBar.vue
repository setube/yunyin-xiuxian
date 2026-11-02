<template>
  <header
    class="relative z-20 flex shrink-0 items-center justify-between gap-2 border-b border-ink/10 bg-paper-deep/90 px-4 py-2 backdrop-blur short:py-1"
    :style="`padding-top: max(env(safe-area-inset-top), ${statusInset}px, ${Capacitor.isNativePlatform() ? `30px` : `8px`})`"
  >
    <!--
      窄屏(320 宽)不许折行:右组 shrink-0、每格 whitespace-nowrap,左组先让位
      (名字、境界名 truncate,左组 overflow-hidden),被裁的只能是「N 世」这种闲格。
    -->
    <div class="flex min-w-0 items-center gap-2 overflow-hidden">
      <div class="min-w-0 leading-tight">
        <p class="truncate font-kai text-[13px] tracking-wider text-ink">{{ player.name }}</p>
        <p class="flex items-center gap-1.5 whitespace-nowrap text-[10px] text-ink-faint">
          <!-- 局促时境界名先省略;寿元与「N 世」shrink-0 -->
          <span class="min-w-0 flex-1 truncate">{{ player.realmName }}</span>
          <!--
            「16/150」视觉上人人都懂,读屏只会念两个数字;补一句「寿元 16载 / 150载」。
            role="img" 不可去:ARIA 规定 generic(无 role 的 span)不接受可访问名,
            裸 span 上的 aria-label 在严格实现里会被丢掉。
          -->
          <span
            role="img"
            class="tabular shrink-0"
            :class="player.lifespanRatio < LIFESPAN_WARN_RATIO ? 'text-cinnabar' : ''"
            :aria-label="`寿元 ${formatYears(player.age)} / ${formatYears(player.lifespanMax)}`"
          >
            {{ Math.floor(player.age) }}/{{ formatYears(player.lifespanMax) }}
          </span>
          <!-- 轮回次数:最闲的一格,340px 以下隐藏,不挤灵石 -->
          <span v-if="player.reincarnation.count > 0" class="hidden shrink-0 text-violet-ink min-[340px]:inline">
            {{ player.reincarnation.count }} 世
          </span>
        </p>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-3 text-[11px] text-ink-soft tabular short:gap-2">
      <!--
        title 只在悬停时补全,读屏不保证念;图标上一轮已 aria-hidden,这里须自带名字。
        同寿元那格:裸 span 属 generic,不接 aria-label,须给个 role 才念得出。
      -->
      <span
        role="img"
        class="flex items-center gap-1 whitespace-nowrap"
        :aria-label="`灵石 ${formatGN(resources.spiritStone)}`"
        title="灵石"
      >
        <GameIcon name="gem" :size="13" class="text-gold-ink" />
        {{ formatGN(resources.spiritStone) }}
      </span>
      <!-- 纯图标入口须自带名字:读屏与自动化都靠它 -->
      <RouterLink
        to="/settings"
        aria-label="设置"
        class="-my-1.5 -mr-1.5 relative flex min-h-[32px] min-w-[32px] items-center justify-center p-1.5 text-ink-faint active:scale-90"
      >
        <GameIcon name="settings" :size="15" />
        <!-- 新发布说明圆点:绝对定位,不挤动 32px 触面 -->
        <span
          v-if="settings.hasUnseenRelease"
          class="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-cinnabar"
          aria-hidden="true"
        />
      </RouterLink>
    </div>
  </header>
</template>

<script setup lang="ts">
  import { usePlayerStore } from '@/stores/player'
  import { useResourcesStore } from '@/stores/resources'
  import { formatGN, formatYears } from '@/utils/format'
  import { LIFESPAN_WARN_RATIO } from '@/data/constants'
  import { Capacitor } from '@capacitor/core'
  import { useNativeInsets } from '@/composables/useNativeInsets'
  import { useSettingsStore } from '@/stores/settings'
  import GameIcon from './GameIcon.vue'

  // 安卓状态栏真实高度(非安卓为 0),与 env() 及保底值取大者
  const { top: statusInset } = useNativeInsets()
  const player = usePlayerStore()
  const resources = useResourcesStore()
  const settings = useSettingsStore()
</script>
