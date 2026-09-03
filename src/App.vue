<template>
  <!-- 桌面端外框:居中手机区域 -->
  <div
    class="mx-auto flex h-screen max-w-107.5 flex-col overflow-hidden bg-paper shadow-[0_0_60px_rgba(0,0,0,0.45)] relative paper-grain"
    :class="{ 'reduce-motion': settings.reduceMotion }"
  >
    <!-- 云雾装饰 -->
    <div class="pointer-events-none absolute -top-24 -left-16 h-64 w-96 rounded-full bg-white/40 blur-3xl animate-mist" />
    <div class="pointer-events-none absolute top-1/3 -right-24 h-72 w-80 rounded-full bg-white/30 blur-3xl animate-mist-slow" />

    <TopStatusBar v-if="game.started && route.name !== 'create'" />

    <main ref="scrollHost" class="relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <RouterView v-slot="{ Component }">
        <Transition name="page-fade" mode="out-in" @before-enter="resetScroll">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <BottomNavigation v-if="game.started && route.name !== 'create'" />

    <!-- 全局浮层 -->
    <ToastHost />
    <OfflineRewardDialog />
    <BreakthroughResultDialog />
    <EventDialog v-if="game.started" />
    <ReincarnationDialog />
    <EquipmentDetailDialog />
    <ExitConfirmDialog />
  </div>
</template>

<script setup lang="ts">
  import { onMounted, onUnmounted, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { useGameStore } from '@/stores/game'
  import { useSettingsStore } from '@/stores/settings'
  import { engine } from '@/core/engine'
  import { applyTheme, initTheme } from '@/core/theme'
  import { configureAudio, playSfx, stopBgm, unlockAudio } from '@/core/audio'
  import TopStatusBar from '@/components/common/TopStatusBar.vue'
  import BottomNavigation from '@/components/common/BottomNavigation.vue'
  import ToastHost from '@/components/common/ToastHost.vue'
  import OfflineRewardDialog from '@/components/offline/OfflineRewardDialog.vue'
  import BreakthroughResultDialog from '@/components/cultivation/BreakthroughResultDialog.vue'
  import EventDialog from '@/components/adventure/EventDialog.vue'
  import ReincarnationDialog from '@/components/character/ReincarnationDialog.vue'
  import EquipmentDetailDialog from '@/components/equipment/EquipmentDetailDialog.vue'
  import ExitConfirmDialog from '@/components/common/ExitConfirmDialog.vue'

  const game = useGameStore()
  const settings = useSettingsStore()
  const route = useRoute()

  /** 内容区滚动宿主(滚动条挂在这个常驻的 main 上,不是 window) */
  const scrollHost = ref<HTMLElement | null>(null)

  /**
   * 切页时把内容区滚动位置归零。
   * main 是常驻元素,路由切换只替换它的子组件,它自身从不重建,scrollTop 会被
   * 下一个页面原样继承。router 的 scrollBehavior 在这里不顶用——那个 API 操作
   * 的是 window,而外层 h-dvh + overflow-hidden 让 window 根本不产生滚动。
   * 挂在 before-enter 而非 watch(route):out-in 模式下这一刻旧页面已完全离场,
   * 归零不会让正在播离场动画的旧页面突然跳回顶部。
   */
  function resetScroll(): void {
    if (scrollHost.value) scrollHost.value.scrollTop = 0
  }

  let unsubscribeTheme: () => void = () => undefined

  /** 浏览器要求首次交互后才可出声;顺带给所有按钮一个轻点击音 */
  function onPointerDown(e: PointerEvent): void {
    unlockAudio()
    if ((e.target as HTMLElement | null)?.closest('button')) playSfx('click')
  }

  // 音频偏好实时同步(音量 0~100 → 0~1)
  watch(
    () => [settings.musicOn, settings.sfxOn, settings.musicVol, settings.sfxVol] as const,
    ([musicOn, sfxOn, musicVol, sfxVol]) => {
      configureAudio({ musicOn, sfxOn, musicVol: musicVol / 100, sfxVol: sfxVol / 100 })
    },
    { immediate: true }
  )

  // 主题:立即应用一次,此后跟随设置变化(auto 时系统切换也会实时跟随)
  watch(
    () => settings.theme,
    t => applyTheme(t),
    { immediate: true }
  )

  onMounted(() => {
    unsubscribeTheme = initTheme(() => settings.theme)
    engine.start()
    window.addEventListener('pointerdown', onPointerDown)
  })

  onUnmounted(() => {
    unsubscribeTheme()
    engine.stop()
    stopBgm()
    window.removeEventListener('pointerdown', onPointerDown)
  })
</script>
