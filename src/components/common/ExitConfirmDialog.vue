<template>
  <BaseModal :open="open" title="退出游戏" @close="dismiss">
    <p class="text-[13px] leading-relaxed text-ink-soft">
      <template v-if="game.started">进度已保存 · 离线收益照常</template>
      <template v-else>暂无存档</template>
    </p>
    <template #footer>
      <div class="grid grid-cols-2 gap-2">
        <button class="btn-ghost w-full" @click="dismiss">再想想</button>
        <button class="btn-seal w-full" @click="confirm">退出</button>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  /** 安卓实体返回键的退出确认;只在原生外壳内生效,Web 与 Electron 不接 */
  import { nextTick, onMounted, onUnmounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
  import { App as CapacitorApp } from '@capacitor/app'
  import { useGameStore } from '@/stores/game'
  import { decideBackAction } from '@/composables/backButton'
  import { handleEscape } from '@/composables/useModalStack'
  import { flushSaveWrites } from '@/utils/storage'
  import BaseModal from './BaseModal.vue'

  const open = ref(false)
  const game = useGameStore()
  const route = useRoute()
  const router = useRouter()

  /** 返回键监听;await 期间已卸载时靠 disposed 撤销 */
  let listener: PluginListenerHandle | null = null
  let disposed = false

  /** 根页:有存档是主页,无存档是欢迎页,与路由守卫同一套判断 */
  function rootName(): 'home' | 'welcome' {
    return game.started ? 'home' : 'welcome'
  }

  /**
   * 注册 backButton 监听后返回键整个交给这里;无监听时 Capacitor 只在有历史时
   * webView.goBack()(AppPlugin.java:49),退不出游戏。
   */
  function onBackButton(): void {
    // 三支的先后收在 composables/backButton.decideBackAction(那里有判据):
    // 弹窗栈优先 → 不在根页先回根页 → 在根页才开退出确认
    const action = decideBackAction(handleEscape(), route.name === rootName())
    if (action === 'close-overlay') return
    if (action === 'go-root') {
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
    // 补活跃时间戳:心跳每 ACTIVE_STAMP_MS(5 秒)才落一次档,不补则最后几秒会被下次离线结算重算
    game.stampActive(Date.now())
    // 等 Vue 把这次变更刷进 store,persist 插件才会把它排进待写队列
    await nextTick()
    // 再显式刷盘:落盘有 SAVE_FLUSH_MS(5 秒)节流,光等微任务等不到它,
    // exitApp() 一执行进程就没了,排队的整批进度会直接丢掉
    flushSaveWrites()
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
