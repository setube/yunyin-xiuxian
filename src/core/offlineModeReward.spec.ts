/**
 * 离线普通战产出的模式倍率 —— 行为层回归(TASK-226/227)。
 *
 * offlineParity.spec 是文本契约(断言源码含某串),只管「乘式字面还在」;
 * 这里真跑 settleOffline,验证模式倍率**真的进产出**。
 *
 * 确定性怎么来:settleOffline 的产出全正比于 wins,而 wins 来自
 * winRate(sampleWinRate,含 rng)。我们把 rng 与 sampleWinRate 都 mock 成
 * 固定响应,于是整条链路(encounters→battles→wins)每一步都确定——
 * 残页/装备的产出就只差 modeDef.rewardMult 一个因子:
 *   deep(×1.4)/normal(×1) = 1.4,与 RNG 无关,断言便不 flaky。
 *
 * 注意:cheat 掉 sampleWinRate 意味着深探/寻常的「危险差」不再改变胜率——
 * 那不是本测试要守的东西(危险耦合由 offlineScope/battleFactor 守),
 * 本测试只专注「倍率进产出」这一件事。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { settleOffline } from './offline'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { useResourcesStore } from '@/stores/resources'
import { EXPLORE_BATTLE_INTERVAL } from '@/data/constants'

// rng 全响应固定:概率判定处处 0.5、pick 恒取首项 —— 序列确定
vi.mock('@/utils/random', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/random')>()
  return {
    ...mod,
    rng: {
      next: () => 0.5,
      int: (a: number, _b: number) => a,
      float: (a: number, _b: number) => a,
      pick: <T,>(arr: readonly T[]): T => arr[0]!,
      weighted: <T,>(arr: readonly T[]): T => arr[0]!,
      chance: (): boolean => true
    }
  }
})

// 胜率 mock 成固定 0.5:wins = round(battles×0.5),与 mode 的危险差无关。
// 否则 deep 危险高→胜率低→wins 少,会把倍率差淹没(初版测试正是栽在这)
vi.mock('./combat', async importOriginal => {
  const mod = await importOriginal<typeof import('./combat')>()
  return {
    ...mod,
    sampleWinRate: () => 0.5
  }
})

const SESSION_HOURS = 2

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
    regionId: 'qingyun',
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

interface Yields {
  page: number
  equipChanceCount: number
}

/** mock 后全链路确定:同输入必得同产出 */
function runOnce(mode: 'normal' | 'deep'): Yields {
  setActivePinia(createPinia())
  seedSession(mode)
  const beforePage = useResourcesStore().page
  const beforeDust = useResourcesStore().dust
  settleOffline(Date.now())
  return {
    page: Math.max(0, useResourcesStore().page - beforePage),
    // 装备按期望计件(equipCount),实际生成受 rng 与 6 件 cap 约束;取器灵尘增量对比最稳
    equipChanceCount: Math.max(0, useResourcesStore().dust - beforeDust)
  }
}

describe('离线普通战产出吃模式倍率(确定性)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /**
   * 断言「deep 约为 normal 的 1.4 倍」。这里用区间而非精确比:
   * 产出都过 Math.round(整数取整),1.4 倍因子落在 ±1 取整噪声里,
   * 精确 1.4 断言会因 round 错位而假红。区间 [×1.3, ×1.5] 把 round 噪声包住,
   * 又足以区分「倍率生效(≈1.4)」与「倍率缺失(=1)」两个世界。
   * 确定性依然成立:同一 mock(固定响应)下每次跑 wins/battles 恒定,结果可复现。
   */
  it('「深入探寻」(×1.4) 残页产出约为「寻常游历」(×1) 的 1.4 倍(±取整噪声)', () => {
    const deep = runOnce('deep')
    const normal = runOnce('normal')
    expect(normal.page).toBeGreaterThan(0)
    expect(deep.page).toBeGreaterThanOrEqual(Math.round(normal.page * 1.3))
    expect(deep.page).toBeLessThanOrEqual(Math.round(normal.page * 1.5))
  })

  it('装备掉落同样按模式倍率约 1.4 放大', () => {
    const deep = runOnce('deep')
    const normal = runOnce('normal')
    expect(normal.equipChanceCount).toBeGreaterThan(0)
    expect(deep.equipChanceCount).toBeGreaterThanOrEqual(Math.round(normal.equipChanceCount * 1.3))
    expect(deep.equipChanceCount).toBeLessThanOrEqual(Math.round(normal.equipChanceCount * 1.5))
  })
})

import { offlineMaterialGain } from './offline'
import { HERB_DROP_CHANCE, ORE_DROP_CHANCE, PAGE_DROP_CHANCE } from '@/data/constants'

describe('离线单胜材料与在线 afterWin 同一期望(单源取 drop 常量)', () => {
  it('ore 取 ORE_DROP_CHANCE×1.5(0.525)而非写死 0.5;herb/page 同源;福缘/倍率各自放大', () => {
    const g = offlineMaterialGain(120, 1, 1)
    // ore 在线期望 = 0.35×1.5=0.525/胜 —— 写死的 0.5 在 120 胜处只有 60,这里须 63,退回即红
    expect(g.ore, 'ore 应随 ORE_DROP_CHANCE×1.5,不可退回写死 0.5').toBe(Math.round(120 * ORE_DROP_CHANCE * 1.5))
    expect(g.herb, 'herb 应随 HERB_DROP_CHANCE×2').toBe(Math.round(120 * HERB_DROP_CHANCE * 2))
    expect(g.page, 'page 应随 PAGE_DROP_CHANCE×1.5').toBe(Math.round(120 * PAGE_DROP_CHANCE * 1.5))
    // 福缘翻倍整体放大;模式/事件倍率只作用于 page(在线 rewardMult 只碰 page 概率与装备),不碰 herb/ore
    expect(offlineMaterialGain(100, 2, 1).ore).toBe(Math.round(100 * ORE_DROP_CHANCE * 1.5 * 2))
    expect(offlineMaterialGain(100, 1, 1.4).page).toBe(Math.round(100 * PAGE_DROP_CHANCE * 1.5 * 1.4))
    expect(offlineMaterialGain(100, 1, 1.4).ore).toBe(Math.round(100 * ORE_DROP_CHANCE * 1.5))
  })
})
