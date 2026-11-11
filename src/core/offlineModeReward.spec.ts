/**
 * 离线普通战产出的模式倍率 —— 行为层回归;文本契约见 offlineParity.spec。
 *
 * rng 与 sampleWinRate 均 mock 成固定响应,产出只差 modeDef.rewardMult:deep(×1.4)/normal(×1)。
 * 胜率固定后危险差不改胜率;危险耦合由 offlineScope/battleFactor 守。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { setActivePinia, createPinia } from 'pinia'
import { settleOffline } from './offline'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { ARTIFACT_DROP_CHANCE, EXPLORE_BATTLE_INTERVAL, EXPLORE_MODES } from '@/data/constants'
import { WIN_STREAK_REWARDS } from '@/data/earlyGame'
import { toNum } from '@/utils/gnum'
import { recordLoss, NEMESIS_THRESHOLD } from '@/core/worldMemory'
import { beginLife, vowResult } from '@/core/samsaraService'
import { ARTIFACTS } from '@/data/artifacts'
import { enemyDef } from '@/data/enemies'
import { placeContent } from '@/core/mortalWorldService'
import { meet } from '@/core/daoluService'
import { rng } from '@/utils/random'

// rng 全响应固定:pick 恒取首项
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

// 胜率固定,与 mode 的危险差无关;否则 deep 胜率低、wins 少,淹没倍率差
const winRate = vi.hoisted(() => ({ value: 0.5 }))
vi.mock('./combat', async importOriginal => {
  const mod = await importOriginal<typeof import('./combat')>()
  return {
    ...mod,
    sampleWinRate: () => winRate.value
  }
})

const SESSION_HOURS = 2

function seedSession(mode: 'normal' | 'deep' | 'prolonged' | 'marathon' | 'deepExpedition'): void {
  const game = useGameStore()
  const player = usePlayerStore()
  const adventure = useAdventureStore()
  game.markStarted()
  // 长档缺席时长取档位时长,才验得到封顶。
  // endsAt 须与缺席时长配对:remainSec 短于缺席则会话被判「历练完成」,长档与封顶判据假绿
  const awayHours = mode === 'normal' || mode === 'deep' ? SESSION_HOURS : EXPLORE_MODES[mode].durationSec / 3600
  const started = Date.now() - awayHours * 3600 * 1000
  game.lastActiveAt = started
  game.totalPlaySec = 60 * 60 // 避开跨天时序
  player.major = 2 // 金丹
  player.exp = { m: 0, e: 0 }
  adventure.setSession({
    regionId: 'qingyun',
    mode,
    startedAt: started,
    endsAt: started + awayHours * 3600 * 1000,
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
  /** 溢出件数 = 期望件数 − 6,读自归来卷轴;吃模式倍率,不受 flat 尘污染 */
  overflowCount: number
  pills: number
}

const invPills = (): number =>
  Object.values(useInventoryStore().pills).reduce((a, b) => a + b, 0)

function overflowOf(notes: string[]): number {
  const line = notes.find(n => n.includes('件折作器灵尘'))
  return line ? Number(/另有\s*(\d+)\s*件/.exec(line)![1]) : 0
}

function runOnce(mode: 'normal' | 'deep' | 'prolonged' | 'marathon' | 'deepExpedition'): Yields {
  setActivePinia(createPinia())
  seedSession(mode)
  const beforePage = useResourcesStore().page
  const beforePills = invPills()
  const summary = settleOffline(Date.now())!
  return {
    page: Math.max(0, useResourcesStore().page - beforePage),
    overflowCount: overflowOf(summary.notes),
    pills: invPills() - beforePills
  }
}

describe('离线普通战产出吃模式倍率(确定性)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    winRate.value = 0.5
  })

  /** 用区间 [×1.3, ×1.5] 而非精确 1.4:产出过 Math.round,精确比会假红 */
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
    expect(normal.pills, '离线普通战应入囊丹药').toBeGreaterThan(0)
    expect(deep.pills).toBeGreaterThanOrEqual(Math.round(normal.pills * 1.3))
    expect(deep.pills).toBeLessThanOrEqual(Math.round(normal.pills * 1.5))
  })
})

