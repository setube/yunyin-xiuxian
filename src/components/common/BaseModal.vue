<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="props.open"
        class="fixed inset-0 flex items-center justify-center bg-ink/45 backdrop-blur-[2px] px-5"
        :class="props.topmost ? 'z-70' : props.top ? 'z-60' : 'z-50'"
        @click.self="onBackdrop"
      >
        <div
          ref="panelRef"
          role="dialog"
          aria-modal="true"
          :aria-label="props.ariaLabel || props.title || undefined"
          tabindex="-1"
          class="modal-panel paper-grain relative w-full max-h-[82vh] flex flex-col overflow-hidden rounded-xl border border-ink/20 bg-paper shadow-2xl outline-none"
          :class="props.wide ? 'max-w-100' : 'max-w-90'"
          @keydown="onPanelKeydown"
        >
          <!-- 卷轴上缘 -->
          <header v-if="props.title || props.closable" class="relative z-10 flex items-center justify-between px-5 pt-4 pb-1 shrink-0">
            <h3 class="font-kai text-lg tracking-[0.2em] text-ink">{{ props.title }}</h3>
            <!--
              关闭键此前只有一枚图标:读屏只念「按钮」(没有可访问名),
              而且连内外边距只有 26px —— 拇指够得着的那条线是 28px。
              补 aria-label 与 30px 触面(负外边距抵消,视觉位置不动)。
            -->
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
            正文的滚动容器。手机上滚动条不显形,内容被弹窗边缘齐刷刷切断时,
            玩家看不出还能往下滚(议题 #21:丹方列表底部只露出下一张卡片的一条圆角)。
            故上下各一道渐隐:那一头还有内容才出现,只画不占位、不吃点击。
            正文盒保留 relative:插槽里绝对定位的东西仍以它为基准、随内容一起滚。
          -->
          <div class="relative z-10 flex min-h-0 grow flex-col">
            <div ref="bodyRef" data-modal-body class="relative min-h-0 grow overflow-y-auto px-5 py-3" @scroll.passive="queueEdges">
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
  import { nextTick, onUnmounted, ref, watch } from 'vue'
  import GameIcon from './GameIcon.vue'

  const props = withDefaults(
    defineProps<{
      open: boolean
      title?: string
      closable?: boolean
      wide?: boolean
      /**
       * 无标题弹窗的可访问名。
       *
       * 有的弹窗自带一张大标题卡(归来 / 寿元将尽 / 突破结果 / 灵脉),
       * 再让 BaseModal 画一遍标题就是重复。但**对话框自己**总得有个名字 ——
       * 不给的话 role=dialog 读出来就是光秃秃一句「对话框」。
       */
      ariaLabel?: string
      /** 顶层弹窗:叠在普通弹窗(z-50)之上,用于详情盖列表等场景 */
      top?: boolean
      /**
       * 最顶层弹窗(z-70,与 toast 同层):叠在 top 弹窗(z-60)之上。
       * 只给「弹框盖详情」这类真嵌套用 —— 词条信息盖在装备详情(它自己就是 top)之上时,
       * 少这一档它会沉到详情下面,玩家只看得见一片被遮暗的边。
       */
      topmost?: boolean
    }>(),
    { title: '', closable: true, wide: false, top: false, topmost: false, ariaLabel: '' }
  )

  const emit = defineEmits<{ close: [] }>()

  /**
   * 焦点管理 —— 弹窗打开时,键盘焦点必须跟着进去,且不许跑出去。
   *
   * 此前弹窗只管 Esc:打开后焦点仍留在背后的按钮上,按 Tab 会一路跑到页面与底部导航
   * (实测连按六次,六次全在弹窗外),读屏用户甚至不知道有个弹窗开了。故:
   *   · 打开时记住是谁打开的,把焦点移进面板(role=dialog + aria-modal);
   *   · Tab/Shift+Tab 在面板内循环,首尾相接;
   *   · 关闭后把焦点还给打开它的那个元素。
   */
  const panelRef = ref<HTMLElement | null>(null)
  let lastFocused: HTMLElement | null = null

  function focusablesIn(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      el => !el.hasAttribute('disabled') && el.offsetParent !== null
    )
  }

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

  // ---- 正文上下渐隐:量「离顶 / 离底还剩多少」,那一头还有内容才亮 ----
  // 只听 scroll 不够:打开时就超长的正文、展开/增删列表、楷体后载撑高,都不经过滚动。
  // 故用 ResizeObserver 盯住正文盒与内容层;没有它的老内核退化为打开时量一次 + 滚动时量。
  const bodyRef = ref<HTMLElement | null>(null)
  const contentRef = ref<HTMLElement | null>(null)
  const edgeTop = ref(false)
  const edgeBottom = ref(false)
  /** 子像素滚动与页面缩放会让「已到底」差零点几像素 */
  const EDGE_SLACK_PX = 2
  let edgeFrame = 0
  let edgeObserver: ResizeObserver | null = null

  function measureEdges(): void {
    const el = bodyRef.value
    if (!el) return
    edgeTop.value = el.scrollTop > EDGE_SLACK_PX
    edgeBottom.value = el.scrollHeight - el.clientHeight - el.scrollTop > EDGE_SLACK_PX
  }

  /** 一帧最多量一次:滚动与尺寸回调都可能一帧来好几次 */
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
  }

  /**
   * 正文回到顶上。同一扇弹窗里整块换内容时用(装备详情与词条转移互切、换看另一件):
   * 滚动盒不重挂,不复位的话新内容会沿用上一屏的滚动位置,开头几行直接在视口外。
   */
  function scrollToTop(): void {
    if (bodyRef.value) bodyRef.value.scrollTop = 0
  }
  defineExpose({ scrollToTop })

  // ---- Esc 关闭:只让最上面一层可关弹窗响应 ----
  // 多弹窗叠放(详情盖列表)时按一次 Esc 只能退最上层,不能逐层全退;
  // 不可关的顶层(离线卷轴/转世确认 `closable=false`)挡在最上时,Esc 不越层去关底下的
  type ModalEntry = { closable: boolean; close: () => void }
  const activeModals: ModalEntry[] = []
  function onWindowKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return
    const top = activeModals[activeModals.length - 1]
    if (top?.closable) {
      e.preventDefault()
      top.close()
    }
  }
  if (typeof window !== 'undefined') window.addEventListener('keydown', onWindowKey)

  const entry: ModalEntry = { closable: props.closable, close: () => emit('close') }
  watch(
    () => props.open,
    open => {
      if (open) {
        activeModals.push(entry)
        // 记住是谁打开的,关闭后把焦点还回去(键盘用户不会"掉到页面顶端")
        lastFocused = document.activeElement as HTMLElement | null
        void nextTick(() => {
          panelRef.value?.focus()
          watchEdges()
        })
      } else {
        const i = activeModals.indexOf(entry)
        if (i >= 0) activeModals.splice(i, 1)
        unwatchEdges()
        const back = lastFocused
        lastFocused = null
        void nextTick(() => {
          if (back && back.isConnected) back.focus()
        })
      }
    },
    { immediate: true }
  )
  watch(
    () => props.closable,
    c => {
      entry.closable = c
    }
  )
  onUnmounted(() => {
    const i = activeModals.indexOf(entry)
    if (i >= 0) activeModals.splice(i, 1)
    unwatchEdges()
  })
</script>
