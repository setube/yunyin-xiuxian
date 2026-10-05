<template>
  <header
    class="relative z-20 flex shrink-0 items-center justify-between gap-2 border-b border-ink/10 bg-paper-deep/90 px-4 py-2 backdrop-blur short:py-1"
    :style="`padding-top: max(env(safe-area-inset-top), ${statusInset}px, ${Capacitor.isNativePlatform() ? `30px` : `8px`})`"
  >
    <!--
      窄屏不许折行:320 宽时右组的「9 兆」「25.33 亿」与左组的「3000/1000 亿载」
      曾被压成两行,顶栏从 46px 涨到 58px,数字看着像乱码。故右组 shrink-0(整组
      不参与收缩)、每格 whitespace-nowrap(数不许断行),让左组先让位:
      名字 truncate、境界行 overflow-hidden,被裁掉的尾巴只能是「N 世」这种闲格。
    -->
    <div class="flex min-w-0 items-center gap-2 overflow-hidden">
      <div class="min-w-0 leading-tight">
        <p class="truncate font-kai text-[13px] tracking-wider text-ink">{{ player.name }}</p>
        <p class="flex items-center gap-1.5 whitespace-nowrap text-[10px] text-ink-faint">
          <span>{{ player.realmName }}</span>
          <!-- 年龄:寿元将尽时转朱砂,顶栏常驻便于随时察觉 -->
          <span class="tabular" :class="player.lifespanRatio < LIFESPAN_WARN_RATIO ? 'text-cinnabar' : ''">
            {{ Math.floor(player.age) }}/{{ formatYears(player.lifespanMax) }}
          </span>
          <!--
            轮回次数:从主页人物卡移来,置于全局顶栏常驻。
            但它是最闲的一格 —— 340px 以下宁可不要,也不能把灵石与灵气挤走。
          -->
          <span v-if="player.reincarnation.count > 0" class="hidden text-violet-ink min-[340px]:inline">
            {{ player.reincarnation.count }} 世
          </span>
        </p>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-3 text-[11px] text-ink-soft tabular short:gap-2">
      <span class="flex items-center gap-1 whitespace-nowrap" title="灵石">
        <GameIcon name="gem" :size="13" class="text-gold-ink" />
        {{ formatGN(resources.spiritStone) }}
      </span>
      <span class="flex items-center gap-1 whitespace-nowrap" title="灵气">
        <GameIcon name="wind" :size="13" class="text-azure" />
        {{ formatNum(Math.floor(resources.qi)) }}
        <!--
          灵气只给当前值不给上限,玩家不知道「离满还差多少」(充盈/突破都以 qiCapValue 为界)。
          但 380px 以下让位:顶栏右组整组 shrink-0,多一节说不定又把 320 逼回两行去
        -->
        <span class="hidden text-ink-faint/70 min-[380px]:inline">/{{ formatNum(Math.floor(player.qiCapValue)) }}</span>
      </span>
      <!-- 只有图标的入口必须自带名字:否则读屏只会念「链接」,自动化也点不着它 -->
      <RouterLink
        to="/settings"
        aria-label="设置"
        class="-my-1.5 -mr-1.5 flex min-h-[32px] min-w-[32px] items-center justify-center p-1.5 text-ink-faint active:scale-90"
      >
        <GameIcon name="settings" :size="15" />
      </RouterLink>
    </div>
  </header>
</template>

<script setup lang="ts">
  import { usePlayerStore } from '@/stores/player'
  import { useResourcesStore } from '@/stores/resources'
  import { formatGN, formatNum, formatYears } from '@/utils/format'
  import { LIFESPAN_WARN_RATIO } from '@/data/constants'
  import { Capacitor } from '@capacitor/core'
  import { useNativeInsets } from '@/composables/useNativeInsets'
  import GameIcon from './GameIcon.vue'

  // 安卓状态栏的真实高度(非安卓为 0);与 env() 及原有的 40px 保底取大者,只会更准不会更矮
  const { top: statusInset } = useNativeInsets()
  const player = usePlayerStore()
  const resources = useResourcesStore()
</script>