describe('离线长档(8h / 16h)吃同一把倍率,且不越过洞府封顶', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    winRate.value = 0.5
  })

  it('「彻夜问道」(8h,×3)的产出高于「长线云游」(4h,×2.4)', () => {
    const marathon = runOnce('marathon')
    const prolonged = runOnce('prolonged')
    expect(prolonged.page, '4h 档应有产出').toBeGreaterThan(0)
    expect(marathon.page).toBeGreaterThan(prolonged.page)
    expect(marathon.pills).toBeGreaterThan(prolonged.pills)
  })

  it('16h 行程配 8h 洞府:离线只结 8h,不按整程 16h 给', () => {
    // 洞府 0 级 = 8h 封顶;capSec 失效则 16h 档按整程结算,产出约为锚点两倍
    const capped = runOnce('deepExpedition')
    const anchor = runOnce('marathon') // 8h 档:时长恰为封顶
    expect(capped.page, '16h 档应有产出').toBeGreaterThan(0)
    expect(anchor.page).toBeGreaterThan(0)
    // 同为 8h 结算,只差档位倍率 3.6 vs 3.0
    expect(capped.page).toBeLessThan(anchor.page * 1.5)
    expect(capped.pills).toBeLessThan(anchor.pills * 1.5)
    // 会话剩余 16h,离线只推进 8h:不该被判「历练完成」
    const summary = settleOffline(Date.now())
    expect(summary).not.toBeNull()
  })

  it('16h 档配 8h 洞府:归来卷轴写明这一程还没走完,并给出剩余时长', () => {
    setActivePinia(createPinia())
    // 缺席 12h(超过 8h 上限),会话满程 16h:离线只结 8h,还剩 4h
    const game = useGameStore()
    const player = usePlayerStore()
    const adventure = useAdventureStore()
    game.markStarted()
    // 冻结时钟:`left` = (endsAt - nowMs)/1000,两次取时钟差 1ms 即 14399.999s,formatDuration 向下取整成「3小时59分」
    vi.useFakeTimers()
    const now = new Date('2026-10-23T12:00:00.000Z').getTime()
    vi.setSystemTime(now)
    try {
      const started = now - 12 * 3600 * 1000
      game.lastActiveAt = started
      game.totalPlaySec = 60 * 60
      player.major = 2
      player.exp = { m: 0, e: 0 }
      adventure.setSession({
        regionId: 'qingyun',
        mode: 'deepExpedition',
        startedAt: started,
        endsAt: started + 16 * 3600 * 1000,
        nextBattleAt: started + EXPLORE_BATTLE_INTERVAL * 1000,
        wins: 0,
        losses: 0,
        events: 0,
        stoneGain: { m: 0, e: 0 },
        expGain: { m: 0, e: 0 },
        itemGain: 0
      })
      const summary = settleOffline(now)!
      const note = summary.notes.find(n => n.includes('历练在途'))
      expect(note, `归来卷轴未提被截断的历练:${summary.notes.join(' | ')}`).toBeTruthy()
      expect(note).toMatch(/尚余\s*4小时/)
      // 截断缘由见卷轴顶行(OfflineRewardDialog 的 awayLine:「此去 · 上限」)
      expect(summary.capped, '缺席 12h 超过 8h 上限,顶行该报「上限」').toBe(true)
      expect(summary.cappedSeconds, '顶行报的上限即洞府 0 级的 8h').toBe(8 * 3600)
      expect(useAdventureStore().session, '被 cap 截断的会话不该被清掉').not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  /** 会话在途印「历练在途」;remainSec 被缺席走满才印「历练完成」 */
  it('历练完成与历练在途不共屏', () => {
    setActivePinia(createPinia())
    const game = useGameStore()
    const player = usePlayerStore()
    const adventure = useAdventureStore()
    game.markStarted()
    vi.useFakeTimers()
    const now = new Date('2026-10-23T12:00:00.000Z').getTime()
    vi.setSystemTime(now)
    try {
      const started = now - 12 * 3600 * 1000
      game.lastActiveAt = started
      game.totalPlaySec = 60 * 60
      player.major = 2
      player.exp = { m: 0, e: 0 }
      adventure.setSession({
        regionId: 'qingyun',
        mode: 'deepExpedition',
        startedAt: started,
        endsAt: started + 16 * 3600 * 1000,
        nextBattleAt: started + EXPLORE_BATTLE_INTERVAL * 1000,
        wins: 0,
        losses: 0,
        events: 0,
        stoneGain: { m: 0, e: 0 },
        expGain: { m: 0, e: 0 },
        itemGain: 0
      })
      const summary = settleOffline(now)!
      const done = summary.notes.some(n => n.endsWith('历练完成'))
      const unfinished = summary.notes.some(n => n.includes('历练在途'))
      // 16h 满程 − 12h 缺席,还剩 4h
      expect(unfinished, '还剩半程该说历练在途').toBe(true)
      expect(done, '未走完的行程不许又说历练完成').toBe(false)
      expect(summary.notes.find(n => n.includes('历练在途'))).toMatch(/尚余\s*[1-9]/)
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * 判据看会话剩余时长,与离线是否超上限无关。
   * 故障注入:把判据改成 `dtSec > capSec + 1`,本用例红。
   */
  it('离线正好等于洞府上限(8h):截断的半程仍要在卷轴上说一句', () => {
    setActivePinia(createPinia())
    const game = useGameStore()
    const player = usePlayerStore()
    const adventure = useAdventureStore()
    game.markStarted()
    vi.useFakeTimers()
    const now = new Date('2026-10-23T12:00:00.000Z').getTime()
    vi.setSystemTime(now)
    try {
      const started = now - 8 * 3600 * 1000 // 等于 0 级洞府的离线上限
      game.lastActiveAt = started
      game.totalPlaySec = 60 * 60
      player.major = 2
      player.exp = { m: 0, e: 0 }
      adventure.setSession({
        regionId: 'qingyun',
        mode: 'deepExpedition',
        startedAt: started,
        endsAt: started + 16 * 3600 * 1000, // 满程 16h,只走了 8h
        nextBattleAt: started + EXPLORE_BATTLE_INTERVAL * 1000,
        wins: 0,
        losses: 0,
        events: 0,
        stoneGain: { m: 0, e: 0 },
        expGain: { m: 0, e: 0 },
        itemGain: 0
      })
      const summary = settleOffline(now)!
      const note = summary.notes.find(n => n.includes('历练在途'))
      expect(note, `离线正好等于上限时卷轴只字未提:${summary.notes.join(' | ')}`).toBeTruthy()
      expect(note).toMatch(/尚余\s*8小时/)
      expect(useAdventureStore().session, '被 cap 截断的会话不该被清掉').not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

/** 在线每败一场走一次 `recordLoss`,三次即标宿敌 */
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
    // 普通战与首领战各记各的敌手,合计须与本趟败场同源
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

    // 首领战走真实战斗,顶多败那一场
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
    // ore 在线期望 0.35×1.5=0.525/胜:120 胜须 63,写死 0.5 只有 60
    expect(g.ore, 'ore 应随 ORE_DROP_CHANCE×1.5,不可退回写死 0.5').toBe(Math.round(120 * ORE_DROP_CHANCE * 1.5))
    expect(g.herb, 'herb 应随 HERB_DROP_CHANCE×2').toBe(Math.round(120 * HERB_DROP_CHANCE * 2))
    expect(g.page, 'page 应随 PAGE_DROP_CHANCE×1.5').toBe(Math.round(120 * PAGE_DROP_CHANCE * 1.5))
    // 福缘整体放大;模式/事件倍率只作用于 page,不碰 herb/ore(在线 rewardMult 只碰 page 概率与装备)
    expect(offlineMaterialGain(100, 2, 1).ore).toBe(Math.round(100 * ORE_DROP_CHANCE * 1.5 * 2))
    expect(offlineMaterialGain(100, 1, 1.4).page).toBe(Math.round(100 * PAGE_DROP_CHANCE * 1.5 * 1.4))
    expect(offlineMaterialGain(100, 1, 1.4).ore).toBe(Math.round(100 * ORE_DROP_CHANCE * 1.5))
    // flat 尘为离线独有值,须走命名常量,不得裸写 0.3;福缘同样放大
    expect(g.dust).toBe(Math.round(120 * OFFLINE_FLAT_DUST_PER_WIN))
    expect(offlineMaterialGain(100, 2, 1).dust).toBe(Math.round(100 * OFFLINE_FLAT_DUST_PER_WIN * 2))
  })
})

/** 在线每胜一场按 `ARTIFACT_DROP_CHANCE × (1 + luck)` 掷一次 */
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
    // 件数随池子与权重浮动,只验有期望即有产出
    expect(expected, '这一趟的胜场该足以期望出法宝').toBeGreaterThan(0)
    expect(inventory.artifacts.length, '离线也要走法宝掉落通道').toBeGreaterThan(0)
    expect(inventory.equippedArtifacts, '玩家不在场,不该替他祭炼').toHaveLength(0)
    expect(summary.notes.some(n => n.includes('法宝')), '拾得法宝要在归来卷轴里说一声').toBe(true)
  })
})

/** 重复拾得折算的悟道点并进同一行;聚合的是播报,不是入账,件数与折算不缩水 */
describe('离线法宝掉落不刷屏(同一件只报一行)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    winRate.value = 1
  })

  it('16 小时档的重复拾得并成一行,不淹没归来卷轴', () => {
    seedSession('deepExpedition')
    const inventory = useInventoryStore()

    const summary = settleOffline(Date.now())!

    const artLines = summary.notes.filter(n => n.includes('法宝'))
    expect(artLines, '法宝这一路只该报一行').toHaveLength(1)
    if (artLines[0]!.includes('悟道点')) {
      expect(artLines[0], '件数要报').toMatch(/×\d+/)
      // 两种词序都认:全仓统一「悟道点 N」,历史写法是「N 悟道点」
      expect(artLines[0], '折算的悟道点要报').toMatch(/悟道点\s*\d+|\d+\s*悟道点/)
    }
    expect(inventory.artifacts.length, '入囊的法宝一件都不能少').toBeGreaterThan(0)
    expect(summary.notes.length, '卷轴其余内容没被挤掉').toBeGreaterThan(3)
  })

  /**
   * 故障注入:把 offline.ts 那段聚合改成「每件 push 一行」,本用例红。
   * 本文件 rng.weighted 恒取首项,掉出的必是同一件。
   */
  it('判据自家不空转:每件一行的写法会把行数顶上去', () => {
    seedSession('deepExpedition')
    const summary = settleOffline(Date.now())!
    const dupLines = summary.notes.filter(n => n.includes('已拥有'))
    expect(dupLines.length, '同一件重复拾得不许每件一行').toBeLessThanOrEqual(1)
  })
})

