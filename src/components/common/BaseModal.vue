<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="props.open"
        class="fixed inset-0 flex items-center justify-center bg-ink/45 backdrop-blur-[2px] px-5"
        :style="{ zIndex }"
        @click.self="onBackdrop"
      >
        <div
          ref="panelRef"
          role="dialog"
          aria-modal="true"
          :aria-label="props.ariaLabel || props.title || undefined"
          tabindex="-1"
          class="modal-panel paper-grain relative w-full max-h-[82vh] flex flex-col overflow-hidden rounded-xl border border-ink/20 bg-paper shadow-2xl outline-none"
          :class="[props.wide ? 'max-w-100' : 'max-w-90', props.panelClass]"
          @keydown="onPanelKeydown"
        >
          <!-- 卷轴上缘 -->
          <header v-if="props.title || props.closable" class="relative z-10 flex items-center justify-between px-5 pt-4 pb-1 shrink-0">
            <h3 class="font-kai text-lg tracking-[0.2em] text-ink" :class="props.titleClass">{{ props.title }}</h3>
            <!-- aria-label 供读屏;30px 触面(负外边距抵消,视觉位置不动),下限 28px -->
            <button
              v-if="props.closable"
              class="p-1.5 -m-1.5 text-ink-faint active:scale-90"
              aria-label="关闭"
              @click="emit('close')"
            >
              <GameIcon name="x" :size="18" />
            </button>
          </header>
          <!--
            正文滚动容器:手机滚动条不显形,上下各一道渐隐,那一头还有内容才出现,不占位、不吃点击(议题 #21)。
            正文盒须保留 relative:插槽里绝对定位的东西以它为基准、随内容一起滚。
          -->
          <div class="relative z-10 flex min-h-0 grow flex-col">
            <!-- 可滚时进 Tab 序:焦点在面板上时方向键滚不动它(它不是面板的祖先) -->
            <div
              ref="bodyRef"
              data-modal-body
              class="relative min-h-0 grow overflow-y-auto px-5 py-3"
              :tabindex="scrollable ? 0 : undefined"
              @scroll.passive="queueEdges"
            >
              <div ref="contentRef">
                <slot />
              </div>
            </div>
            <div v-show="edgeTop" class="modal-edge modal-edge-top" aria-hidden="true" />
            <div v-show="edgeBottom" class="modal-edge modal-edge-bottom" aria-hidden="true" />
          </div>
          <footer v-if="$slots.footer" class="relative z-10 px-5 pb-5 pt-2 shrink-0">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
  import GameIcon from './GameIcon.vue'
  import {
    focusablesIn,
    handOffReturnFocus,
    isTopModal,
    openerFor,
    pushModal,
    releaseReturnFocus,
    removeModal,
    restoreFocus,
    stackedZ,
    useModalEntry,
    type ModalStackEntry
  } from '@/composables/useModalStack'

  const props = withDefaults(
    defineProps<{
      open: boolean
      title?: string
      closable?: boolean
      wide?: boolean
      /** 无标题弹窗的可访问名(自带大标题卡者用:归来 / 寿元将尽 / 突破结果 / 灵脉) */
      ariaLabel?: string
      /** 顶层弹窗:叠在普通弹窗(z-50)之上,用于详情盖列表等场景 */
      top?: boolean
      /** 最顶层弹窗(z-70,与 toast 同层):叠在 top 弹窗(z-60)之上,只给真嵌套用(如词条信息盖装备详情) */
      topmost?: boolean
      /**
       * 附加到面板的类(形制层)。只给「这件东西值得单独一套外观」的少数调用点用;
       * 语义色不许从这里传 —— 颜色走 style.css 的 token,传进来的应是形制类(如最上档的 .luster-frame)。
       */
      panelClass?: string
      /** 附加到标题的类(形制层);同样只放形制类,颜色走 token */
      titleClass?: string
    }>(),
    { title: '', closable: true, wide: false, top: false, topmost: false, ariaLabel: '', panelClass: '', titleClass: '' }
  )

  const emit = defineEmits<{ close: [] }>()

  /** 焦点管理:打开时焦点移进面板,Tab/Shift+Tab 在面板内首尾循环,关闭后还给打开它的元素 */
  const panelRef = ref<HTMLElement | null>(null)

  function onPanelKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return
    const panel = panelRef.value
    if (!panel) return
    const items = focusablesIn(panel)
    if (items.length === 0) {
      e.preventDefault()
      panel.focus()
      return
    }
    const first = items[0]!
    const last = items[items.length - 1]!
    const active = document.activeElement as HTMLElement | null
    const outside = !active || !panel.contains(active)
    if (e.shiftKey) {
      if (outside || active === first) {
        e.preventDefault()
        last.focus()
      }
    } else if (outside || active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function onBackdrop(): void {
    if (props.closable) emit('close')
  }

  // ---- 正文上下渐隐 ----
  // 只听 scroll 不够:初始超长、列表增删、楷体后载撑高都不经过滚动,故加 ResizeObserver;
  // 没有它的老内核退化为打开时量一次 + 滚动时量。
  const bodyRef = ref<HTMLElement | null>(null)
  const contentRef = ref<HTMLElement | null>(null)
  const edgeTop = ref(false)
  const edgeBottom = ref(false)
  const scrollable = ref(false)
  /** 子像素滚动与页面缩放会让「已到底」差零点几像素 */
  const EDGE_SLACK_PX = 2
  let edgeFrame = 0
  let edgeObserver: ResizeObserver | null = null

  function measureEdges(): void {
    const el = bodyRef.value
    if (!el) return
    edgeTop.value = el.scrollTop > EDGE_SLACK_PX
    edgeBottom.value = el.scrollHeight - el.clientHeight - el.scrollTop > EDGE_SLACK_PX
    scrollable.value = el.scrollHeight - el.clientHeight > EDGE_SLACK_PX
  }

  /** 一帧最多量一次 */
  function queueEdges(): void {
    if (edgeFrame) return
    edgeFrame = requestAnimationFrame(() => {
      edgeFrame = 0
      measureEdges()
    })
  }

  function watchEdges(): void {
    unwatchEdges()
    measureEdges()
    if (typeof ResizeObserver === 'undefined') return
    edgeObserver = new ResizeObserver(queueEdges)
    if (bodyRef.value) edgeObserver.observe(bodyRef.value)
    if (contentRef.value) edgeObserver.observe(contentRef.value)
  }

  function unwatchEdges(): void {
    edgeObserver?.disconnect()
    edgeObserver = null
    if (edgeFrame) cancelAnimationFrame(edgeFrame)
    edgeFrame = 0
    edgeTop.value = false
    edgeBottom.value = false
    scrollable.value = false
  }

  /** 正文滚回顶部:同一弹窗整块换内容时用(滚动盒不重挂,不复位会沿用上一屏位置) */
  function scrollToTop(): void {
    if (bodyRef.value) bodyRef.value.scrollTop = 0
  }
  defineExpose({ scrollToTop, raise })

  // ---- Esc 关闭:只让全站栈顶那层响应 ----
  // 不可关的顶层(`closable=false`)挡在最上时,Esc 不越层去关底下的。
  // 栈须是模块级单栈:各实例各持一份时,每扇窗都以为自己是栈底。
  // 还焦点目标挂在栈条目上:叠回最上时要改指别层记的目标
  const entry: ModalStackEntry = {
    closable: props.closable,
    close: () => emit('close'),
    focus: () => panelRef.value?.focus(),
    panel: () => panelRef.value
  }
  useModalEntry(entry)

  // ---- 叠放:跟栈走,看得见的顶层就是 Esc 关的那层 ----
  /** 档位底线:普通 50 / top 60 / topmost 70 */
  const floorZ = computed(() => (props.topmost ? 70 : props.top ? 60 : 50))
  const liveZ = computed(() => stackedZ(entry))
  /** 淡出期间停在原位,不跌到别的窗下面 */
  const leavingZ = ref<number | null>(null)
  const zIndex = computed(() => liveZ.value ?? leavingZ.value ?? floorZ.value)

  watch(
    () => props.open,
    open => {
      if (open) {
        leavingZ.value = null
        entry.floor = floorZ.value
        pushModal(entry)
        // 焦点还停在同一拍刚关的窗里时,记那扇窗的打开者
        entry.returnFocus = openerFor(document.activeElement)
        void nextTick(() => {
          panelRef.value?.focus()
          watchEdges()
        })
      } else {
        leavingZ.value = liveZ.value
        removeModal(entry)
        unwatchEdges()
        const back = entry.returnFocus ?? null
        const panel = panelRef.value
        entry.returnFocus = null
        // 别层记在本面板里的还焦点目标改指本层打开者:面板淡出后它们随之卸载
        if (panel && back) releaseReturnFocus(panel, back)
        void nextTick(() => {
          // 先判 back:SSR 渲染初始关闭的弹窗也走这里,没有 document
          if (!back) return
          restoreFocus(panel, back, document.activeElement, document.body)
        })
      }
    },
    { immediate: true }
  )

  /** 叠回最上层:开着时被别的窗里的操作换了内容(如离线卷轴里点开装备),不在下面悄悄换 */
  function raise(): void {
    if (!props.open || isTopModal(entry)) return
    const active = document.activeElement as HTMLElement | null
    const panel = panelRef.value
    if (panel && active && !panel.contains(active)) {
      handOffReturnFocus(panel, entry.returnFocus ?? null)
      entry.returnFocus = active
    }
    pushModal(entry)
    void nextTick(() => panelRef.value?.focus())
  }

  watch(
    () => props.closable,
    c => {
      entry.closable = c
    }
  )
  onUnmounted(() => {
    removeModal(entry)
    unwatchEdges()
  })
</script>
