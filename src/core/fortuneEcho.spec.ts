/**
 * Phase 31.3:遗产回声 —— 历史选择 → 世界回应
 *
 * 审计点:
 *  新玩家永不回声 / leave 后可回声 / take 不触发 leave-回声
 *  多次 leave 不叠加 / 回声不改变奖励与数值 / 概率稀有(5%)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { echoFor, echoEligible, ECHO_CHANCE } from './fortuneEcho'
import { usePlayerStore } from '@/stores/player'
import { resolveEventChoice } from './eventEngine'
import { fortuneEventDef, FORTUNE_EVENTS } from '@/data/events'

describe('遗产回声(fortuneEcho)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('新玩家:永不回声(无 leave 记录)', () => {
    const player = usePlayerStore()
    player.setFortuneChoices({}) // 无记录
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
    // 同一机缘重复 leave 不被特殊处理(只存一次)
    player.setFortuneChoices({ ft_sword_remnant: 'leave' })
    expect(echoEligible('ft_sword_remnant')).toBe(true)
  })

  it('回声纯叙事:不改变奖励 / 资源 / 属性 / 战斗规则', () => {
    // 回声只是文案;resolveEventChoice 返回的 lines 不因回声而变
    const player = usePlayerStore()
    player.setFortuneChoices({ ft_ancient_elixir: 'leave' })
    const def = fortuneEventDef('ft_ancient_elixir')!
    // 若选择"放弃"(isDefault),回声后仍无奖励
    const defaultIdx = def.choices.findIndex(c => c.isDefault)
    const res = resolveEventChoice(def, defaultIdx >= 0 ? defaultIdx : 0, 3)
    expect(res.lines.length).toBe(0) // 放弃选项无效果(纯叙事)
  })

  it('回声概率稀有(5%),且五种机缘各有回声文本', () => {
    expect(ECHO_CHANCE).toBe(0.05)
    const player = usePlayerStore()
    const fs = new Set(FORTUNE_EVENTS.map(e => e.id))
    for (const id of fs) {
      player.setFortuneChoices({ [id]: 'leave' })
      // leave 后必可回声,且文本非空
      const echo = echoFor(id)
      expect(echo, `${id} 应有回声文本`).not.toBeNull()
      expect(echo!.line.length).toBeGreaterThan(5)
    }
  })
})
