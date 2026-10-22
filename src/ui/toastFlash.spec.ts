import { describe, expect, it, vi } from 'vitest'
import { createToastAnnouncer, createToastFlashTimer } from './toastFlash'
import { ref } from 'vue'

describe('稀有提示计时器 · 随宿主撤销', () => {
  it('卸载 dispose 后,到点不再清闪光;重弹前会撤掉旧计时器', async () => {
    vi.useFakeTimers()
    try {
      const flashId = ref<number | null>(null)
      const timer = createToastFlashTimer(flashId, 1200)
      timer.flash(1)
      expect(flashId.value).toBe(1)
      timer.flash(2)
      expect(flashId.value).toBe(2)
      vi.advanceTimersByTime(1200)
      expect(flashId.value, '第二枚计时器到点应清掉第二枚闪光').toBeNull()

      timer.flash(3)
      timer.dispose()
      vi.advanceTimersByTime(5000)
      expect(flashId.value, '卸载后计时器已撤,不该再回调').toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('同帧多条 toast · 各有其声', () => {
  it('只播新增 id;稀有逐条点亮,不被末尾 info 顶掉', () => {
    const sounds: string[] = []
    const flashes: number[] = []
    const announcer = createToastAnnouncer(
      kind => sounds.push(kind),
      id => flashes.push(id)
    )

    announcer.announce([
      { id: 1, kind: 'rare' },
      { id: 2, kind: 'rare' },
      { id: 3, kind: 'info' }
    ])
    expect(sounds).toEqual(['rare', 'rare', 'info'])
    expect(flashes).toEqual([1, 2])

    announcer.announce([
      { id: 2, kind: 'rare' },
      { id: 3, kind: 'info' },
      { id: 4, kind: 'success' }
    ])
    expect(sounds, '旧条重排不重播').toEqual(['rare', 'rare', 'info', 'success'])
    expect(flashes).toEqual([1, 2])
  })
})
