/**
 * 主线进度读数 —— 新手第一天唯一的路线图,不该只有「要做什么」。
 *
 * 本文件守三件事:
 *   ① 三种条件(计数 / 境界 / 境界层数)都能翻成人话;
 *   ② 读数里的「成了吗」与发赏判定同一份(evalCond),逐条对账全部主线;
 *   ③ 计数进度夹在 0~1,坏计数不会画出越界的进度条。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { questProgressOf } from './questProgress'
import { evalCond } from './progress'
import { MAIN_QUESTS } from '@/data/quests'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'

describe('主线进度读数', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('计数类:报「已 X/Y」,到线即成,进度比例夹在 0~1', () => {
    const quests = useQuestsStore()
    const cond = { type: 'counter', key: 'kills', value: 10 } as const
    expect(questProgressOf(cond)!.text).toBe('已 0/10')
    quests.inc('kills', 3)
    const mid = questProgressOf(cond)!
    expect(mid.text).toBe('已 3/10')
    expect(mid.done).toBe(false)
    expect(mid.ratio).toBeCloseTo(0.3, 6)
    quests.inc('kills', 12)
    const done = questProgressOf(cond)!
    expect(done.done).toBe(true)
    expect(done.text).toBe('已成(10/10)')
    expect(done.ratio, '超出的计数不该把进度条画过 100%').toBe(1)
  })

  it('境界类:未至时点名「尚在 / 需至」,已至即成', () => {
    const player = usePlayerStore()
    player.$patch({ major: 0, sub: 0 })
    const cond = { type: 'realm', major: 1 } as const
    const before = questProgressOf(cond)!
    expect(before.done).toBe(false)
    expect(before.text).toContain('尚在 炼气')
    expect(before.text).toContain('需至 筑基')
    expect(before.ratio).toBeNull()
    player.$patch({ major: 1 })
    expect(questProgressOf(cond)!.text).toBe('已至 筑基')
  })

  it('「突破到某境界某层」:层数一起比 —— 炼气二层不算炼气三层', () => {
    const player = usePlayerStore()
    const cond = { type: 'custom', key: 'realm_0_2' } as const
    player.$patch({ major: 0, sub: 1 })
    expect(questProgressOf(cond)!.done, '炼气二层被算成炼气三层').toBe(false)
    expect(questProgressOf(cond)!.text).toContain('尚在 炼气·二层')
    expect(questProgressOf(cond)!.text).toContain('需至 炼气·三层')
    player.$patch({ sub: 2 })
    expect(questProgressOf(cond)!.done).toBe(true)
    // 境界超过之后仍算达成(老档回头看不该变成「没成」)
    player.$patch({ major: 3, sub: 0 })
    expect(questProgressOf(cond)!.done).toBe(true)
  })

  it('认不出的条件不硬编:状态型键与品质条件返回 null', () => {
    expect(questProgressOf({ type: 'custom', key: 'stone1m' })).toBeNull()
    expect(questProgressOf({ type: 'quality', rank: 5 })).toBeNull()
  })

  it('读数里的「成了吗」与发赏判定同源(逐条对账全部主线)', () => {
    const player = usePlayerStore()
    const quests = useQuestsStore()
    player.$patch({ major: 2, sub: 5 })
    for (const [key, value] of [
      ['kills', 12],
      ['explores', 4],
      ['bossKills', 2],
      ['upgrades', 7]
    ] as const) {
      quests.inc(key, value)
    }
    let checked = 0
    for (const def of MAIN_QUESTS) {
      const view = questProgressOf(def.cond)
      if (!view) continue
      checked += 1
      expect(
        view.done,
        `${def.name}:读数说「${view.text}」,而发赏判定是 ${evalCond(def.cond)}`
      ).toBe(evalCond(def.cond))
    }
    expect(checked, '一条主线都没扫到,断言形同虚设').toBeGreaterThan(25)
  })
})
