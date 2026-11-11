/**
 * sanitizeAllStores:逐仓字段级自愈的唯一入口,启动(首次渲染前)、引擎 start、离线结算前共用。
 * 钉两件事:坏字段(NaN/负值)被修平;健康存档幂等。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { sanitizeAllStores } from '@/stores/sanitizeAll'
import { useResourcesStore } from '@/stores/resources'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { suppressionProgress } from '@/core/suppress'
import { useCultivationStore } from '@/stores/cultivation'
import { buildIdentity } from '@/core/identityService'
import { mentorHint } from '@/core/fortuneChain'
import { echoEligible } from '@/core/fortuneEcho'
import { battleDataRows } from '@/core/battleAnalysis'
import { useEndgameStore } from '@/stores/endgame'
import { todayLocalNum } from '@/utils/time'

describe('sanitizeAllStores 逐仓自愈', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('坏字段被修平:资源 NaN / 负值夹回 0', () => {
    const r = useResourcesStore()
    r.$patch({ wudao: Number.NaN, ore: -5 })
    sanitizeAllStores()
    expect(r.wudao).toBe(0)
    expect(r.ore).toBe(0)
  })

  it('健康存档幂等:逐仓自愈后原样不变', () => {
    const r = useResourcesStore()
    r.$patch({ wudao: 3, ore: 4 })
    sanitizeAllStores()
    expect(r.wudao).toBe(3)
    expect(r.ore).toBe(4)
  })
})

describe('sanitizeAllStores 修「按 id 认对象」的坏账', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('区域战绩里的 NaN 不会让镇压资格永远差一项,也不会写出 NaN 读数', () => {
    const p = usePlayerStore()
    p.$patch({
      regionStats: {
        qingyun: {
          totalFights: 25,
          avgRounds: Number.NaN,
          avgDamageTakenPct: Number.NaN,
          consecutiveWins: Number.NaN,
          lastUpdateAt: Number.NaN
        },
        nowhere: { totalFights: 3, avgRounds: 2, avgDamageTakenPct: 0.02, consecutiveWins: 1, lastUpdateAt: 1 }
      } as never
    })
    sanitizeAllStores()

    const st = p.regionStats.qingyun!
    expect(st.avgRounds).toBe(0)
    expect(st.avgDamageTakenPct).toBe(0)
    expect(st.consecutiveWins).toBe(0)
    expect(st.lastUpdateAt).toBe(0)
    expect(p.regionStats.nowhere, '认不出的地界整条丢掉').toBeUndefined()
    const progress = suppressionProgress(st)
    expect(progress.roundsOk).toBe(true)
    expect(progress.damageOk).toBe(true)
  })

  it('镇压起钟修平:坏时刻按此刻重新起钟,不在镇压表里的残项清掉', () => {
    const p = usePlayerStore()
    p.major = 20
    p.$patch({
      suppressedRegions: ['qingyun', 'wanyao'],
      suppressedSince: { qingyun: Number.NaN, wanyao: 12345, heifeng: 999 } as never
    })
    const before = Date.now()
    sanitizeAllStores()

    expect(p.suppressedSince.qingyun, 'NaN 起钟改为此刻,收益不丢、复聚照常').toBeGreaterThanOrEqual(before)
    expect(p.suppressedSince.wanyao).toBe(12345)
    expect(p.suppressedSince.heifeng).toBeUndefined()
  })

  it('连胜/巡游日期被写成 NaN 时归零,而不是每 30 秒重掷一次', () => {
    const p = usePlayerStore()
    p.$patch({ winStreak: Number.NaN, lastCaveEventDay: Number.NaN, regionWins: { qingyun: Number.NaN, wanyao: 4 } as never })
    sanitizeAllStores()
    expect(p.winStreak).toBe(0)
    expect(p.lastCaveEventDay).toBe(0)
    expect(p.regionWins).toEqual({ wanyao: 4 })
  })

  it('事件记忆按事件 id 合并:坏时刻/坏计数不再写进征战录', () => {
    const a = useAdventureStore()
    a.$patch({
      eventMemories: {
        ev_spring: { eventId: 'ev_spring', times: 2, lastAt: 100, lastChoiceIdx: 0 },
        ev_herb_garden: { eventId: 'ev_herb_garden', times: Number.NaN, lastAt: Number.NaN, lastChoiceIdx: Number.NaN }
      } as never
    })
    a.$patch({
      eventMemories: {
        ...a.eventMemories,
        ev_old_man: { eventId: 'ev_old_man', times: 3, lastAt: Number.POSITIVE_INFINITY, lastChoiceIdx: 99 }
      } as never
    })
    sanitizeAllStores()

    expect(a.eventMemories.ev_herb_garden, '计数不是正整数的记录直接丢弃').toBeUndefined()
    const mem = a.eventMemories.ev_old_man!
    expect(mem.times).toBe(3)
    expect(Number.isFinite(mem.lastAt)).toBe(true)
    expect(mem.lastChoiceIdx).toBeGreaterThanOrEqual(0)
    expect(a.eventMemories.ev_spring!.times).toBe(2)
  })

  it('本世之界残骸整份作废,不让世界页在渲染期抛错', () => {
    const a = useAdventureStore()
    // 空链:worldIdentity 读 sorted[0]!,worldView 出空白地图
    a.$patch({
      mortalWorld: { seed: 1, chain: [], ruleId: 'x', ruleName: 'x', bias: 'x' } as never
    })
    sanitizeAllStores()
    expect(a.mortalWorld).toBeNull()
  })

  it('本世之界内节点字段坏掉时同样整份作废,好世界原样保留', () => {
    const a = useAdventureStore()
    a.$patch({
      mortalWorld: {
        seed: 1,
        chain: [{ nodeId: 'n0_qingyun', fromId: 'qingyun', name: '青云', tier: Number.NaN }],
        ruleId: 'x',
        ruleName: 'x',
        bias: 'x'
      } as never
    })
    sanitizeAllStores()
    expect(a.mortalWorld).toBeNull()
  })

  it('战报结果形状坏掉时整份作废,不让战斗面板读出 NaN', () => {
    const a = useAdventureStore()
    a.$patch({
      lastBattle: {
        enemyName: '石傀',
        enemyIcon: 'x',
        isBoss: false,
        result: { win: true, log: [null, { text: '一记' }], rounds: Number.NaN, playerHpPct: Number.NaN },
        at: Number.NaN
      } as never
    })
    sanitizeAllStores()
    const b = a.lastBattle
    expect(b, '日志可救,不该整份丢').not.toBeNull()
    expect(b!.result.log).toHaveLength(1)
    expect(b!.result.rounds).toBe(0)
    expect(b!.result.playerHpPct).toBe(0)
    expect(Number.isFinite(b!.at)).toBe(true)
  })

  /**
   * 战报遥测也要修形:分析面板直接读 `stats.player.dealt.m`,
   * 缺字段(null / 旧档没有后加字段)会在 computed 里抛「reading 'm'」,战报区反复报错。
   * 故障注入:把 sanitizeSideStats 摘掉 → 本条红。
   */
  it('战报遥测缺字段或写成 null 时补齐,分析面板不再抛 reading m', () => {
    const a = useAdventureStore()
    a.$patch({
      lastBattle: {
        enemyName: '石傀',
        enemyIcon: 'x',
        isBoss: false,
        result: {
          win: true,
          log: [{ t: 'hit', text: '一记' }],
          rounds: 3,
          playerHpPct: 0.4,
          stats: {
            player: { dealt: null, taken: { m: 2, e: 1 } },
            enemy: { dealt: { m: 1, e: 1 } }
          }
        },
        at: Date.now()
      } as never
    })
    sanitizeAllStores()
    const b = a.lastBattle
    expect(b, '遥测可补,不该整份丢').not.toBeNull()
    // 两侧都补得回来才留;缺到补不出就按「无遥测」处理
    if (b!.result.stats) {
      for (const side of [b!.result.stats.player, b!.result.stats.enemy]) {
        for (const key of ['dealt', 'taken', 'pierceTaken', 'biggestHitTaken', 'healed', 'shieldAbsorbed'] as const) {
          expect(side[key], `${key} 没补成 GNum —— 分析面板会抛 reading m`).toMatchObject({ m: expect.any(Number), e: expect.any(Number) })
        }
        for (const key of ['dodges', 'hitsLanded', 'crits', 'skillCasts'] as const) {
          expect(Number.isFinite(side[key]), `${key} 应补成有限数`).toBe(true)
        }
      }
      expect(() => battleDataRows({ ...b!.result })).not.toThrow()
    }
  })

  it('待处理事件认不出时清掉,不让历练一直堵到超时', () => {
    const a = useAdventureStore()
    a.$patch({ pendingEventId: 'ev_does_not_exist', pendingEventSince: Number.NaN })
    sanitizeAllStores()
    expect(a.pendingEventId).toBeNull()
    expect(a.pendingEventSince).toBe(0)
  })

  /**
   * 日记号不许落在今天之后。
   *
   * 三道每日闸门写的都是等号比较(`lastCaveEventDay === today`、`dailyDoneDay === daily.day`、
   * `wudaoExchange.gameDay === day`)。等号遇到未来的值**两个方向各错一边**:
   *   lastCaveEventDay 未来 → 等号永不成立 → 每日巡游永久停摆(实测一年后的日期一路通过)
   *   dailyDoneDay 未来     → 等号永不成立 → 「今日已挑战」后台为假,可重复领赏
   * 两种都不会报错,只表现为「某项每日玩法突然没有了 / 突然能刷了」。
   */
  it('日记号落在未来时归零,每日闸门不会永久停摆或永久可刷', () => {
    const player = usePlayerStore()
    player.initCharacter('测试', { roots: [] } as never)
    const today = todayLocalNum()
    const future = today + 10000

    player.lastCaveEventDay = future
    player.wudaoExchange = { gameDay: 999999, count: 1 }
    player.sanitize()
    /*
     * 夹到「今天」而不是归零:归零的语义是「从未巡游过」,而时钟回拨后重载时
     * 那条记录的语义是「刚巡游过」—— 归零会把它变成「可以再抽一次」。
     * 夹到今天既挡住未来日,也保住「今日已做」。
     */
    expect(player.lastCaveEventDay, '未来的巡游日会让每日巡游永久停摆').toBe(today)
    expect(player.wudaoExchange?.gameDay, '未来的兑换日会让每日兑换永久停摆').toBe(0)

    // 健康值不该被动
    player.lastCaveEventDay = today
    player.sanitize()
    expect(player.lastCaveEventDay, '今天的巡游日应原样保留').toBe(today)
  })

  it('天道每日的日记号落在未来时夹到今天,不会变成可重复挑战', () => {
    /*
     * 早先这里归 null —— 而归 null 的语义是「今天还没挑战」,
     * 恰好是坏档该被挡住的方向。更麻烦的是它与闸门的 `>=` 判据互相抵消:
     * 今天领过 → 时钟回拨 → 重载,这条被归 null,闸门恒假,天道赏又能领一次。
     * 现改为**夹到今天**(与洞府巡游的 lastCaveEventDay 同一条处理)。
     */
    const endgame = useEndgameStore()
    endgame.dailyDoneDay = todayLocalNum() + 10000
    endgame.sanitize()
    expect(endgame.dailyDoneDay, '未来的天道日没被夹住 —— 「今日已挑战」会恒假').toBe(todayLocalNum())
    // 健康的今天不该被清
    endgame.dailyDoneDay = todayLocalNum()
    endgame.sanitize()
    expect(endgame.dailyDoneDay, '今天的挑战日应原样保留').toBe(todayLocalNum())
  })

  /** 坏档写成 null 时,identityService 的 Object.entries、师承推荐与遗产回声三处一起抛错 */
  it('机缘选择记忆坏掉时回落空表:身份/师承推荐/回声都不再抛错', () => {
    const p = usePlayerStore()
    useCultivationStore()
    p.$patch({
      fortuneChoices: {
        ft_sword_remnant: 'take',
        ft_beast_pledge: 'yes',
        ft_ancient_elixir: null
      } as never
    })
    sanitizeAllStores()
    expect(p.fortuneChoices, '只认 take/leave 两个字面值').toEqual({ ft_sword_remnant: 'take' })
    expect(() => buildIdentity(), '人物页渲染期读它').not.toThrow()
    expect(() => mentorHint(), '师承推荐按 ft_* 下标读').not.toThrow()
    expect(() => echoEligible('ft_sword_remnant'), '遗产回声按 id 下标读').not.toThrow()

    p.$patch({ fortuneChoices: null as never })
    sanitizeAllStores()
    expect(p.fortuneChoices, '整栏被抹成 null 时补回空表').toEqual({})
  })

  it('宿敌的名字/地界被写坏时征战录读到的是可读文本', () => {
    const p = usePlayerStore()
    p.$patch({
      nemeses: [
        { enemyId: 'e_shi', enemyName: 42, regionId: null, lossCount: Number.NaN, lastLossAt: Number.NaN },
        { enemyId: 'e_gui', enemyName: '', regionId: 7, lossCount: 4, lastLossAt: 10 }
      ] as never
    })
    sanitizeAllStores()
    expect(p.nemeses[0]).toEqual({ enemyId: 'e_shi', enemyName: 'e_shi', regionId: '', lossCount: 0, lastLossAt: 0 })
    expect(p.nemeses[1]).toEqual({ enemyId: 'e_gui', enemyName: 'e_gui', regionId: '', lossCount: 4, lastLossAt: 10 })
  })
})
