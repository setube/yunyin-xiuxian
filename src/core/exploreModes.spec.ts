/**
 * 历练时长档(玩家反馈:「挂机1小时2小时可以有更长时间的选择」)。
 *
 * 新增的「长线云游」(4h) 挂靠既有档位曲线(0.5h→1h→2h→4h):
 * 时长逐档翻倍、奖励/凶险逐档递增。同时钉死一处易漏点 ——
 * 会话读到 session.mode 时的清洗(adventure 分片 sanitize)必须放行新档,
 * 否则 4h 单手滑到一半关游戏,回来会被洗成 normal,白等一场。
 */
import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { EXPLORE_MODES } from '@/data/constants'
import type { ExploreMode } from '@/types'
import { useAdventureStore } from '@/stores/adventure'

describe('历练时长档', () => {
  it('四个档位时长严格递进(0.5h→1h→2h→4h)', () => {
    const order: ExploreMode[] = ['normal', 'deep', 'risky', 'prolonged']
    for (let i = 1; i < order.length; i += 1) {
      expect(EXPLORE_MODES[order[i]!].durationSec, `${order[i]} 应比 ${order[i - 1]} 更长`).toBeGreaterThan(
        EXPLORE_MODES[order[i - 1]!].durationSec
      )
    }
    expect(EXPLORE_MODES.prolonged.durationSec, '4h = 14400s').toBe(14400)
  })

  it('奖励与凶险随档位单调不减(凶险升得比奖励快,长挂不是白嫖)', () => {
    const order: ExploreMode[] = ['normal', 'deep', 'risky', 'prolonged']
    for (let i = 1; i < order.length; i += 1) {
      expect(EXPLORE_MODES[order[i]!].rewardMult).toBeGreaterThanOrEqual(EXPLORE_MODES[order[i - 1]!].rewardMult)
      expect(EXPLORE_MODES[order[i]!].dangerMult).toBeGreaterThanOrEqual(EXPLORE_MODES[order[i - 1]!].dangerMult)
    }
    expect(EXPLORE_MODES.prolonged.dangerMult).toBeGreaterThan(EXPLORE_MODES.prolonged.rewardMult)
  })

  it('读档清洗放行长线云游,不把 4h 会话洗成 normal', () => {
    setActivePinia(createPinia())
    const adventure = useAdventureStore()
    adventure.setSession({
      regionId: 'qingyun',
      mode: 'prolonged',
      startedAt: Date.now() - 60000,
      endsAt: Date.now() + 14340000,
      nextBattleAt: Date.now() + 60000,
      wins: 0,
      losses: 0,
      events: 0,
      itemGain: 0,
      stoneGain: { m: 0, e: 0 },
      expGain: { m: 0, e: 0 }
    })
    adventure.sanitize()
    expect(adventure.session?.mode, '长线云游会话不该被洗掉').toBe('prolonged')
  })
})
