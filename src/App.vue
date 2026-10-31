<template>
  <!-- 桌面端外框:居中手机区域 -->
  <div
    class="app-shell mx-auto flex max-w-107.5 flex-col overflow-hidden bg-paper shadow-[0_0_60px_rgba(0,0,0,0.45)] relative paper-grain"
  >
    <TopStatusBar v-if="game.started && route.name !== 'create'" />

    <main ref="scrollHost" tabindex="-1" class="relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden outline-none">
      <RouterView v-slot="{ Component }">
        <Transition name="page-fade" mode="out-in" @before-enter="resetScroll" @after-enter="focusContent">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <BottomNavigation v-if="game.started && route.name !== 'create'" />

    <!-- 全局浮层 -->
    <ToastHost />
    <UpdatePrompt />
    <OfflineRewardDialog />
    <BreakthroughResultDialog />
    <EventDialog v-if="game.started" />
    <ReincarnationDialog />
    <EquipmentDetailDialog />
    <ExitConfirmDialog />
    <!-- 修炼中偶发事件浮层:须挂全局,否则漏掉窗口期 -->
    <EnlightenmentModal v-if="game.started" />
    <CaveEventModal v-if="game.started" />
  </div>
</template>

<script setup lang="ts">
  import { onMounted, onUnmounted, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { useGameStore } from '@/stores/game'
  import { useUiStore } from '@/stores/ui'
  import { useSettingsStore } from '@/stores/settings'
  import { subscribeSaveWriteFailure } from '@/utils/storage'
  import { engine } from '@/core/engine'
  import { applyTheme, initTheme } from '@/core/theme'
  import { resetModalStack } from '@/composables/useModalStack'
  import { configureAudio, disposeAudio, playSfx, unlockAudio } from '@/core/audio'
  import TopStatusBar from '@/components/common/TopStatusBar.vue'
  import BottomNavigation from '@/components/common/BottomNavigation.vue'
  import ToastHost from '@/components/common/ToastHost.vue'
  import UpdatePrompt from '@/components/common/UpdatePrompt.vue'
  import OfflineRewardDialog from '@/components/offline/OfflineRewardDialog.vue'
  import BreakthroughResultDialog from '@/components/cultivation/BreakthroughResultDialog.vue'
  import EventDialog from '@/components/adventure/EventDialog.vue'
  import ReincarnationDialog from '@/components/character/ReincarnationDialog.vue'
  import EquipmentDetailDialog from '@/components/equipment/EquipmentDetailDialog.vue'
  import ExitConfirmDialog from '@/components/common/ExitConfirmDialog.vue'
  import EnlightenmentModal from '@/components/cultivation/EnlightenmentModal.vue'
  import CaveEventModal from '@/components/dongfu/CaveEventModal.vue'

  const game = useGameStore()
  const ui = useUiStore()
  const settings = useSettingsStore()
  const route = useRoute()

  /** 内容区滚动宿主:滚动条在常驻的 main 上,不在 window */
  const scrollHost = ref<HTMLElement | null>(null)

  /**
   * 切页归零滚动 + 焦点回到内容区。
   * 滚动:main 常驻,scrollTop 会被下一页继承;router 的 scrollBehavior 只管 window,不顶用。
   * 焦点:不挪的话键盘/读屏焦点还停在旧页那个已经不在 DOM 里的链接上,浏览器把它甩回 body,
   * 下一次 Tab 从文档开头重新数起,读屏也不播报「换页了」。main 上 tabindex=-1 只让它可编程聚焦、不进 Tab 序。
   * 挂 before-enter 而非 watch(route):out-in 下此刻旧页已离场,不会跳回顶部。
   */
  function resetScroll(): void {
    if (scrollHost.value) scrollHost.value.scrollTop = 0
  }

  /**
   * 焦点挪进内容区,须在 after-enter,不能在 before-enter:
   * out-in 下 beforeEnter 时旧页还在离场,新页尚未插入,此刻 focus() 会被离场收尾抢回。
   * main 的 tabindex=-1 只让它可编程聚焦、不进 Tab 序。
   */
  function focusContent(): void {
    scrollHost.value?.focus({ preventScroll: true })
  }

  let unsubscribeTheme: () => void = () => undefined
  let unsubscribeSaveFailure: () => void = () => undefined

  /** 首次交互后才能出声(浏览器策略);按钮附带点击音 */
  function onPointerDown(e: PointerEvent): void {
    unlockAudio()
    if ((e.target as HTMLElement | null)?.closest('button')) playSfx('click')
  }

  // 音量 0~100 → 0~1
  watch(
    () => [settings.musicOn, settings.sfxOn, settings.musicVol, settings.sfxVol] as const,
    ([musicOn, sfxOn, musicVol, sfxVol]) => {
      configureAudio({ musicOn, sfxOn, musicVol: musicVol / 100, sfxVol: sfxVol / 100 })
    },
    { immediate: true }
  )

  // 主题;auto 时随系统切换
  watch(
    () => settings.theme,
    t => applyTheme(t),
    { immediate: true }
  )

  // 减少动效类挂 body 而非 .app-shell:Teleport 到 body 的弹层在 .app-shell 之外,吃不到后代选择器
  watch(
    () => settings.reduceMotion,
    v => document.body.classList.toggle('reduce-motion', v),
    { immediate: true }
  )

  onMounted(() => {
    unsubscribeTheme = initTheme(() => settings.theme)
    // 存档写入失败 / 恢复各报一次:订阅只在状态翻转时回调
    unsubscribeSaveFailure = subscribeSaveWriteFailure(failure => {
      if (failure) ui.toast('存档写入失败', 'warn')
      else ui.toast('存档已恢复写入', 'info')
    })
    engine.start()
    window.addEventListener('pointerdown', onPointerDown)
  })

  onUnmounted(() => {
    unsubscribeTheme()
    unsubscribeSaveFailure()
    engine.stop()
    resetModalStack()
    disposeAudio()
    window.removeEventListener('pointerdown', onPointerDown)
  })
</script>
