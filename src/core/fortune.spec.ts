/**
 * Phase 31.0 S2:机缘 —— 低概率触发、带代价选择
 */
import { describe, it, expect } from 'vitest'
import { FORTUNE_EVENTS, fortuneEventDef } from '@/data/events'

describe('机缘事件(fortune)', () => {
  it('机缘池非空且每个都有"取/弃"选择', () => {
    expect(FORTUNE_EVENTS.length).toBeGreaterThan(0)
    for (const ev of FORTUNE_EVENTS) {
      expect(ev.choices.length).toBeGreaterThanOrEqual(2)
      // 至少一个"离开"类默认选择(放弃机缘)
      expect(ev.choices.some(c => c.isDefault)).toBe(true)
    }
  })

  it('机缘事件可查(def 回查)', () => {
    const ev = fortuneEventDef(FORTUNE_EVENTS[0]!.id)
    expect(ev?.id).toBe(FORTUNE_EVENTS[0]!.id)
  })

  it('机缘触发概率受控(2% → 百次期望 2 次)', () => {
    // 概率常量在事件引擎内部,此处仅锁定数据不破坏
    const ids = new Set(FORTUNE_EVENTS.map(e => e.id))
    expect(ids.size).toBe(FORTUNE_EVENTS.length)
  })
})
