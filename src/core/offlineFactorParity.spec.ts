/**
 * 离线普通战产出的「区域加丰 / 福缘」倍率 —— 行为层回归。
 *
 * offlineParity.spec 对 regionEventReward 与 doubleDropRate 只做文本契约
 * (断言源码含某串),只管「乘式字面还在」;offlineModeReward.spec 只对 mode 倍率
 * 做了行为层验证。区域加丰(妖潮 ×1.2)与福缘(doubleDropRate ×1.05)两条乘数
 * 至今只被文本契约守着 —— 字符串还在≠产出真的被放大。这里真跑 settleOffline,
 * 验证这两条乘数**真的进产出**(残页页数按同因子成比例放大)。
 *
 * 确定性怎么来:与 offlineModeReward 同技 —— settleOffline 产出正比于 wins,
 * wins 来自 winRate(sampleWinRate,含 rng)。把 rng 与 sampleWinRate 都 mock 成
 * 固定响应,整条链路(encounters→battles→wins)每一步都确定,残页产出只差
 * regionEventReward / doubleDropRate 一个因子。
 *
 * 断言用区间而非精确比:产出过 Math.round(整数取整),因子落在 ±1 取整噪声里。
 * 区间把 round 噪声包住,又足以区分「倍率生效」与「倍率缺失(=1)」两个世界。
 * 群妖潮 ×1.2 用 [1.13, 1.27],t_tanbao 福缘 ×1.05 用 [1.03, 1.09]。
 *
 * 注:rng 全响应固定 — 概率判定处处 0.5、pick 恒取首项,t_tanbao 的 dropRate
 * 只走装备掉落,不进残页(残页行只乘 doubleDropRate 与 PAGE_DROP_CHANCE),故
 * 断言残页页数最干净。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { settleOffline } from './offline'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { useResourcesStore } from '@/stores/resources'
import { useDongfuStore } from '@/stores/dongfu'
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

// 胜率 mock 成固定 0.5:wins = round(battles×0.5),与 mode 的区域事件危险无关。
// 否则妖潮危险高→胜率低→wins 少,会把区域加丰的收益淹没 —— 危险耦合由
// offlineScope/battleFactor 守,本测试只专注「加丰进产出」这一件事。
vi.mock('./combat', async importOriginal => {
  const mod = await importOriginal<typeof import('./combat')>()
  return {
    ...mod,
    sampleWinRate: () => 0.5
  }
})

const SESSION_HOURS = 8

interface FactorCase {
  regionEvent: boolean
  doubleDrop: boolean
}

/** mock 后全链路确定:同输入必得同产出。返回本次离线新增的残页页数。 */
function runPage(core: FactorCase): number {
  setActivePinia(createPinia())
  const game = useGameStore()
  const player = usePlayerStore()
  const adventure = useAdventureStore()
  const dongfu = useDongfuStore()
  game.markStarted()
  const started = Date.now() - SESSION_HOURS * 3600 * 1000
  game.lastActiveAt = started
  game.totalPlaySec = 60 * 60 // 本日第 1 小时,避开跨天时序
  player.major = 2 // 筑基境,打得动一阶区域
  player.exp = { m: 0, e: 0 }
  if (core.doubleDrop) player.addTalent('t_tanbao') // 探宝:doubleDropRate +0.05
  dongfu.setLevel('mansion', 8) // 离线封顶拉高,保证 simSec=cap 而非被 dt 掐短
  adventure.setSession({
    regionId: 'qingyun',
    mode: 'normal',
    startedAt: started,
    endsAt: started + 999 * 3600 * 1000,
    nextBattleAt: started + EXPLORE_BATTLE_INTERVAL * 1000,
    wins: 0,
    losses: 0,
    events: 0,
    stoneGain: { m: 0, e: 0 },
    expGain: { m: 0, e: 0 },
    itemGain: 0
  })
  if (core.regionEvent) {
    // 妖潮:区域事件加丰 ×1.2(另叠加难 ×1.15,已被 sampleWinRate mock 按下)
    player.setRegionEvent({
      regionId: 'qingyun',
      eventId: 'yaochao',
      endsAt: Date.now() + 24 * 3600 * 1000
    })
  }
  const beforePage = useResourcesStore().page
  settleOffline(Date.now())
  return Math.max(0, useResourcesStore().page - beforePage)
}

describe('离线普通战产出吃区域加丰与福缘(行为层·确定性)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('妖潮区域事件加丰(×1.2):残页产出约为平日 1.2 倍(±取整噪声)', () => {
    const base = runPage({ regionEvent: false, doubleDrop: false })
    const yaochao = runPage({ regionEvent: true, doubleDrop: false })
    expect(base).toBeGreaterThan(0)
    expect(yaochao).toBeGreaterThanOrEqual(Math.round(base * 1.13))
    expect(yaochao).toBeLessThanOrEqual(Math.round(base * 1.27))
  })

  it('福缘 doubleDropRate(探宝 ×1.05):残页产出约为平日 1.05 倍(±取整噪声)', () => {
    const base = runPage({ regionEvent: false, doubleDrop: false })
    const talented = runPage({ regionEvent: false, doubleDrop: true })
    expect(base).toBeGreaterThan(0)
    expect(talented).toBeGreaterThanOrEqual(Math.round(base * 1.03))
    expect(talented).toBeLessThanOrEqual(Math.round(base * 1.09))
  })

  it('区域加丰与福缘彼此独立可叠加:妖潮+探宝 应显著高于任一单因子', () => {
    const both = runPage({ regionEvent: true, doubleDrop: true })
    const yaochao = runPage({ regionEvent: true, doubleDrop: false })
    const talented = runPage({ regionEvent: false, doubleDrop: true })
    expect(both).toBeGreaterThan(yaochao)
    expect(both).toBeGreaterThan(talented)
    // 组合 ≈ ×1.2×1.05 = ×1.26,区间包裹 round 噪声、又区分「叠加生效」与「只取其一」
    expect(both).toBeGreaterThanOrEqual(Math.round(yaochao * 1.03))
    expect(both).toBeLessThanOrEqual(Math.round(yaochao * 1.09))
  })
})
