import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { todayLocalNum } from '@/utils/time'
import { getCurrentCaveEvent, mayTriggerCaveEvent } from './earlyGameService'

/**
 * 洞府巡游 · 每日一巡的跨天守卫(day-flip)。
 * mayTriggerCaveEvent 以 lastCaveEventDay === todayLocalNum() 决定"今日已巡游";
 * 同日被挡、翌日(陈旧 lastCaveEventDay)恢复可巡,是这一类每日玩法的核心不变量。
 * 刻意放独立文件:mayTriggerCaveEvent 持有模块级 caveEvent,独立进程保证初始为空,
 * 避免与 earlyGameService.spec 的巡游用例互相串状态。
 */
describe('洞府巡游 · 每日一巡(跨天再触发)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('当日已巡游后不再触发(同日守卫先于掷签)', () => {
    // 掷签必中(Math.random→0),排除"存在感失败"对同日守卫的干扰:
    // 即便该触发本应成功,lastCaveEventDay===今日 也在掷签之前把它挡下
    vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const player = usePlayerStore()
      player.major = 1
      player.markCaveEventToday(todayLocalNum())
      expect(mayTriggerCaveEvent()).toBeNull()
      // 且没有留下未处理事件
      expect(getCurrentCaveEvent()).toBeNull()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('翌日(lastCaveEventDay 陈旧)恢复可巡游:掷签成功即触发事件', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const player = usePlayerStore()
      player.major = 1
      // 模拟一个昨天巡游过的档,今天再来 → 不该被同日守卫挡住
      player.lastCaveEventDay = todayLocalNum() - 1
      const ev = mayTriggerCaveEvent()
      expect(ev).not.toBeNull()
      expect(getCurrentCaveEvent()).not.toBeNull()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('落点只发生在盖了对应建筑的地方:纯新人一座没盖,回落到灵田而非丹炉/灵兽园', () => {
    // Math.random→0.6:旧实现会取到数组中部(如 array/丹炉),却没盖那些楼;
    // 新实现按已建建筑过滤,一座没盖回落 field(灵草恒有意义)
    vi.spyOn(Math, 'random').mockReturnValue(0.6)
    try {
      const player = usePlayerStore()
      player.major = 1 // 炼气:存在感 1,必触发
      expect(mayTriggerCaveEvent(), '纯新人也该有巡游可触').not.toBeNull()
      expect(getCurrentCaveEvent()!.location, '没盖对应建筑,不得落在丹炉/灵兽园等').toBe('field')
    } finally {
      vi.restoreAllMocks()
    }
  })
})
