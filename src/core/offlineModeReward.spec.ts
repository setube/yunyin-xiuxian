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
import { useInventoryStore } from '@/stores/inventory'
import { ARTIFACT_DROP_CHANCE, EXPLORE_BATTLE_INTERVAL } from '@/data/constants'
import { WIN_STREAK_REWARDS } from '@/data/earlyGame'
import { toNum } from '@/utils/gnum'

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
const winRate = vi.hoisted(() => ({ value: 0.5 }))
vi.mock('./combat', async importOriginal => {
  const mod = await importOriginal<typeof import('./combat')>()
  return {
    ...mod,
    sampleWinRate: () => winRate.value
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
  /** 溢出件数 = 期望件数 − 6(从归来卷轴读回,吃模式倍率;不受 flat 尘污染) */
  overflowCount: number
  pills: number
}

const invPills = (): number =>
  Object.values(useInventoryStore().pills).reduce((a, b) => a + b, 0)

/** 从归来卷轴读回「另有 N 件寻常之物」的 N(无该行即 0) */
function overflowOf(notes: string[]): number {
  const line = notes.find(n => n.includes('件寻常之物'))
  return line ? Number(/另有\s*(\d+)\s*件/.exec(line)![1]) : 0
}

/** mock 后全链路确定:同输入必得同产出 */
function runOnce(mode: 'normal' | 'deep'): Yields {
  setActivePinia(createPinia())
  seedSession(mode)
  const beforePage = useResourcesStore().page
  const beforePills = invPills()
  const summary = settleOffline(Date.now())!
  return {
    page: Math.max(0, useResourcesStore().page - beforePage),
    overflowCount: overflowOf(summary.notes),
    // 丹药入囊数(inventory.pills 各 id 计数之和)
    pills: invPills() - beforePills
  }
}

describe('离线普通战产出吃模式倍率(确定性)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    winRate.value = 0.5
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
    expect(normal.overflowCount).toBeGreaterThan(0)
    expect(deep.overflowCount).toBeGreaterThanOrEqual(Math.round(normal.overflowCount * 1.3))
    expect(deep.overflowCount).toBeLessThanOrEqual(Math.round(normal.overflowCount * 1.5))
  })

  it('普通战会拾得丹药,且与在线 afterWin 同源按模式倍率放大(≈1.4)', () => {
    const deep = runOnce('deep')
    const normal = runOnce('normal')
    // 回归缺口:离线普通战此前只算石头/修为/材料/装备、独漏丹药 —— 正常战应确实拾丹
    expect(normal.pills, '离线普通战应入囊丹药').toBeGreaterThan(0)
    // 丹药与材料/装备同一把 rewardMult 尺子:deep(×1.4) 约 normal(×1) 的 1.4 倍(±取整噪声)
    expect(deep.pills).toBeGreaterThanOrEqual(Math.round(normal.pills * 1.3))
    expect(deep.pills).toBeLessThanOrEqual(Math.round(normal.pills * 1.5))
  })
})

/**
 * 宿敌账:在线每败一场走一次 `recordLoss`,三次即标宿敌。
 * 离线整段结算从前完全不碰 `player.nemeses` —— 挂机被打死几十回,
 * 图鉴、区域账、会话败场都记了,唯独征战录永远空白。
 */
describe('离线败北记宿敌(与在线同源)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    winRate.value = 0.5
  })

  it('整段败场按批入账,成宿敌时归来卷轴报一声', () => {
    seedSession('normal')
    const summary = settleOffline(Date.now())!
    const losses = summary.battles - summary.wins
    const nemeses = usePlayerStore().nemeses

    expect(losses, '胜率 0.5 时这一趟该有败场').toBeGreaterThan(0)
    expect(nemeses.length, '离线败北必须进征战录').toBeGreaterThan(0)
    // 普通战与首领战各记各的敌手(首领败也记在它自己名下),合计须与本趟败场同源
    expect(
      nemeses.reduce((n, x) => n + x.lossCount, 0),
      '败绩合计与这一趟的败场同源'
    ).toBe(losses)
    expect(summary.notes.some(n => n.includes('宿敌')), '成宿敌要在归来卷轴里说一声').toBe(true)
  })

  it('一场未败时不凭空生出宿敌', () => {
    winRate.value = 1
    seedSession('normal')
    const summary = settleOffline(Date.now())!

    // 首领战走真实战斗,顶多惜败那一场;普通战一场不该输
    expect(summary.wins, '胜率固定为 1,普通战不该有败场').toBeGreaterThanOrEqual(summary.battles - 1)
    expect(
      usePlayerStore().nemeses.every(n => n.lossCount < 3),
      '没连败三场就不该成宿敌'
    ).toBe(true)
    expect(summary.notes.some(n => n.includes('宿敌')), '未成宿敌不该播报').toBe(false)
  })
})

