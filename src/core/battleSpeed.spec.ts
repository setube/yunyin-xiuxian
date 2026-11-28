/**
 * 战报回放的倍速:每一档都要真的比上一档快。
 *
 * 两处回放(`CombatPanel` 的历练战报、`GauntletPanel` 的连战)都写:
 *
 *   interval = Math.max(COMBAT_PLAYBACK_MIN_MS, COMBAT_PLAYBACK_BASE_MS / settings.battleSpeed)
 *
 * 那个 `Math.max` 是必要的地板(太快看不清),但它有个静默的副作用:
 * **当 `BASE / speed` 掉到地板以下,高档与低档就变成同一个数** —— 玩家点了 4 倍,
 * 和 2 倍一样快,而按钮上的选中态照旧翻过去,看不出没生效。
 *
 * 当前数值(460 / 90)三档是 460 / 230 / 115,都高于地板,**没有撞到**。
 * 但没有任何判据盯着这个关系:有人把 BASE 调到 300,4 档就落进地板(90),
 * 与「再往上加档」也没区别了 —— 而界面上一切照常。
 *
 * 判据两条:
 *   一 每一档算出的间隔严格递减(快的档真更快)
 *   二 没有任何一档撞到地板(`interval > MIN`),否则那档就是在假装更快
 *
 * 故障注入:把 `COMBAT_PLAYBACK_BASE_MS` 改成 300 → 第一条红(2×/4× 都成 90)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { COMBAT_PLAYBACK_BASE_MS, COMBAT_PLAYBACK_MIN_MS } from '@/data/constants'

/** 与两处组件同一个式子;改口径时这里要跟着改 */
const intervalOf = (speed: number): number => Math.max(COMBAT_PLAYBACK_MIN_MS, COMBAT_PLAYBACK_BASE_MS / speed)

/** settings store 允许的档位(1 | 2 | 4) */
const SPEEDS = [1, 2, 4] as const

describe('战报回放 · 倍速档位真的分得开', () => {
  it('每一档的间隔严格递减', () => {
    const rows = SPEEDS.map((s) => ({ speed: s, interval: intervalOf(s) }))
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1]!
      const cur = rows[i]!
      expect(
        cur.interval,
        `${cur.speed}× 的间隔(${cur.interval}ms)没有短于 ${prev.speed}× (${prev.interval}ms) —— 这一档等于没生效`
      ).toBeLessThan(prev.interval)
    }
  })

  it('没有一档撞到地板(撞到就是在假装更快)', () => {
    const floored = SPEEDS.filter((s) => intervalOf(s) <= COMBAT_PLAYBACK_MIN_MS)
    expect(
      floored,
      `这些档位的间隔已经等于地板 ${COMBAT_PLAYBACK_MIN_MS}ms —— 再快的档也是同一个数,` +
        `界面上却照旧高亮,玩家看不出没生效。要么调大 BASE,要么减少档位`
    ).toEqual([])
  })

  it('两处回放用的是同一个式子(不是各写一份)', () => {
    for (const rel of ['components/adventure/CombatPanel.vue', 'components/celestial/GauntletPanel.vue']) {
      const src = readFileSync(resolve(__dirname, '..', rel), 'utf-8')
      expect(src, `${rel} 没有走 BASE / speed 的口径`).toContain('COMBAT_PLAYBACK_BASE_MS / settings.battleSpeed')
      expect(src, `${rel} 没有地板`).toContain('COMBAT_PLAYBACK_MIN_MS')
    }
  })
})
