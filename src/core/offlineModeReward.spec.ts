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

function seedSession(mode: 'normal' | 'deep' | 'prolonged' | 'marathon' | 'deepExpedition'): void {
  const game = useGameStore()
  const player = usePlayerStore()
  const adventure = useAdventureStore()
  game.markStarted()
  // 长档的缺席时长跟着档位走:8h / 16h 档按自己的时长离线,才验得到封顶。
  // endsAt 必须与缺席时长配对 —— 否则 remainSec 短于缺席,会话早被判「圆满结束」,
  // 离线只结那一小截,长档与封顶这条判据一起失效(故障注入时正是这样假绿过)
  const awayHours = mode === 'normal' || mode === 'deep' ? SESSION_HOURS : EXPLORE_MODES[mode].durationSec / 3600
  const started = Date.now() - awayHours * 3600 * 1000
  game.lastActiveAt = started
  game.totalPlaySec = 60 * 60 // 本日第 1 小时,避开跨天时序
  player.major = 2 // 筑基境,打得动一阶区域
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
function runOnce(mode: 'normal' | 'deep' | 'prolonged' | 'marathon' | 'deepExpedition'): Yields {
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
 * 新增的 8h / 16h 两档 —— 倍率真的进离线产出,且离线结算不许越过洞府封顶。
 *
 * 长档的意义全在「关掉游戏的那一夜」:8h ×3 / 16h ×3.6 若只写在档位表里而
 * 结算不读,玩家选长档与选 4h 拿到的是一样的东西,档位就成了摆设。
 * 这里沿用同一套确定性装配(固定 rng + 固定胜率),只换档位与洞府等级。
 *
 * 第二条判据钉封顶:16h 的行程配 8h 的洞府,离线只结 8h ——
 * 若哪天平掉 capSec,这条会按 16h 计,产出跳到两倍,必红。
 */
describe('离线长档(8h / 16h)吃同一把倍率,且不越过洞府封顶', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    winRate.value = 0.5
  })

  it('「彻夜问道」(8h,×3)的产出高于「长线云游」(4h,×2.4)', () => {
    const marathon = runOnce('marathon')
    const prolonged = runOnce('prolonged')
    expect(prolonged.page, '4h 档应有产出').toBeGreaterThan(0)
    // 8h 是 4h 的两倍时长、倍率也更高:产出必须显著更高,而不是持平
    expect(marathon.page).toBeGreaterThan(prolonged.page)
    expect(marathon.pills).toBeGreaterThan(prolonged.pills)
  })

  it('16h 行程配 8h 洞府:离线只结 8h,不按整程 16h 给', () => {
    // 洞府 0 级 = 8h 封顶。锚点取「同一档位、只缺席 8h」的那一程:
    // 若 capSec 失效,16h 档会按整程结算,产出约为锚点的两倍。
    const capped = runOnce('deepExpedition')
    const anchor = runOnce('marathon') // 8h 档:时长恰为封顶,产出即为 8h 的满额
    expect(capped.page, '16h 档应有产出').toBeGreaterThan(0)
    expect(anchor.page).toBeGreaterThan(0)
    // 同为 8h 结算,只差档位倍率(3.6 vs 3.0):产出应在同一量级,不得翻倍
    expect(capped.page).toBeLessThan(anchor.page * 1.5)
    expect(capped.pills).toBeLessThan(anchor.pills * 1.5)
    // 再钉一层:会话剩余时长是 16h,离线只推进到 8h —— 会话不该被判「圆满结束」
    const summary = settleOffline(Date.now())
    expect(summary).not.toBeNull()
  })

  /**
   * 被 cap 截断的历练会话要在归来卷轴上说一句「还没走完」。
   *
   * 16h 档配 8h 洞府时离线只结一半,会话留着、`nextBattleAt` 排在未来 ——
   * 玩家回来看到历练还在跑,却不知道为何只结算了一半。秘境与远征都有
   * 「仍在途」那句,唯独被截断的历练没有,这半程就成了哑谜。
   */
  it('16h 档配 8h 洞府:归来卷轴写明这一程还没走完,并给出剩余时长', () => {
    setActivePinia(createPinia())
    // 缺席 12h(超过 8h 上限),会话满程 16h:离线只结 8h,还剩 8h 在途
    const game = useGameStore()
    const player = usePlayerStore()
    const adventure = useAdventureStore()
    game.markStarted()
    const awayHours = 12
    const started = Date.now() - awayHours * 3600 * 1000
    game.lastActiveAt = started
    game.totalPlaySec = 60 * 60
    player.major = 2
    player.exp = { m: 0, e: 0 }
    adventure.setSession({
      regionId: 'qingyun',
      mode: 'deepExpedition',
      startedAt: started,
      // 满程 16h:现在走到一半,还剩 8h
      endsAt: started + 16 * 3600 * 1000,
      nextBattleAt: started + EXPLORE_BATTLE_INTERVAL * 1000,
      wins: 0,
      losses: 0,
      events: 0,
      stoneGain: { m: 0, e: 0 },
      expGain: { m: 0, e: 0 },
      itemGain: 0
    })
    const summary = settleOffline(Date.now())!
    const note = summary.notes.find(n => n.includes('这一程还没走完'))
    expect(note, `归来卷轴未提被截断的历练:${summary.notes.join(' | ')}`).toBeTruthy()
    expect(note).toContain('洞府上限')
    expect(note).toMatch(/尚余\s*4小时/)
    // 会话必须仍在途(没被误判成圆满结束)
    expect(useAdventureStore().session, '被 cap 截断的会话不该被清掉').not.toBeNull()
  })

  /**
   * 「圆满结束」与「还没走完」两句互斥 —— 不能同屏出现。
   *
   * 16 小时档配 8h 洞府时,离线只推进到洞府上限,会话留在途上:这时该印
   * 「还没走完」;一旦这一程真的走完了(remainSec 已被这段缺席走满),
   * 该印的是「圆满结束」。两句同时出现,玩家读到的就是自相矛盾的旅程。
   */
  it('圆满结束与还没走完不共屏', () => {
    setActivePinia(createPinia())
    const game = useGameStore()
    const player = usePlayerStore()
    const adventure = useAdventureStore()
    game.markStarted()
    const awayHours = 12
    const started = Date.now() - awayHours * 3600 * 1000
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
    const summary = settleOffline(Date.now())!
    const done = summary.notes.some(n => n.endsWith('之行圆满结束'))
    const unfinished = summary.notes.some(n => n.includes('这一程还没走完'))
    // 这一程还剩 8h(16h 满程 − 12h 缺席),离线只结 8h → 未走完
    expect(unfinished, '还剩半程该说还没走完').toBe(true)
    expect(done, '未走完的行程不许又说圆满结束').toBe(false)
    // 句子里必须给出可核对的剩余数,不能只说一句「还没走完」
    expect(summary.notes.find(n => n.includes('这一程还没走完'))).toMatch(/尚余\s*[1-9]/)
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
 * 离线法宝掉落**不刷屏**。
 *
 * 离线按期望件数入账,长线行程一次能掉出几十件,而囊中早就有的那几件每件都吐
 * 一行「(已拥有,化作悟道点×10)」—— 实测 16 小时档 30 件重复把归来卷轴淹掉,
 * 玩家想读的「这一趟还出了什么」被同一行挤出视野。故同一件只报一行,
 * 重复的折算悟道点并进那一行。
 *
 * 聚合的是**播报**,不是入账:件数与折算都不能因此缩水。
 */
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
    // 同一件重复拾得时,行里要写清件数与折算的悟道点 —— 不报数等于把账藏了
    if (artLines[0]!.includes('悟道点')) {
      expect(artLines[0], '件数要报').toMatch(/×\d+/)
      expect(artLines[0], '折算的悟道点要报').toMatch(/\d+ 悟道点/)
    }
    // 聚合只改播报,不改入账:囊中件数仍按真实拾得记
    expect(inventory.artifacts.length, '入囊的法宝一件都不能少').toBeGreaterThan(0)
    expect(summary.notes.length, '卷轴其余内容没被挤掉').toBeGreaterThan(3)
  })

  /**
   * 故障注入:把 offline.ts 那段聚合改回「每件 push 一行」→ 本条红并点名。
   * 只断言「不是每件一行」:本文件的 rng.weighted 恒取首项,掉出来的必是同一件,
   * 行数一多就是这个坏行为的直接读数(修前实测 31 行)。
   */
  it('判据自家不空转:每件一行的写法会把行数顶上去', () => {
    seedSession('deepExpedition')
    const summary = settleOffline(Date.now())!
    const dupLines = summary.notes.filter(n => n.includes('已拥有'))
    expect(dupLines.length, '同一件重复拾得不许每件一行').toBeLessThanOrEqual(1)
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

/**
 * 离线雪耻:在线打赢一位仍在账上的宿敌当场清账。离线整段若净胜为正,
 * 就该同样清账 —— 从前只补败北不补雪耻,挂机把它打回去几十次,
 * 征战录仍写「尚为宿敌」。
 */
describe('离线雪耻(与在线同源)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    winRate.value = 1
  })

  it('净胜为正时,账上的宿敌被标记为已雪耻并写进卷轴', () => {
    seedSession('normal')
    const player = usePlayerStore()
    // 先按同名敌手欠下三次败绩 —— 离线这一趟的敌群取首项 e_wolf
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

/**
 * 离线破题:在线每交一次手,身怀法宝就 `noteTaboo('artifact')` ——
 * 「独行」之誓看的是有没有真的祭出法宝,不是有没有法宝在身。
 *
 * 离线整段用同一份 `buildPlayerSnap()`(其中含法宝被动)打了一夜,
 * 却从不记这一笔:挂机刷够 400 杀,回来题还立着,与在线同一件事两套账。
 */
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

/**
 * 道侣机会点:在线每遇一个历练情境走一次 `offerBondEvent`,由它给机会点 +1;
 * 离线整段从前一个都不攒 —— `offlineScope.spec` 里那句「机会点该随历练攒起来」
 * 只断言了 ≥,没有真值;而「只补记账、不替玩家抽事件」是同一套边界。
 */
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

/**
 * 首领战雪耻:在线首领也在同一个 `result.win` 分支里走 `markAvenged`,
 * 离线既然真的打这一场,打赢同样该清账 —— 否则整趟只赢在首领头上,
 * 征战录仍写「尚为宿敌」。
 */
describe('离线首领战同样雪耻', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // 普通战一场不赢:这一趟的唯一胜场就是末尾那场首领战,
    // 才真的验到「只赢在首领头上」时雪耻有没有落账
    winRate.value = 0
  })

  it('整趟只赢在首领头上时,账上的宿敌也被清掉', () => {
    seedSession('normal')
    const player = usePlayerStore()
    // 整趜已经擦足首领门機，这一段才真的轮到首领;境界拉到硤纷，这一场是真 resolveCombat
    // 境界拉到元婴,这一场是真 resolveCombat,得真的打得过
    useAdventureStore().setSession({ ...useAdventureStore().session!, wins: 10 })
    player.major = 12
    const boss = enemyDef(placeContent('qingyun').boss)!
    let list = player.nemeses
    for (let i = 0; i < NEMESIS_THRESHOLD; i += 1) {
      list = recordLoss(list, boss.id, boss.name, 'qingyun', Date.now()).list
    }
    player.setNemeses(list)

    /**
     * 本文件把 rng.chance 固定为 true —— 到了真打的首领战,那意味着**每一击都被闪避**
     * (combat 的 dodge 判定走同一枚 chance),五十回合下来谁也没打中谁。
     * 这一条要验的是「首领打赢之后记不记雪耻」,故只在这一场结算期间把 chance 放开、
     * 伤害倍率拨到上界,让 resolveCombat 真的打出胜负 —— 不是绕开战斗另判一个赢。
     */
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
    expect(summary.notes.some(n => n.includes('斩于剑下') || n.includes('区域之主')), '首领这一场该真的打了').toBe(true)
    expect(player.nemeses.find(n => n.enemyId === boss.id)?.avengedAt, '首领打赢也该雪耻').toBeDefined()
    expect(summary.notes.some(n => n.includes('雪耻')), '雪耻要在卷轴里说一声').toBe(true)
  })
})

/**
 * 离线首领战也不替玩家祭法宝。
 *
 * 首领战走的是同一个 `afterWin`，而它的法宝分支默认自动祭上空祭炼位。
 * 普通战的法宝通道早就改成了 `acquireArtifactGain(artId, true, false)`，首领战这条却漏着
 * —— 挂一夜回来随身那一格已经被人换过，而玩家从没点过那个按钮。
 * 与 `autoResolveEvent` 的教训同源：他不在场的那些路，一律不准改他的构筑。
 *
 * 故障注入: 把 offline.ts 首领战那行的第四个参数 false 摘掉,本条必红。
 */
describe('离线首领战不替玩家祭法宝', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    winRate.value = 0
  })

  /**
   * 判据落在**调用点**:首领那一场是不是真的把「不自动祭炼」传了进去。
   *
   * 行为判据(run 一整趟 offline,看随身槽空不空)依赖首领战恰好掉出一件法宝,
   * 而首领掉法宝的概率只有 1.5%×6 = 9%,绝大多数 run 里这条判据是空转的 ——
   * 故障注入时它照样绿,等于没守。调用点是确定的:afterWin 的第四参漏了就是漏了。
   */
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