import { offlineMaterialGain } from './offline'
import { HERB_DROP_CHANCE, ORE_DROP_CHANCE, PAGE_DROP_CHANCE, OFFLINE_FLAT_DUST_PER_WIN } from '@/data/constants'

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
    // flat 尘是离线独有便捷值,须走命名常量,不可退回裸写 0.3(福缘翻倍同样放大)
    expect(g.dust).toBe(Math.round(120 * OFFLINE_FLAT_DUST_PER_WIN))
    expect(offlineMaterialGain(100, 2, 1).dust).toBe(Math.round(100 * OFFLINE_FLAT_DUST_PER_WIN * 2))
  })
})

/**
 * 离线法宝掉落 —— 与在线 afterWin 同源。
 *
 * 在线每胜一场按 `ARTIFACT_DROP_CHANCE × (1 + luck)` 掷一次;离线普通战从前
 * 只补了丹药与装备,法宝这一条整段缺席。这里把「这一趟的期望件数」和
 * 「离线不替玩家祭炼」两件事都钉住。
 */
describe('离线普通战法宝掉落(与在线同源)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    winRate.value = 0.5
  })

  it('按 ARTIFACT_DROP_CHANCE × 胜场折算,且只入囊不自动祭上', () => {
    seedSession('normal')
    const summary = settleOffline(Date.now())!
    const inventory = useInventoryStore()

    const expected = Math.round(summary.wins * ARTIFACT_DROP_CHANCE)
    // 实际件数随池子与权重浮动,但「有期望就该有产出」这一条必须成立
    expect(expected, '这一趟的胜场该足以期望出法宝').toBeGreaterThan(0)
    expect(inventory.artifacts.length, '离线也要走法宝掉落通道').toBeGreaterThan(0)
    expect(inventory.equippedArtifacts, '玩家不在场,不该替他祭炼').toHaveLength(0)
    expect(summary.notes.some(n => n.includes('法宝')), '拾得法宝要在归来卷轴里说一声').toBe(true)
  })
})

/**
 * 离线连胜:在线逐场 recordWin/recordLoss,离线整段结算从前完全不碰 winStreak。
 * 这里钉住「赏格真的发到账」「败场真的归零」两件事。
 */
describe('离线连胜(与在线同源)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    winRate.value = 0.5
  })

  it('整段连胜跨过赏格档时,灵石与悟道点按表发放,卷轴写明', () => {
    seedSession('normal')
    const player = usePlayerStore()
    const stoneBefore = toNum(useResourcesStore().spiritStone)
    const wudaoBefore = useResourcesStore().wudao
    const summary = settleOffline(Date.now())!

    const tiers = WIN_STREAK_REWARDS.filter(r => r.streak <= summary.wins)
    expect(tiers.length, '这一趟胜场该跨过全部赏格档').toBe(WIN_STREAK_REWARDS.length)
    const expectStone = tiers.reduce((n, r) => n + r.stone, 0)
    const expectWudao = tiers.reduce((n, r) => n + r.wudao, 0)
    // 悟道点与灵石另有战斗/际遇收益,只能验下界
    expect(useResourcesStore().wudao - wudaoBefore, '赏格悟道点要真的到账').toBeGreaterThanOrEqual(expectWudao)
    expect(toNum(useResourcesStore().spiritStone) - stoneBefore, '赏格灵石要真的到账').toBeGreaterThanOrEqual(
      expectStone
    )
    expect(player.winStreak, '本段有败场 → 连胜归零').toBe(0)
    expect(summary.notes.some(n => n.includes('连胜')), '发了赏格要在卷轴里说一声').toBe(true)
  })
})
