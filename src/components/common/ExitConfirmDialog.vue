<template>
  <BaseModal :open="open" title="暂别修行" @close="dismiss">
    <p class="text-[13px] leading-relaxed text-ink-soft">
      <template v-if="game.started">此去进度自会封存,离开的这段时日照旧在长,归来时一并结算。</template>
      <template v-else>此刻退出,尚无修行痕迹留下。</template>
    </p>
    <template #footer>
      <div class="flex gap-2">
        <button class="btn-ghost flex-1" @click="dismiss">再留片刻</button>
        <button class="btn-seal flex-1" @click="confirm">暂且别过</button>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  /**
   * 安卓实体返回键的归处 —— 打包成 APK 后,返回键是唯一一个能一按就把人踢出游戏的入口。
   * 浏览器里没有这个键,于是整套逻辑只在原生外壳内生效,Web 与 Electron 一概不接。
   */
  import { nextTick, onMounted, onUnmounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
  import { App as CapacitorApp } from '@capacitor/app'
  import { useGameStore } from '@/stores/game'
  import BaseModal from './BaseModal.vue'

  const open = ref(false)
  const game = useGameStore()
  const route = useRoute()
  const router = useRouter()

  /** 已注册的返回键监听;组件在 await 期间就被卸载时,靠 disposed 兜底撤销 */
  let listener: PluginListenerHandle | null = null
  let disposed = false

  /** 退无可退的那一页:有存档是主页,无存档是欢迎页 —— 与路由守卫同一套判断 */
  function rootName(): 'home' | 'welcome' {
    return game.started ? 'home' : 'welcome'
  }

  /**
   * 一旦注册了 backButton 监听,Capacitor 便把返回键整个交出来。
   * 无监听时它只做一件事(AppPlugin.java:49):有历史就 webView.goBack(),没有就什么也不做——
   * 也就是说不接管的话,按返回压根退不出游戏,只会在标签页历史里一路倒着走到卡住。
   */
  function onBackButton(): void {
    // 确认框自己先吃一次返回:否则弹窗开着再按,只会原地打转
    if (open.value) {
      open.value = false
      return
    }
    // 不在根页就先退回根页。各页本是并列的标签页,逐条回溯历史得按上七八次才退得出去
    if (route.name !== rootName()) {
      void router.push({ name: rootName() })
      return
    }
    open.value = true
  }

  function dismiss(): void {
    open.value = false
  }

  async function confirm(): Promise<void> {
    open.value = false
    // 补一记活跃时间戳:心跳每 ACTIVE_STAMP_MS(5 秒)才落一次档,
    // 不补的话最后这几秒会被下次离线结算当成挂机重算一遍
    game.stampActive(Date.now())
    // persist 插件的写盘排在微任务里,等它落完再走
    await nextTick()
    await CapacitorApp.exitApp()
  }

  onMounted(async () => {
    if (!Capacitor.isNativePlatform()) return
    const handle = await CapacitorApp.addListener('backButton', onBackButton)
    if (disposed) {
      void handle.remove()
      return
    }
    listener = handle
  })

  onUnmounted(() => {
    disposed = true
    void listener?.remove()
    listener = null
  })
</script>