/** 在线逐场 recordWin/recordLoss;离线整段钉「赏格到账」「有败场则连胜归零」 */
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

/** 在线打赢账上宿敌当场清账;离线整段净胜为正同样清账 */
describe('离线雪耻(与在线同源)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    winRate.value = 1
  })

  it('净胜为正时,账上的宿敌被标记为已雪耻并写进卷轴', () => {
    seedSession('normal')
    const player = usePlayerStore()
    // 预置三次败绩;离线敌群取首项 e_wolf
    let list = player.nemeses
    for (let i = 0; i < NEMESIS_THRESHOLD; i += 1) {
      list = recordLoss(list, 'e_wolf', '赤目野狼', 'qingyun', Date.now()).list
    }
    player.setNemeses(list)

    const summary = settleOffline(Date.now())!

    expect(summary.wins, '这一趟该净胜').toBeGreaterThan(0)
    expect(player.nemeses.find(n => n.enemyId === 'e_wolf')?.avengedAt, '离线打赢就该雪耻').toBeDefined()
    expect(summary.notes.some(n => n.includes('雪耻')), '雪耻要在卷轴里说一声').toBe(true)
  })
})

/** 在线每交一次手,祭着法宝(非仅持有)就 `noteTaboo('artifact')`;离线整段用同一份 `buildPlayerSnap()`(含法宝被动) */
describe('离线历练也照在线记法宝破题', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    winRate.value = 1
  })

  it('身怀法宝挂机历练,「独行」之誓同样落空', () => {
    seedSession('normal')
    beginLife('lt_zejian')
    const art = ARTIFACTS.find(a => a.fromTier <= 1)!
    useInventoryStore().addArtifact(art.id, true)
    expect(useInventoryStore().equippedArtifacts, '先得真的祭上一件法宝').not.toHaveLength(0)

    const summary = settleOffline(Date.now())!
    expect(summary.battles, '这一趟得真的交过手').toBeGreaterThan(0)
    expect(vowResult(), '离线带着法宝打了一夜,题不该还立着').toBe('broken')
    expect(summary.notes.some(n => n.includes('破题')), '破题要在归来卷轴里说一声').toBe(true)
  })
})

