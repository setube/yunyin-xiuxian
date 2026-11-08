/** 遗产回声:历史选择 → 世界回应 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { echoFor, echoEligible, ECHO_CHANCE, rollEventNarrative } from './fortuneEcho'
import { usePlayerStore } from '@/stores/player'
import { resolveEventChoice } from './eventEngine'
import { eventDef, FORTUNE_EVENTS } from '@/data/events'
import { recordEvent } from './worldMemory'

describe('遗产回声(fortuneEcho)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('新玩家:永不回声(无 leave 记录)', () => {
    const player = usePlayerStore()
    player.setFortuneChoices({})
    expect(echoEligible('ft_reclusive_elder')).toBe(false)
    expect(echoFor('ft_reclusive_elder')).toBeNull()
  })

  it('leave 过的机缘可回声', () => {
    const player = usePlayerStore()
    player.setFortuneChoices({ ft_reclusive_elder: 'leave' })
    expect(echoEligible('ft_reclusive_elder')).toBe(true)
    const echo = echoFor('ft_reclusive_elder')!
    expect(echo.line).toContain('原来是你')
    expect(echo.form).toBe('recognize')
  })

  it('take 过的机缘不触发 leave-回声(它已是你的缘)', () => {
    const player = usePlayerStore()
    player.setFortuneChoices({ ft_reclusive_elder: 'take' })
    expect(echoEligible('ft_reclusive_elder')).toBe(false)
  })

  it('多次 leave 不叠加(布尔判定)', () => {
    const player = usePlayerStore()
    player.setFortuneChoices({ ft_sword_remnant: 'leave', ft_ancient_elixir: 'leave' })
    expect(echoFor('ft_sword_remnant')?.form).toBe('traces')
    expect(echoFor('ft_ancient_elixir')?.form).toBe('fate-over')
    // 重复 leave 只存一次
    player.setFortuneChoices({ ft_sword_remnant: 'leave' })
    expect(echoEligible('ft_sword_remnant')).toBe(true)
  })

  it('回声纯叙事:不改变奖励 / 资源 / 属性 / 战斗规则', () => {
    // resolveEventChoice 的 lines 不因回声而变
    const player = usePlayerStore()
    player.setFortuneChoices({ ft_ancient_elixir: 'leave' })
    const def = eventDef('ft_ancient_elixir')!
    const defaultIdx = def.choices.findIndex(c => c.isDefault)
    const res = resolveEventChoice(def, defaultIdx >= 0 ? defaultIdx : 0, 3)
    expect(res.lines.length).toBe(0) // 放弃选项无效果
  })

  it('回声概率稀有(5%),且五种机缘各有回声文本', () => {
    expect(ECHO_CHANCE).toBe(0.05)
    const player = usePlayerStore()
    const fs = new Set(FORTUNE_EVENTS.map(e => e.id))
    for (const id of fs) {
      player.setFortuneChoices({ [id]: 'leave' })
      const echo = echoFor(id)
      expect(echo, `${id} 应有回声文本`).not.toBeNull()
      expect(echo!.line.length).toBeGreaterThan(5)
    }
  })

  describe('一次事件的叙事快照', () => {
    it('重渲染不重掷:同一份快照读两次,回声与余波都不变', () => {
      const player = usePlayerStore()
      player.setFortuneChoices({ ft_sword_remnant: 'leave' })
      const memory = recordEvent({}, 'ft_sword_remnant', 0, 1000)
      const snapshot = rollEventNarrative('ft_sword_remnant', '剑冢残痕', memory, () => {
        return 0
      })
      // 回声命中则不掷余波
      expect(snapshot.echo?.line).toContain('三道剑痕')
      expect(snapshot.aftermath).toBeNull()
      // 快照是普通数据,重复读取不经随机源
      const read = (): unknown => snapshot
      expect(read()).toBe(snapshot)
      expect(read()).toEqual(snapshot)
    })

    it('换一件事就重掷:前一件的回声不会继承给下一件', () => {
      const player = usePlayerStore()
      player.setFortuneChoices({ ft_sword_remnant: 'leave' })
      const first = rollEventNarrative('ft_sword_remnant', '剑冢残痕', {}, () => 0)
      expect(first.echo).not.toBeNull()
      // 非机缘:掷出 0 也不得继承上一件的回声
      const second = rollEventNarrative('ev_merchant', '行脚商人', {}, () => 0)
      expect(second.echo).toBeNull()
      expect(second.eventId).toBe('ev_merchant')
    })

    it('回声与余波互斥:回声命中时不再掷余波', () => {
      const player = usePlayerStore()
      player.setFortuneChoices({ ft_sword_remnant: 'leave' })
      const memory = recordEvent({}, 'ft_sword_remnant', 0, 1000)
      const snapshot = rollEventNarrative('ft_sword_remnant', '剑冢残痕', memory, () => {
        return 0
      })
      expect(snapshot.echo).not.toBeNull()
      expect(snapshot.aftermath).toBeNull()
      expect(snapshot).toEqual({ eventId: 'ft_sword_remnant', echo: snapshot.echo, aftermath: null })
    })

    it('余波只在事件完成过且掷中时出现', () => {
      const fresh = rollEventNarrative('ev_merchant', '行脚商人', {}, () => 0)
      expect(fresh.aftermath).toBeNull()
      const memory = recordEvent(recordEvent({}, 'ev_merchant', 0, 1000), 'ev_merchant', 1, 2000)
      const hit = rollEventNarrative('ev_merchant', '行脚商人', memory, () => 0)
      expect(hit.aftermath).toContain('余韵')
      const miss = rollEventNarrative('ev_merchant', '行脚商人', memory, () => 1)
      expect(miss.aftermath).toBeNull()
    })
  })
})

describe('机缘回响 · 没有文本的事件', () => {
  // echoFor 先过 echoEligible,那个要读 store;单独 -t 跑时顶层 hook 不生效,须自己装
  beforeEach(() => setActivePinia(createPinia()))

  it('给定一个在回响表里查不到的事件 id,当取它的回响,则得 null 且不抛错', () => {
    /*
     * `if (!data) return null` 是真守卫:去掉后读 data.form 抛 TypeError。
     * 事件表与回响表各维护各的,旧档里的事件 id 可能已被删掉。
     */
    expect(() => echoFor('no_such_event')).not.toThrow()
    expect(echoFor('no_such_event')).toBeNull()
  })
})
