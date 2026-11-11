import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { todayLocalNum } from '@/utils/time'
import { dismissCaveEvent, getCurrentCaveEvent, mayTriggerCaveEvent } from './earlyGameService'

/**
 * 洞府巡游跨天守卫:mayTriggerCaveEvent 以 `lastCaveEventDay >= todayLocalNum()` 判今日已巡游。
 * 独立文件:mayTriggerCaveEvent 持有模块级 caveEvent,避免与 earlyGameService.spec 串状态。
 *
 * 判据用 `>=` 而非 `===`:等号只挡「今天抽过」,把系统时间**调回昨天**时
 * today 变小、记录仍是较大的值,等号不成立 → 巡游重新可抽。
 * 调快那一侧 `player.sanitize` 已把未来日归零,调慢这一侧原先没挡。
 */
describe('洞府巡游 · 每日一巡(跨天再触发)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    /*
     * `mayTriggerCaveEvent` 持有**模块级** caveEvent,而它在 `if (caveEvent) return caveEvent`
     * 处直接短路、与日期无关。不清掉它,前一个用例开出来的事件会让后一个用例
     * 无论日期怎么设都「触发」——实测两条日期判据就是这么假红的。
     */
    dismissCaveEvent()
  })

  it('当日已巡游后不再触发(同日守卫先于掷签)', () => {
    // 掷签必中(Math.random→0),排除存在感失败的干扰
    vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const player = usePlayerStore()
      player.major = 1
      player.markCaveEventToday(todayLocalNum())
      expect(mayTriggerCaveEvent()).toBeNull()
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
      player.lastCaveEventDay = todayLocalNum() - 1
      const ev = mayTriggerCaveEvent()
      expect(ev).not.toBeNull()
      expect(getCurrentCaveEvent()).not.toBeNull()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('时钟调快留下的未来日,也不该让今日巡游放行', () => {
    /*
     * `player.sanitize` 会把未来日归零,但那是**读档时机**的事;
     * 运行期时钟被调快后 lastCaveEventDay 会是未来日,而 `>=` 仍然挡住它。
     */
    vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const player = usePlayerStore()
      player.major = 1
      player.lastCaveEventDay = todayLocalNum() + 1
      expect(mayTriggerCaveEvent(), '未来日被当成「今天没抽」了').toBeNull()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('时钟调回昨天,不该让巡游重来(等号判据会漏这一侧)', () => {
    /*
     * 记录是「今天」,而此刻拿到的 today 因为时钟回拨变成了更小的值 ——
     * 这正是 `===` 漏掉的那个场景:`lastDay !== today` 为真,巡游重新可抽。
     */
    vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const player = usePlayerStore()
      player.major = 1
      const realToday = todayLocalNum()
      player.markCaveEventToday(realToday)
      // 把「今天」往回拨一天
      const back = vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 86_400_000)
      expect(mayTriggerCaveEvent(), '时钟回拨后巡游重来了 —— 等号判据漏了这一侧').toBeNull()
      back.mockRestore()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('今天巡游过 → 时钟回拨 → 重载,仍然抽不了', () => {
    /*
     * 审查意见指出的第二层:`player.sanitize` 原先把未来日**归零**,
     * 而归零的语义是「从未巡游过」—— 时钟回拨后重载,今天巡游过的记录
     * 反而变成了「可以再抽」。现改为**夹到今天**:既挡住未来日,也保住「今日已做」。
     */
    setActivePinia(createPinia())
    dismissCaveEvent()
    const player = usePlayerStore()
    player.major = 1
    player.markCaveEventToday(todayLocalNum())

    const back = vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 86_400_000)
    vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      player.sanitize() // 重载时的自愈入口
      expect(player.lastCaveEventDay, 'sanitize 把「今天巡游过」的语义弄丢了').toBe(todayLocalNum())
      expect(mayTriggerCaveEvent(), '回拨后重载,巡游又能抽了').toBeNull()
    } finally {
      back.mockRestore()
      vi.restoreAllMocks()
    }
  })

  it('落点只发生在盖了对应建筑的地方:纯新人一座没盖,回落到灵田而非丹炉/灵兽园', () => {
    // Math.random→0.6:不按已建建筑过滤时会取到数组中部(如 array/丹炉)
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
