/**
 * 离线历练与在线历练的「规则同源」红线
 *
 * 逆旅契(lifeTrialRules)经 explorationRules 在线/离线共用一份实现,离线不得内联 currentDaoRules。
 * 离线事件与敌群同走 placeContent,经 regionEventPoolFor 尊重本世 eventTags / minRealm / once。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { gnZero } from '@/utils/gnum'
import { explorationRules } from './exploration'
import { EVENTS } from '@/data/events'
import { isOfflineSafeEvent, OFFLINE_SAFE_EFFECTS, settleOffline } from './offline'
import { usePlayerStore } from '@/stores/player'
import { useGameStore } from '@/stores/game'
import { useAdventureStore } from '@/stores/adventure'
import { useLoreStore } from '@/stores/lore'

const src = (f: string) => resolve(__dirname, f)

describe('离线历练 · 战斗规则与在线同源(逆旅契)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('逆旅契合并只此一份:在线与离线都经 explorationRules,离线不再内联 currentDaoRules', () => {
    const exploration = readFileSync(src('./exploration.ts'), 'utf8')
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    expect(exploration).toContain('lifeTrialRules()')
    // 离线普通战与首领战都走共用函数
    expect(offline).toContain('explorationRules')
    // 离线只带 currentDaoRules 会漏契
    expect(offline).not.toContain('currentDaoRules()')
  })

  it('签下逆锋契后,explorationRules 并入敌攻/敌命加成', () => {
    usePlayerStore().setLifeTrial({ trialId: 'tr_ni', at: 0, paid: 48 })
    const rules = explorationRules()
    expect(rules?.enemyAtkMult).toBeCloseTo(1.3, 10)
    expect(rules?.enemyHpMult).toBeCloseTo(1.2, 10)
  })

  it('未签契且未择道途时,explorationRules 为空(不叠加任何规则)', () => {
    expect(explorationRules()).toBeUndefined()
  })
})

describe('离线历练 · doubleDropRate 与在线同源', () => {
  it('离线普通战结算并入福缘词条:doubleDropRate 按期望值乘入灵石/修为/材料/装备', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    // 离线普通战公式须读该词条;首领战走 afterWin 已生效
    expect(offline).toContain("modOf(mods, 'doubleDropRate')")
    // 期望值乘子须乘进 stones/exp/materials/equip 四处
    expect(offline).toContain('* doubleMult')
    // 福缘翻倍不作用于丹药(在线掷在 doubled 循环之外)
    const pillLine = offline.split('\n').find(l => l.includes('PILL_DROP_CHANCE * modeDef'))
    expect(pillLine, '离线普通战应有丹药掉落行').toBeTruthy()
    expect(pillLine, '丹药概率不应乘福缘翻倍').not.toContain('doubleMult')
  })
})

describe('离线历练 · 溢出装备折尘与在线化尘口径同源(单一事实源)', () => {
  it('溢出件数折尘走 avgDustPerDrop(tier),不再写死固定 4 尘', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    // 同层平均分解尘取 economySim 采样口径,与在线 salvageOf 同族
    expect(offline).toContain('overflowDust = Math.round((equipCount - realCount) * avgDustPerDrop(region.tier))')
    expect(offline).not.toMatch(/realCount\) \* 4/)
  })
})

/*
 * 离线只自动结算「不替玩家拍板」的事件 —— 这条是行为判据,不是源码扫描。
 *
 * 上面那条全是 `expect(offline).toContain(...)`,只能证明源码里写了这些函数,
 * 不能证明它们拦对了。变异扫描把 `offline.ts:392` 的兜底报成「改坏了不会红」——
 * 那个兜底本身是死分支(实测 44 个区的安全池全非空),但它守的语义值得钉:
 * 身份/永久构筑类效果(pet / gongfa / artifact / lifespan)不许离线替玩家拿。
 */
