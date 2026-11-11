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

/**
 * 去重重排后不许漏播。
 *
 * store 的同文案去重分支是 `[...toasts.filter(id≠dup), dup]` —— 把旧条挪到末尾,
 * 数组随之变成 `[5, 4]` 这种次序。原实现边遍历边把「已播最大 id」推到 5,
 * 轮到 4 时 `4 <= 5` 被判成播过了而跳过:那条 rare 仍在屏幕上,却既不出声也不点金光。
 *
 * 判据:乱序输入下,每一条新增都要播到,顺序按 id 升序。
 */
describe('同帧多条 toast · 乱序输入不漏播', () => {
  it('去重重排成 [5, 4] 时,4 的那声照样出', () => {
    const sounds: string[] = []
    const flashes: number[] = []
    const announcer = createToastAnnouncer(
      (kind, id) => sounds.push(`${id}:${kind}`),
      id => flashes.push(id)
    )
    // 先播过 1..3
    announcer.announce([
      { id: 1, kind: 'info' },
      { id: 2, kind: 'info' },
      { id: 3, kind: 'info' }
    ])
    sounds.length = 0

    // 同帧新增 4(rare) 与 5(info),随后去重把 4 挪到末尾 → [5, 4]
    announcer.announce([
      { id: 5, kind: 'info' },
      { id: 4, kind: 'rare' }
    ])
    expect(sounds, '两条新增都要播,且按 id 升序').toEqual(['4:rare', '5:info'])
    expect(flashes, 'rare 的金光不许丢').toEqual([4])
  })

  it('完全没有新增时不重复播报', () => {
    const sounds: string[] = []
    const announcer = createToastAnnouncer(kind => sounds.push(kind), () => {})
    announcer.announce([{ id: 1, kind: 'rare' }])
    sounds.length = 0
    // 同一条被挪位置、但没有新 id
    announcer.announce([{ id: 1, kind: 'rare' }])
    expect(sounds, '旧条重排不该重播').toEqual([])
  })
})
