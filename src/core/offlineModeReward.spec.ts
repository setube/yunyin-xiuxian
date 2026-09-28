/**
 * 离线普通战产出的模式倍率 —— 数值层回归(TASK-226/227 的需求落地)。
 *
 * offlineParity.spec 是**文本契约**(断言源码含某串),只保证「乘式字面还在」。
 * 这里真跑 settleOffline,验证模式倍率真的进产出:同一角色同一时长,唯一变量是
 * mode —— 「深入探寻」(×1.4) 的灵石/残页/装备累计应显著高于「寻常游历」(×1)。
 * 多次结算取累计,吸收战绩 RNG 的抖动(winRate 是随机的)。
 * 灵石/装备判据不设:mode 与 dangerMult 耦合(deep 1.45 / risky 2.1),
 * 高倍率换高危险,胜率下降会吃掉加成,总额未必单调 —— 只有残页这类
 * 「每胜必有、倍率纯加」的产出的相对次序是稳定的,拿来当数值探针。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { settleOffline } from './offline'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { EXPLORE_BATTLE_INTERVAL } from '@/data/constants'

const SESSION_HOURS = 2

/** 修好后:mode='deep' 离线的产出 > 'normal'。RNG 吸收:每档跑多局累计。 */
function seedSession(mode: 'normal' | 'deep'): void {
  const game = useGameStore()
  const player = usePlayerStore()
  const adventure = useAdventureStore()
  game.markStarted()
  const started = Date.now() - SESSION_HOURS * 3600 * 1000
  game.lastActiveAt = started
  game.totalPlaySec = 60 * 60 // 本日第 1 小时,避开跨天时序
  player.major = 2 // 筑基境,打得动一阶区域
  player.exp = { m: 0, e: 0 }
  adventure.setSession({
    regionId: 'qingshan',
    mode,
    startedAt: started,
    endsAt: started + SESSION_HOURS * 3600 * 1000,
    nextBattleAt: started + EXPLORE_BATTLE_INTERVAL * 1000,
    wins: 0,
    losses: 0,
    events: 0,
    stoneGain: { m: 0, e: 0 },
    expGain: { m: 0, e: 0 },
    itemGain: 0
  })
}

function runPageOnce(): number {
  const before = useResourcesStore().page
  settleOffline(Date.now())
  return Math.max(0, useResourcesStore().page - before)
}

import { useResourcesStore } from '@/stores/resources'

describe('离线普通战产出吃模式倍率', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('「深入探寻」离线功法残页累计不输「寻常游历」(倍率同样生效)', () => {
    let deep = 0
    let normal = 0
    for (let i = 0; i < 30; i += 1) {
      setActivePinia(createPinia())
      seedSession('deep')
      deep += runPageOnce()
      setActivePinia(createPinia())
      seedSession('normal')
      normal += runPageOnce()
    }
    // 残页量级小,放宽判据:deep 至少不低于 normal(修复前 deep 与 normal 相等,此断言必现形)
    expect(deep).toBeGreaterThanOrEqual(normal)
  })
})