describe('离线事件安全闸 · 拦的是身份与永久构筑类', () => {
  it('放行:只含 stone/exp/material/equipment/pill/buff/nothing 的事件', () => {
    const safe = EVENTS.find(e =>
      e.choices.every(c => c.outcomes.every(o => o.effects.every(ef => OFFLINE_SAFE_EFFECTS.has(ef.type))))
    )
    expect(safe, '事件表里该有安全事件').toBeDefined()
    expect(isOfflineSafeEvent(safe!), '只含安全效果的事件该放行').toBe(true)
  })

  it('拦下:带 pet / gongfa 的事件不替玩家拿', () => {
    for (const kind of ['pet', 'gongfa', 'artifact', 'lifespan'] as const) {
      const ev = EVENTS.find(e => e.choices.some(c => c.outcomes.some(o => o.effects.some(ef => ef.type === kind))))
      if (!ev) continue
      expect(isOfflineSafeEvent(ev), `带 ${kind} 的事件不该离线放行`).toBe(false)
    }
  })

  it('一个选择里只要有一条不安全结果,整件事就不放行', () => {
    // 玉简:①拾取 的第 1 条结果是 gongfa,②观察 全安全 —— 整件仍须拦下
    const ev = EVENTS.find(e => e.id === 'ev_jade_slip')!
    const hasUnsafe = ev.choices.some(c => c.outcomes.some(o => o.effects.some(ef => !OFFLINE_SAFE_EFFECTS.has(ef.type))))
    expect(hasUnsafe, '夹具要真的含不安全结果').toBe(true)
    expect(isOfflineSafeEvent(ev), '任一条结果不安全,整件事都不许离线自动结算').toBe(false)
  })
})

describe('离线历练 · 事件池与在线同源(本世路线)', () => {
  it('离线事件走 placeContent 的 regionEventPoolFor,不再只剩硬编码通用池', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    expect(offline).toContain('regionEventPoolFor')
    expect(offline).toContain('placeContent(region.id).eventTags')
    // 身份/永久构筑类(pet/gongfa/artifact/lifespan)由 isOfflineSafeEvent 拦下;行为验证见 offlineScope
    expect(offline).toContain('isOfflineSafeEvent')
    expect(offline).toContain('OFFLINE_SAFE_EFFECTS')
  })
})

describe('离线历练 · 区域事件加丰与加难成对(regReward)', () => {
  it('离线普通战与首领战的奖励都并上 regionEventReward,不再只有危险', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    // 与 danger 成对:妖潮/古墓/商队加难亦加丰,倍率进石头/修为/掉落数
    expect(offline).toContain('regionEventReward')
    expect(offline).toMatch(
      /afterWin\(region, modeDef\.rewardMult \* OFFLINE_BOSS_REWARD_MULT \* regionEventReward, true, false\)/
    )
    expect(offline).toContain('modeDef.rewardMult * regionEventReward')
    // 在线 afterWin 把 mode×regReward 全折进 rewardMult,离线装备掉落须同乘模式倍率
    expect(offline).toContain('EQUIP_DROP_CHANCE * modeDef.rewardMult * regionEventReward')
    // 在线残页判定 rng.chance(PAGE_DROP_CHANCE * rewardMult),rewardMult 含 mode×reg;离线由 offlineMaterialGain 单源折算
    expect(offline).toContain('PAGE_DROP_CHANCE * 1.5 * rewardMult')
  })
})

