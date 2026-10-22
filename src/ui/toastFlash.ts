import type { Ref } from 'vue'

/**
 * 稀有提示的全屏金光计时器。
 *
 * 它写的是 ToastHost 组件私有的 flashId,所以生命周期必须归宿主:
 * 卸载后回调不再有意义,新提示到来时也要先撤掉上一枚计时器。
 */
export function createToastFlashTimer(flashId: Ref<number | null>, delayMs = 1200): {
  flash(id: number): void
  dispose(): void
} {
  let timer: ReturnType<typeof setTimeout> | undefined

  function dispose(): void {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  function flash(id: number): void {
    dispose()
    flashId.value = id
    timer = setTimeout(() => {
      timer = undefined
      if (flashId.value === id) flashId.value = null
    }, delayMs)
  }

  return { flash, dispose }
}

/**
 * ToastHost 的同帧多条新提示。
 *
 * 转世落地会在同一帧连续 push rare/rare/info。若只盯最后一条,Vue 批处理后
 * 只有末条 info 发声,稀有的金光与音效被吃掉。id 单调递增,凡是超过已播最大
 * id 的新条都各自播一声;稀有级逐条点亮金光。
 */
export interface ToastAnnouncer {
  announce(toasts: readonly { id: number; kind: string }[]): void
}

export function createToastAnnouncer(
  onNew: (kind: string, id: number) => void,
  onRare: (id: number) => void
): ToastAnnouncer {
  let lastAnnouncedId = -1

  return {
    announce(toasts) {
      if (toasts.length === 0) return
      const newest = Math.max(...toasts.map(t => t.id))
      if (newest <= lastAnnouncedId) return
      for (const t of toasts) {
        if (t.id <= lastAnnouncedId) continue
        onNew(t.kind, t.id)
        if (t.kind === 'rare') onRare(t.id)
        lastAnnouncedId = t.id
      }
    }
  }
}
