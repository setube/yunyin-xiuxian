import type { Ref } from 'vue'

/** 稀有提示的全屏金光计时器;写 ToastHost 私有的 flashId,生命周期归宿主 */
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
 * ToastHost 的同帧多条新提示。同帧可能连续 push(如转世落地 rare/rare/info),只盯末条会吞掉稀有的金光与音效。
 * id 单调递增:超过已播最大 id 的各播一声,稀有级逐条点亮金光。
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
      /*
       * **不能假定 toasts 按 id 升序**。
       *
       * store 的同文案去重分支是 `[...toasts.filter(id≠dup), dup]` —— 把旧条挪到末尾,
       * 数组随之变成 `[5, 4]` 这种次序。原实现边遍历边把 `lastAnnouncedId` 推到 5,
       * 轮到 4 时 `4 <= 5` 被判成「已播过」而跳过:那条 rare 仍在屏幕上,
       * 却既不出声也不点金光(实测复现)。
       *
       * 故先筛出真正新增的那些(**按 id 升序**再播,保证同一帧的先后稳定),
       * 遍历结束后才推进 `lastAnnouncedId`。
       */
      const fresh = toasts.filter(t => t.id > lastAnnouncedId).sort((a, b) => a.id - b.id)
      if (fresh.length === 0) return
      for (const t of fresh) {
        onNew(t.kind, t.id)
        if (t.kind === 'rare') onRare(t.id)
      }
      lastAnnouncedId = fresh[fresh.length - 1]!.id
    }
  }
}
