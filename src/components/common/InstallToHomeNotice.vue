<template>
  <!--
    iOS 上的存档风险提示。只在「iOS 且还没装到主屏幕」时出现(见 utils/platform.ts),
    其他平台一个字都不说 —— 安卓 APK 与 Windows 桌面用的是应用自己的存储,不吃这条规则。

    两种用法:
      · 主页(默认)—— 玩家第一次进来就能看见;「知道了」关掉之后永不再出现。
      · 设置页(permanent)—— 不显示关闭按钮,常驻可查:回头想装时找得到那两步。
        与坏档提示同一套做法:一次性的提醒之外,得有个地方能把话再读一遍。
  -->
  <div v-if="visible" class="card-ink border-azure/30 px-4 py-3">
    <p class="font-kai text-[13px] tracking-wider text-ink">把游戏「添加到主屏幕」</p>
    <p class="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
      iOS 在网页七天没被打开之后会清掉它的本地数据 —— 存档就存在那里,连离线缓存一起。
      添加到主屏幕后,游戏以独立应用的样子存在,不受这条规则约束。
    </p>
    <p class="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
      用 Safari 打开本页 → 点底部的分享按钮 → 选「添加到主屏幕」。
    </p>
    <button v-if="!permanent" class="-my-1 mt-2 py-2 text-[11px] text-ink-faint underline" @click="dismiss">知道了</button>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { probeEnv, shouldSuggestInstall } from '@/utils/platform'
  import { useSettingsStore } from '@/stores/settings'

  const props = withDefaults(defineProps<{ permanent?: boolean }>(), { permanent: false })

  const settings = useSettingsStore()

  const visible = computed(() => shouldSuggestInstall(probeEnv()) && (props.permanent || !settings.installNoticeDismissed))

  function dismiss(): void {
    settings.installNoticeDismissed = true
  }
</script>