/** 在线每遇一个历练情境走一次 `offerBondEvent`,机会点 +1;离线只补记账、不替玩家抽事件 */
describe('离线只攒道侣机会点,不替玩家推进关系', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    winRate.value = 0.5
  })

  it('整段历练攒下机会点,但缘分/信任/契合与待决事件一律不动', () => {
    seedSession('normal')
    meet('dl_qingli')
    const player = usePlayerStore()
    const before = { ...player.bond! }

    const summary = settleOffline(Date.now())!
    expect(summary.battles, '这一趟得真的交过手').toBeGreaterThan(0)

    const after = player.bond!
    expect(after.opportunities, '走过这么多场,机会点该攒起来').toBeGreaterThan(before.opportunities)
    expect(after.fate, '缘分不该在缺席期间自己长').toBe(before.fate)
    expect(after.trust, '信任不该在缺席期间自己长').toBe(before.trust)
    expect(after.accord, '契合不该在缺席期间自己长').toBe(before.accord)
    expect(after.pendingEventId, '不能替玩家决定遇上哪件事').toBe(before.pendingEventId)
  })
})

/** 在线首领在同一个 `result.win` 分支里走 `markAvenged`;离线首领战打赢同样清账 */
describe('离线首领战同样雪耻', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // 普通战全败:唯一胜场是末尾那场首领战
    winRate.value = 0
  })

  it('整趟只赢在首领头上时,账上的宿敌也被清掉', () => {
    seedSession('normal')
    const player = usePlayerStore()
    // 整趟已攒足首领门槛,本段才轮到首领;首领战是真 resolveCombat,境界须打得过
    useAdventureStore().setSession({ ...useAdventureStore().session!, wins: 10 })
    player.major = 12
    const boss = enemyDef(placeContent('qingyun').boss)!
    let list = player.nemeses
    for (let i = 0; i < NEMESIS_THRESHOLD; i += 1) {
      list = recordLoss(list, boss.id, boss.name, 'qingyun', Date.now()).list
    }
    player.setNemeses(list)

    // rng.chance 固定为 true 时 combat 的 dodge 每击都闪避,打不出胜负;本场结算期间放开 chance、伤害倍率拨到上界
    const realChance = rng.chance
    const realFloat = rng.float
    ;(rng as { chance: (p: number) => boolean }).chance = () => false
    ;(rng as { float: (a: number, b: number) => number }).float = (_a, b) => b
    let summary
    try {
      summary = settleOffline(Date.now())!
    } finally {
      ;(rng as { chance: (p: number) => boolean }).chance = realChance
      ;(rng as { float: (a: number, b: number) => number }).float = realFloat
    }
    expect(summary.battles, '这一趟得真的交过手').toBeGreaterThan(0)
    expect(summary.notes.some(n => n.includes(`【${boss.name}】`)), '首领这一场该真的打了').toBe(true)
    expect(player.nemeses.find(n => n.enemyId === boss.id)?.avengedAt, '首领打赢也该雪耻').toBeDefined()
    expect(summary.notes.some(n => n.includes('雪耻')), '雪耻要在卷轴里说一声').toBe(true)
  })
})

/**
 * `afterWin` 的法宝分支默认自动祭上空祭炼位;玩家不在场的路径不得改其构筑(同 `autoResolveEvent`)。
 * 故障注入:把 offline.ts 首领战那行的第四个参数 false 摘掉,本用例红。
 */
describe('离线首领战不替玩家祭法宝', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    winRate.value = 0
  })

  /** 判据落在调用点:行为判据依赖首领恰好掉法宝(1.5%×6 = 9%),多数 run 空转 */
  it('首领战的 afterWin 调用把「不自动祭炼」传到底', () => {
    const offline = readFileSync(new URL('./offline.ts', import.meta.url), 'utf8')
    expect(offline, '首领战那行必须带第四参 false(玩家不在场)').toMatch(
      /afterWin\([^)]*OFFLINE_BOSS_REWARD_MULT[^)]*,\s*true,\s*false\)/
    )
  })

  it('普通战那条通道本来就不自动祭炼(一并钉住,防回归)', () => {
    const offline = readFileSync(new URL('./offline.ts', import.meta.url), 'utf8')
    expect(offline, '普通战法宝通道显式传 autoEquip=false').toContain('acquireArtifactGain(artId, true, false)')
  })
})
