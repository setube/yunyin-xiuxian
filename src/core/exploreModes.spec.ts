/**
 * 历练时长档 —— 时长曲线与读档放行。
 *
 * 由来:玩家反馈「挂机1小时2小时可以有更长时间的选择」。档位从四档长到六档
 * (0.5h→1h→2h→4h→8h→16h),曲线仍守两条既有纪律:
 *   ① 时长逐档翻倍,「睡一觉正好走完」有整档可选;
 *   ② 凶险比奖励涨得快 —— 长挂不是白嫖,拿三倍收益就得付三成以上的命。
 * 另钉一处易漏点:会话读档时的清洗(adventure 分片 sanitize)必须放行新档,
 * 否则 8h / 16h 单手滑到一半关游戏,回来会被洗成 normal,白等一场。
 */
import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { EXPLORE_MODES, RISKY_DANGER_MARGIN } from '@/data/constants'
import type { ExploreMode } from '@/types'
import { useAdventureStore } from '@/stores/adventure'
import { exploreModeOf } from './exploreModes'

const ORDER: ExploreMode[] = ['normal', 'deep', 'risky', 'prolonged', 'marathon', 'deepExpedition']

describe('历练时长档', () => {
  it('六个档位时长严格递进(0.5h→1h→2h→4h→8h→16h)', () => {
    for (let i = 1; i < ORDER.length; i += 1) {
      expect(EXPLORE_MODES[ORDER[i]!].durationSec, `${ORDER[i]} 应比 ${ORDER[i - 1]} 更长`).toBeGreaterThan(
        EXPLORE_MODES[ORDER[i - 1]!].durationSec
      )
    }
    expect(EXPLORE_MODES.marathon.durationSec, '8h = 28800s').toBe(28800)
    expect(EXPLORE_MODES.deepExpedition.durationSec, '16h = 57600s').toBe(57600)
  })

  it('每档时长是前一档的两倍(整夜挂机不必跨过洞府封顶)', () => {
    for (let i = 1; i < ORDER.length; i += 1) {
      expect(EXPLORE_MODES[ORDER[i]!].durationSec, `${ORDER[i]} 应为上一档的两倍`).toBe(
        EXPLORE_MODES[ORDER[i - 1]!].durationSec * 2
      )
    }
  })

  it('奖励与凶险随档位单调不减(凶险升得比奖励快,长挂不是白嫖)', () => {
    for (let i = 1; i < ORDER.length; i += 1) {
      expect(EXPLORE_MODES[ORDER[i]!].rewardMult).toBeGreaterThanOrEqual(EXPLORE_MODES[ORDER[i - 1]!].rewardMult)
      expect(EXPLORE_MODES[ORDER[i]!].dangerMult).toBeGreaterThanOrEqual(EXPLORE_MODES[ORDER[i - 1]!].dangerMult)
    }
    // 凶险>奖励这条只对长挂档成立:最短的「寻常游历」是基准档(两项都取 1),
    // 拿它去要求凶险高于奖励等于把基准档也判成违规。2h 起才有「多拿就要多付命」。
    for (const mode of ORDER.slice(2)) {
      expect(EXPLORE_MODES[mode].dangerMult, `${mode} 的凶险应高于奖励`).toBeGreaterThan(
        EXPLORE_MODES[mode].rewardMult
      )
    }
  })

  /**
   * 「险」的烫线要留余量 —— `deep` 的 1.45 对 1.4 也满足「凶险>奖励」,
   * 而它明明是「小险」。出行弹窗的朱砂判据读这一枚常量,故这里钉住:
   * `deep` 必须落在余量之内(不烫),2h 以上的长挂档必须越线(烫)。
   *
   * 故障注入:把 RISKY_DANGER_MARGIN 调成 1 → `deep` 一条红。
   */
  it('「险」的烫线留 5% 余量:小险不烫,长挂档才烫', () => {
    const risky = (mode: ExploreMode): boolean => {
      const def = EXPLORE_MODES[mode]
      return def.dangerMult > def.rewardMult * RISKY_DANGER_MARGIN
    }
    expect(risky('deep'), '深入探寻是「小险」,不该烫成朱砂').toBe(false)
    expect(risky('normal')).toBe(false)
    for (const mode of ['risky', 'prolonged', 'marathon', 'deepExpedition'] as const) {
      expect(risky(mode), `${mode} 该烫`).toBe(true)
    }
  })

  it('新增的两档与既有档同一套取舍:16h 的收益倍率低于其凶险倍率', () => {
    // 8h ×3 / ×3.2、16h ×3.6 / ×3.9 —— 多出来的 0.2 与 0.3 就是「长挂要付的命」
    expect(EXPLORE_MODES.marathon.rewardMult).toBe(3)
    expect(EXPLORE_MODES.marathon.dangerMult).toBe(3.2)
    expect(EXPLORE_MODES.deepExpedition.rewardMult).toBe(3.6)
    expect(EXPLORE_MODES.deepExpedition.dangerMult).toBe(3.9)
  })
})

describe('档位认读(读档清洗)', () => {
  it('认得每一档,野 id 归入寻常游历', () => {
    expect(ORDER.map(exploreModeOf)).toEqual(ORDER)
    expect(exploreModeOf('marathno')).toBe('normal')
    expect(exploreModeOf(42)).toBe('normal')
    expect(exploreModeOf(null)).toBe('normal')
  })

  it('读档清洗放行 8h 与 16h,不把它们洗成 normal', () => {
    for (const mode of ['marathon', 'deepExpedition'] as const) {
      setActivePinia(createPinia())
      const adventure = useAdventureStore()
      adventure.setSession({
        regionId: 'qingyun',
        mode,
        startedAt: Date.now() - 60000,
        endsAt: Date.now() + EXPLORE_MODES[mode].durationSec * 1000 - 60000,
        nextBattleAt: Date.now() + 60000,
        wins: 0,
        losses: 0,
        events: 0,
        itemGain: 0,
        stoneGain: { m: 0, e: 0 },
        expGain: { m: 0, e: 0 }
      })
      adventure.sanitize()
      expect(adventure.session?.mode, `${mode} 会话不该被洗掉`).toBe(mode)
    }
  })
})
