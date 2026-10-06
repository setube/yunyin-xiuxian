<template>
  <!-- 吸顶外壳:滚到顶就钉住,内容从底下穿过(尺寸与遮罩见 .tab-rail) -->
  <div class="tab-rail">
    <!-- 页签轨道:WAI-ARIA tabs 的容器,承载左右键 roving tabindex 导航;
         aria-controls 未加 —— 面板内容是父级槽位、无稳定 id,免得留悬空引用 -->
    <div
      class="card-ink relative flex overflow-hidden p-1"
      role="tablist"
      aria-label="页面"
      @keydown="onTablistKeydown"
    >
      <!-- 墨块滑动指示:随选中页签平滑游走 -->
      <span
        class="pointer-events-none absolute inset-y-1 left-1 rounded-md bg-ink shadow transition-transform duration-300"
        :style="{
          width: `calc((100% - 8px) / ${tabs.length})`,
          transform: `translateX(${activeIdx * 100}%)`,
          transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)'
        }"
      />
      <button
        v-for="t in tabs"
        :key="t.id"
        role="tab"
        :aria-selected="model === t.id"
        :tabindex="model === t.id ? 0 : -1"
        class="relative z-10 flex-1 rounded-md py-1.5 font-kai text-[13px] tracking-[0.2em] transition-colors duration-200"
        :class="model === t.id ? 'text-paper' : 'text-ink-faint active:text-ink-soft'"
        @click="model = t.id"
      >
        {{ t.label }}
        <span
          v-if="t.dot"
          class="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-cinnabar"
          :class="model === t.id ? '' : 'animate-breathe'"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
  import { computed } from 'vue'

  const props = defineProps<{
    tabs: readonly { id: T; label: string; dot?: boolean }[]
  }>()

  const model = defineModel<T>({ required: true })

  const activeIdx = computed(() =>
    Math.max(
      0,
      props.tabs.findIndex(t => t.id === model.value)
    )
  )

  /**
   * WAI-ARIA tabs 键盘导航:左右键在页签间回绕移动(roving tabindex),Home/End 直达首尾。
   * 只在按键落在本组件内某个 tab 按钮上时生效,避免劫持页面其它方向键逻辑。
   * 焦点随激活项移动(roving),点击行为由 button 的 @click 照旧负责。
   */
  function onTablistKeydown(e: KeyboardEvent): void {
    // 焦点永远在某枚 tab 上(其余不可 Tab 进入);非 tab 目标直接放行
    if ((e.target as HTMLElement).getAttribute?.('role') !== 'tab') return
    const count = props.tabs.length
    if (count === 0) return

    let next = activeIdx.value
    switch (e.key) {
      case 'ArrowLeft':
        next -= 1
        break
      case 'ArrowRight':
        next += 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = count - 1
        break
      default:
        return // 其它键不干预
    }
    next = (next + count) % count // 左右键到两端回绕
    e.preventDefault() // 别让方向键顺带滚动页面
    const target = props.tabs[next]
    if (target === undefined) return // 索引必在界内,仅兜底类型收窄
    model.value = target.id
    // 焦点跟着激活项走(roving tabindex 的落点)
    ;(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }
</script>
