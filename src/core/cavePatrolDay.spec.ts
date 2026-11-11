import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useGameStore } from '@/stores/game'
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
    /*
     * `dismissCaveEvent()` 会顺手把「今日已巡游」记进 player ——
     * 那是它生产环境的语义(玩家主动关掉弹窗也算用掉今日一次)。
     * 但在这个 beforeEach 里它只是用来清模块窗的,记下的今日标记会把
     * 「本该触发」的用例全挡掉:实测 `--sequence.shuffle` 下
     * 「纯新人也该有巡游可触」红,报 `expected null not to be null`。
     * 顺序不能反:先 dismiss 清模块窗,再归零 —— 反过来 dismiss 又会写回去。
     */
    usePlayerStore().lastCaveEventDay = 0
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
    /*
     * Math.random→0.1。
     *
     * 原先写 0.6,而 `earlyEventDecay('cavePatrol', 1)` 恰好也返回 0.6 ——
     * `mayTriggerCaveEvent` 的判据是 `if (Math.random() > presence) return null`,
     * 两边相等时虽不返回 null,但**任何一点精度差异都会翻面**,
     * 而 `Math.random` 还被后续的落点/选池两处消费(0.6 落数组中部)。
     * 取 0.1 一并解决两件事:稳定命中 presence,且落点仍在首项(灵田)。
     */
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
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


/**
 * 星象定向的日记号也要挡住「未来日」。
 *
 * 判定是 `current.gameDay === day`(`mansionRedirectCheck`):
 * 未来日会让等号恒不成立,`count >= MANSION_REDIRECT_MAX` 那道每日上限
 * **永远不生效** —— 坏档就能无限定向。与 `wudaoExchange` 同一条处理。
 *
 * 这里的日号来自 `gameDay(totalPlaySec)`(游玩时长折算),不像巡游那样受系统时钟影响;
 * 但坏档可以直接写一个未来值,故仍需读档守卫。
 */
describe('星象定向 · 未来日记号会让每日上限失效', () => {
  it('日记号落在今天之后时归零', () => {
    setActivePinia(createPinia())
    const game = useGameStore()
    game.totalPlaySec = 100 // gameDay = 0
    const player = usePlayerStore()
    player.$patch({ mansionRedirect: { gameDay: 999_999, worldId: 'mortal', count: 1 } } as never)
    player.sanitize()
    expect((player.mansionRedirect as { gameDay?: number } | null)?.gameDay, '未来日记号没被归零 —— 每日上限会失效').toBe(0)
  })

  it('正常日记号原样保留', () => {
    setActivePinia(createPinia())
    const game = useGameStore()
    game.totalPlaySec = 0
    const player = usePlayerStore()
    player.$patch({ mansionRedirect: { gameDay: 0, worldId: 'mortal', count: 1 } } as never)
    player.sanitize()
    expect((player.mansionRedirect as { gameDay?: number } | null)?.gameDay).toBe(0)
    expect((player.mansionRedirect as { count?: number } | null)?.count).toBe(1)
  })
})


/**
 * 两个日号守卫不能依赖 `game.totalPlaySec` 的**当下值**。
 *
 * `sanitizeAllStores` 里 player 先于 game 跑,那一刻 totalPlaySec 可能还是坏值。
 * 首版实时读它算「今天」:坏值 MAX_VALUE 折算成 2e303 天,
 * 任何记录都不再越界,守卫形同虚设(审查意见指出的)。
 * 现改用固定上界(36500 天来自 totalPlaySec 自身的 100 年封顶,取一万留余量)。
 */
describe('日号守卫 · 不依赖尚未修复的 game.totalPlaySec', () => {
  it('totalPlaySec 是坏值时,未来日号仍然被归零', () => {
    setActivePinia(createPinia())
    const game = useGameStore()
    game.totalPlaySec = Number.MAX_VALUE // 尚未被 game.sanitize 修过的坏值
    const player = usePlayerStore()
    player.$patch({
      mansionRedirect: { gameDay: 999_999, worldId: 'mortal', count: 1 },
      wudaoExchange: { gameDay: 999_999, count: 1 }
    } as never)
    player.sanitize()
    expect(
      (player.mansionRedirect as { gameDay?: number } | null)?.gameDay,
      '坏 totalPlaySec 让守卫失效了 —— 定向的每日上限会被绕过'
    ).toBe(0)
    expect(
      (player.wudaoExchange as { gameDay?: number } | null)?.gameDay,
      '坏 totalPlaySec 让守卫失效了 —— 每日兑换额度会被绕过'
    ).toBe(0)
  })
})
