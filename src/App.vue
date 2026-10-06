<template>
  <!-- 桌面端外框:居中手机区域 -->
  <div
    class="app-shell mx-auto flex max-w-107.5 flex-col overflow-hidden bg-paper shadow-[0_0_60px_rgba(0,0,0,0.45)] relative paper-grain"
    :class="{ 'reduce-motion': settings.reduceMotion }"
  >
    <!--
      云雾装饰 —— 必须关在自己的一层裁剪盒里。

      这两团雾是**故意越界**画的(左上 -64px、右下 -96px)才好看,但它们若直接挂在
      外壳上,就会把 overflow-hidden 的外壳撑出一段可以滚动的横向溢出(实测
      scrollWidth 516 vs clientWidth 390)。外壳本身是 overflow-hidden,玩家滚不动,
      可浏览器会——建号结束时焦点回到 body,浏览器顺手把它 scrollLeft 设成 24,
      此后整个界面**永久左移 24px**:顶栏的名字与「炼气·一层」被切掉左半边,
      底部第一栏的「洞府」只剩半个字。这不是理论,375/320/430 三档宽度都能复现。
      故装饰归装饰:外包一层 inset-0 overflow-hidden,越界部分在这里被裁掉,
      不再进入外壳的滚动区。
    -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -top-24 -left-16 h-64 w-96 rounded-full bg-white/40 blur-3xl animate-mist" />
      <div class="absolute top-1/3 -right-24 h-72 w-80 rounded-full bg-white/30 blur-3xl animate-mist-slow" />
    </div>

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
    <UpdatePrompt />
    <OfflineRewardDialog />
    <BreakthroughResultDialog />
    <EventDialog v-if="game.started" />
    <ReincarnationDialog />
    <EquipmentDetailDialog />
    <ExitConfirmDialog />
    <!-- 修炼中偶发事件浮层(引擎触发、组件轮询展示;挂在全局才不会漏掉窗口期) -->
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
  import { configureAudio, playSfx, stopBgm, unlockAudio } from '@/core/audio'
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

  /** 内容区滚动宿主(滚动条挂在这个常驻的 main 上,不是 window) */
  const scrollHost = ref<HTMLElement | null>(null)

  /**
   * 切页时把内容区滚动位置归零。
   * main 是常驻元素,路由切换只替换它的子组件,它自身从不重建,scrollTop 会被
   * 下一个页面原样继承。router 的 scrollBehavior 在这里不顶用——那个 API 操作
   * 的是 window,而外层 .app-shell + overflow-hidden 让 window 根本不产生滚动。
   * 挂在 before-enter 而非 watch(route):out-in 模式下这一刻旧页面已完全离场,
   * 归零不会让正在播离场动画的旧页面突然跳回顶部。
   */
  function resetScroll(): void {
    if (scrollHost.value) scrollHost.value.scrollTop = 0
  }

  let unsubscribeTheme: () => void = () => undefined
  let unsubscribeSaveFailure: () => void = () => undefined

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
    /*
     * 存档写不进去必须让玩家知道:静默失败意味着从现在起的进度都不会进档,
     * 而他可能正玩得兴起。这里只说两件事 —— 出事了(并给出可做的事:导出备份),
     * 以及什么时候好了。反复失败不重复弹(订阅只在状态翻转时回调)。
     */
    unsubscribeSaveFailure = subscribeSaveWriteFailure(failure => {
      if (failure) ui.toast('存档写入失败 —— 浏览器存储可能已满,建议先导出备份', 'warn')
      else ui.toast('存档已恢复写入', 'info')
    })
    engine.start()
    window.addEventListener('pointerdown', onPointerDown)
  })

  onUnmounted(() => {
    unsubscribeTheme()
    unsubscribeSaveFailure()
    engine.stop()
    stopBgm()
    window.removeEventListener('pointerdown', onPointerDown)
  })
</script>