describe('离线历练 · 首领判定与在线同源(本世路线)', () => {
  it('离线首领「是否已清」按本世路线 regionBossCleared 判,不再按旧 REGIONS cleared 链', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    // 与在线 exploration.regionBossCleared 同一判据:本世路线下旧 cleared 链留空,按它判会重打已清首领并解锁下一区
    expect(offline).toContain('regionBossCleared(region.id)')
    expect(offline).not.toMatch(/!adventure\.cleared\.includes\(region\.id\)/)
  })

  /**
   * 首领门槛数整趟会话的胜场(在线 `runBattle` 拿 `s.wins`),不是本段挂机窗口的胜场。
   * 断言看播报不看胜负:首领胜则靖平、败则「败于【某】」,都证明已出场。
   */
  it('离线首领资格并入会话累计胜场,与在线同一趟账', () => {
    /** 只挂两分钟:本段赢不到 10 场,门槛靠会话已有胜场补齐 */
    function run(sessionWins: number): boolean {
      setActivePinia(createPinia())
      const game = useGameStore()
      const player = usePlayerStore()
      const adventure = useAdventureStore()
      const now = Date.now()
      game.markStarted()
      game.lastActiveAt = now - 2 * 60 * 1000
      player.major = 10
      adventure.session = {
        regionId: 'qingyun',
        mode: 'normal',
        startedAt: now - 3600 * 1000,
        endsAt: now + 999 * 3600 * 1000,
        nextBattleAt: 0,
        wins: sessionWins,
        losses: 0,
        events: 0,
        stoneGain: gnZero(),
        expGain: gnZero(),
        itemGain: 0
      }
      const summary = settleOffline(now)!
      return summary.notes.some(n => n.startsWith('败于【')) || adventure.cleared.includes('qingyun')
    }

    // 对照组:只有本段胜场,不够门槛
    expect(run(0), '本段不满 10 胜时不该出首领').toBe(false)
    // 实验组:在线已赢 9 场
    expect(run(9), '整趟已够门槛,挂机这段就该遇首领').toBe(true)
  })
})

describe('离线历练 · 战后语义与在线同源(图鉴/区域统计/镇压)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seedOfflineTrip(): void {
    const game = useGameStore()
    const player = usePlayerStore()
    const adventure = useAdventureStore()
    const now = Date.now()
    game.markStarted()
    game.lastActiveAt = now - 60 * 3600 * 1000
    player.major = 10
    adventure.session = {
      regionId: 'qingyun',
      mode: 'normal',
      startedAt: now - 60 * 3600 * 1000,
      endsAt: now + 999 * 3600 * 1000,
      nextBattleAt: 0,
      wins: 0,
      losses: 0,
      events: 0,
      stoneGain: gnZero(),
      expGain: gnZero(),
      itemGain: 0
    }
  }

  it('离线普通战写入区域统计与兴衰胜场,N 场一次入账与逐场 EMA 等价', () => {
    const player = usePlayerStore()
    const lore = useLoreStore()
    seedOfflineTrip()

    expect(settleOffline(Date.now()), '这一档应当结算出离线收益').not.toBeNull()

    const summary = useAdventureStore().session
    expect(summary, '60 小时该赢下不少场').not.toBeNull()
    // 首领胜也进区域账,故为 ≥
    const stats = player.regionStats.qingyun
    expect(stats, '离线胜场必须写入 regionStats').toBeDefined()
    expect(stats!.totalFights, '离线打了多少胜场,账面就得有多少场').toBeGreaterThan(0)
    expect(stats!.totalFights, '离线打赢的场次不该少于会话胜场').toBeGreaterThanOrEqual(summary!.wins)
    expect(player.regionWins.qingyun, '离线胜场必须写入区域兴衰').toBe(stats!.totalFights)
    const seen = Object.values(lore.enemySeen).reduce((n, v) => n + v, 0)
    expect(seen, '离线交手必须推进敌人图鉴').toBeGreaterThan(0)
  })

  /**
   * 镇压回执两处(普通战 / 首领战)与在线同走 suppressRateLine(灵石/时 × 物产 × 兴衰)。
   * 故障注入:把任一处改成「此地将自动产出资源」,本用例红。
   */
  it('离线镇压达成的回执报产出账,与在线 suppressRateLine 同源', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    expect(offline, '两处回执都该调唯一那份产出行').toContain('suppressRateLine(region.id, regionRecallFor(region.id).prosperity)')
    expect(offline.match(/suppressRateLine\(region\.id/g)?.length, '普通战与首领战两处都要报').toBe(2)
    expect(offline, '空话口径不许再出现').not.toContain('此地将自动产出资源')
  })

  it('批量净胜的 EMA 与逐场调用一致(单源口径)', () => {
    const player = usePlayerStore()
    player.updateRegionStats('luoxia', true, 9, 0.5)
    const once = { ...player.regionStats.luoxia! }

    setActivePinia(createPinia())
    const fresh = usePlayerStore()
    fresh.updateRegionStats('luoxia', true, 9, 0.5)
    fresh.applyRegionWinBatch('luoxia', 3, 2, 0.01)
    let expectedRounds = once.avgRounds
    let expectedDamage = once.avgDamageTakenPct
    for (let i = 0; i < 3; i += 1) {
      expectedRounds = expectedRounds * 0.7 + 2 * 0.3
      expectedDamage = expectedDamage * 0.7 + 0.01 * 0.3
    }
    expect(fresh.regionStats.luoxia!.avgRounds).toBeCloseTo(expectedRounds, 10)
    expect(fresh.regionStats.luoxia!.avgDamageTakenPct).toBeCloseTo(expectedDamage, 10)
    expect(fresh.regionStats.luoxia!.totalFights, '一次批量与逐场计数等价').toBe(4)
    expect(fresh.regionWins.luoxia, '批量也要记兴衰胜场').toBe(3)
  })

  /**
   * 地界战绩只数胜场:在线 `updateRegionStats` 在 `if (result.win)` 内,一败即 `stopExploration`。
   * 离线计入败场则 7 胜 13 负也能凑满镇压的「20 胜」。
   * 故障注入:把离线批量改成传入 `battles - wins`,本用例红。
   */
  it('离线批量只按胜场入账,不把败场掺进地界战绩', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    expect(offline, '离线区域账按胜场批量入账').toMatch(/applyRegionWinBatch\(\s*region\.id,\s*wins,/)
    expect(offline, '不许把败场数塞进地界战绩').not.toMatch(
      /applyRegion\w*\([^)]*\bbattles\s*-\s*wins/
    )

    const player = usePlayerStore()
    // 胜 7 负 13:只记 7 胜,不够镇压门槛
    player.applyRegionWinBatch('luoxia', 7, 2, 0.01)
    const stats = player.regionStats.luoxia!
    expect(stats.totalFights, '批量写的是胜场数,不是打过的总场次').toBe(7)
    expect(stats.consecutiveWins, '净胜批次里连胜照常累加').toBe(7)
    expect(player.regionWins.luoxia, '兴衰胜场与区域战绩同一把尺').toBe(7)
  })

  /** 在线每败一场 losses +1;提前收手时「胜+负 ≥3 才算走过一趟」的判据读它 */
  it('离线把败场写进会话 losses,与在线同一本账', () => {
    const adventure = useAdventureStore()
    seedOfflineTrip()
    const summary = settleOffline(Date.now())!

    expect(summary.battles, '这一档该打上不少场').toBeGreaterThan(0)
    expect(summary.wins, '不该一场没赢').toBeGreaterThan(0)
    const session = adventure.session!
    // 会话与归来卷轴同口径:普通战 + 至多一场首领战
    expect(session.wins, '会话胜场与归来卷轴同源').toBe(summary.wins)
    expect(session.losses, '离线败场必须写进会话').toBe(summary.battles - summary.wins)
    expect(session.wins + session.losses, '胜+负 = 这趟真打过的场次').toBe(summary.battles)
  })

  /** 在线 `runBattle` 不论首领胜败都先 `track('battles')` 再按结果记账 */
  it('离线首领战计入归来卷轴与进度计数,与在线同一本账', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    // 首领分支须同时推进计数与两本账
    expect(offline, '首领战要计入战斗总场次').toMatch(/track\('battles'\)\s*\n\s*battles \+= 1/)
    expect(offline, '首领胜也要计入胜场').toMatch(/track\('bossKills'\)\s*\n\s*wins \+= 1/)
    expect(offline, '首领败也要计入会话败场').toMatch(/sessionLosses \+= 1/)
  })
})
