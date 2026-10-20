/**
 * 离线历练与在线历练的「规则同源」红线
 *
 * 历史偏差一:在线 runBattle 把本世逆旅契(lifeTrialRules)并进每场历练战斗,
 * 离线 settleOffline 的普通战与首领战却只传 currentDaoRules —— 四张契
 * (孤行/疾行/残躯/逆锋)的加难在本世最大的时段(离线挂机)里完全不生效,
 * 同一本世、同一地界,离线胜率与在线系统性分叉。危险因子当年就是这么漏的
 * (见 battleFactor.spec),照 HYP-015 的同一条判据抽成 explorationRules,
 * 在线/离线共用一份实现,禁止离线再内联 currentDaoRules。
 *
 * 历史偏差二:离线事件自动结算用硬编码 5 个 general 事件池,不读本世路线节点 ——
 * 敌群已走 placeContent(「敌群取自本世路线节点」),事件也必须走同一条路,
 * 经 regionEventPoolFor 尊重本世 eventTags / minRealm / once。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { gnZero } from '@/utils/gnum'
import { explorationRules } from './exploration'
import { settleOffline } from './offline'
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
    // 逆旅契规则在此实现,在线调用点不另起炉灶
    expect(exploration).toContain('lifeTrialRules()')
    // 离线普通战与首领战都走共用函数
    expect(offline).toContain('explorationRules')
    // 前车之鉴:离线只带 currentDaoRules 就会漏契 —— 此调法再不得出现在离线结算
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
    // 词条不能只对在线 afterWin 生效 —— 离线普通战公式必须读到它(首领战走 afterWin 天然生效)
    expect(offline).toContain("modOf(mods, 'doubleDropRate')")
    // 期望值乘子(doubleMult)要真的乘进了四处产出公式(stones/exp/materials/equip)
    expect(offline).toContain('* doubleMult')
    // 丹药与在线同源:福缘翻倍不作用于丹药(在线掷在 doubled 循环之外),离线也不该乘 doubleMult
    const pillLine = offline.split('\n').find(l => l.includes('PILL_DROP_CHANCE * modeDef'))
    expect(pillLine, '离线普通战应有丹药掉落行').toBeTruthy()
    expect(pillLine, '丹药概率不应乘福缘翻倍').not.toContain('doubleMult')
  })
})

describe('离线历练 · 溢出装备折尘与在线化尘口径同源(单一事实源)', () => {
  it('溢出件数折尘走 avgDustPerDrop(tier),不再写死固定 4 尘', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    // 溢出件数折尘 = 溢出数 × 同层平均分解尘(economySim 采样口径,与在线 salvageOf 同族)
    expect(offline).toContain('overflowDust = Math.round((equipCount - realCount) * avgDustPerDrop(region.tier))')
    // 不再存在写死的「×4」化尘:退回固定 4 即红
    expect(offline).not.toMatch(/realCount\) \* 4/)
  })
})

describe('离线历练 · 事件池与在线同源(本世路线)', () => {
  it('离线事件走 placeContent 的 regionEventPoolFor,不再只剩硬编码通用池', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    expect(offline).toContain('regionEventPoolFor')
    expect(offline).toContain('placeContent(region.id).eventTags')
    // 但世界事件不能无条件自动结算:身份/永久构筑类(pet/gongfa/artifact/lifespan)
    // 会被 isOfflineSafeEvent 拦下 —— 它在离线作用域红线段言(offlineScope)里被真实验证
    expect(offline).toContain('isOfflineSafeEvent')
    expect(offline).toContain('OFFLINE_SAFE_EFFECTS')
  })
})

describe('离线历练 · 区域事件加丰与加难成对(regReward)', () => {
  it('离线普通战与首领战的奖励都并上 regionEventReward,不再只有危险', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    // 与 danger 同源:妖潮/古墓/商队在加难的同时也加丰(奖励倍率进石头/修为/掉落数)
    expect(offline).toContain('regionEventReward')
    expect(offline).toMatch(
      /afterWin\(region, modeDef\.rewardMult \* OFFLINE_BOSS_REWARD_MULT \* regionEventReward, true\)/
    )
    expect(offline).toContain('modeDef.rewardMult * regionEventReward')
    // 装备掉落与灵石/修为同源:模式倍率也要进掉落数。
    // 在线 afterWin 把 mode×regReward 全折进 rewardMult 参数,离线普通战若只并 regReward,
    // 「进取/疾驰」这类高收益模式对离线装备掉落就落空(曾经正是如此)
    expect(offline).toContain('EQUIP_DROP_CHANCE * modeDef.rewardMult * regionEventReward')
    // 残页与在线同源:在线 page 掉落判定是 rng.chance(PAGE_DROP_CHANCE * rewardMult),
    // rewardMult 参数含 mode×reg —— 残页现由 offlineMaterialGain 单源折算,仍吃 PAGE_DROP_CHANCE×1.5×倍率
    expect(offline).toContain('PAGE_DROP_CHANCE * 1.5 * rewardMult')
  })
})

describe('离线历练 · 首领判定与在线同源(本世路线)', () => {
  it('离线首领「是否已清」按本世路线 regionBossCleared 判,不再按旧 REGIONS cleared 链', () => {
    const offline = readFileSync(src('./offline.ts'), 'utf8')
    // 与在线 exploration.regionBossCleared 同一条判据:本世路线下旧 cleared 链会留空,
    // 若离线按它判,已清的 boss 会被离线再砍一遍、还顺手解锁下一区(与在线判定分叉)
    expect(offline).toContain('regionBossCleared(region.id)')
    // 显式钉死「不再用裸 adventure.cleared 判定」—— 有人改回旧链即红
    expect(offline).not.toMatch(/!adventure\.cleared\.includes\(region\.id\)/)
  })
})

describe('离线历练 · 战后语义与在线同源(图鉴/区域统计/镇压)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /** 一份 60 小时在途历练:挂机整段按期望结算,战后语义也该整段落账 */
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

    const summary = settleOffline(Date.now())
    expect(summary, '这一档应当结算出离线收益').not.toBeNull()
    expect(summary!.battles, '60 小时该打上不少场').toBeGreaterThan(0)
    const stats = player.regionStats.qingyun
    expect(stats, '离线战绩必须写入 regionStats').toBeDefined()
    // 在线每一场(含败场)都进 totalFights,镇压的「20 战」门槛读的正是它;
    // 离线从前只写胜场,于是同样的战况挂机永远差着门槛、连胜还会被虚记。
    expect(stats!.totalFights, '离线打过的每一场都要进 totalFights').toBeGreaterThanOrEqual(
      summary!.battles
    )
    expect(stats!.totalFights, "败场不许被顺手抹掉").toBeGreaterThan(summary!.wins)
    // 兴衰只认净胜:胜场数(普通胜 + 至多一场首领胜),不是总场次
    expect(player.regionWins.qingyun, '兴衰胜场只记净胜').toBeLessThan(stats!.totalFights)
    expect(player.regionWins.qingyun, '兴衰胜场不该少于普通战胜场').toBeGreaterThanOrEqual(
      summary!.wins
    )
    const seen = Object.values(lore.enemySeen).reduce((n, v) => n + v, 0)
    expect(seen, '离线交手必须推进敌人图鉴').toBeGreaterThan(0)
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
   * 在线是「每一场都进 updateRegionStats」—— 胜场与败场都算进 `totalFights`,
   * 而镇压门槛「至少 20 战」读的正是它。离线从前只写胜场:
   * 同样的战况,守着屏幕打能拿镇压资格,挂机回来却永远差着;
   * 连败还会被虚记成连胜(那一栏只加不减)。
   */
  describe('批量净胜/净负 · 与在线逐场等价', () => {
    it('胜负都进 totalFights(镇压门槛读的是总场次)', () => {
      const player = usePlayerStore()
      player.applyRegionBatch('luoxia', 7, 3, 2, 0.01)

      const stats = player.regionStats.luoxia!
      expect(stats.totalFights, '10 场就是 10 场,不能只数赢的那 7 场').toBe(10)
      expect(player.regionWins.luoxia, '兴衰只认净胜').toBe(7)
    })

    it('整段里有败场时连胜归零 —— 与逐场打完的最终值一致', () => {
      const player = usePlayerStore()
      player.updateRegionStats('luoxia', true, 2, 0.01)
      player.updateRegionStats('luoxia', true, 2, 0.01)
      expect(player.regionStats.luoxia!.consecutiveWins, '先赢两场').toBe(2)

      player.applyRegionBatch('luoxia', 5, 1, 2, 0.01)
      expect(
        player.regionStats.luoxia!.consecutiveWins,
        '这一整段里输过,连胜就不该还挂着'
      ).toBe(0)
    })

    it('全胜时才保留连胜累加(没有败场不该被清零)', () => {
      const player = usePlayerStore()
      player.updateRegionStats('luoxia', true, 2, 0.01)
      player.applyRegionBatch('luoxia', 3, 0, 2, 0.01)
      expect(player.regionStats.luoxia!.consecutiveWins).toBe(4)
    })

    it('EMA 与逐场调用逐字等价(胜+负一起推进衰减)', () => {
      const player = usePlayerStore()
      player.applyRegionBatch('luoxia', 3, 2, 9, 0.5)
      const batch = { ...player.regionStats.luoxia! }

      setActivePinia(createPinia())
      const perFight = usePlayerStore()
      // 与批量的顺序无关:EMA 只取决于次数与取值
      for (let i = 0; i < 5; i += 1) perFight.updateRegionStats('luoxia', true, 9, 0.5)

      expect(batch.totalFights).toBe(perFight.regionStats.luoxia!.totalFights)
      expect(batch.avgRounds).toBeCloseTo(perFight.regionStats.luoxia!.avgRounds, 10)
      expect(batch.avgDamageTakenPct).toBeCloseTo(
        perFight.regionStats.luoxia!.avgDamageTakenPct,
        10
      )
    })

    it('非正场次不写入(空批次不会凭空造出一条战绩)', () => {
      const player = usePlayerStore()
      player.applyRegionBatch('luoxia', 0, 0, 2, 0.01)
      expect(player.regionStats.luoxia).toBeUndefined()
      expect(player.regionWins.luoxia).toBeUndefined()
    })
  })

  /**
   * 会话账里的 losses 不是摆设:在线每败一场就 +1,提前收手时
   * 「胜+负 ≥3 才算走过一趟」的判据也读它。离线从前只加 wins,
   * 挂一夜回来这趟仍像「只赢没输」,3 战门槛也永远差着。
   */
  it('离线把败场写进会话 losses,与在线同一本账', () => {
    const adventure = useAdventureStore()
    seedOfflineTrip()
    const summary = settleOffline(Date.now())!

    expect(summary.battles, '这一档该打上不少场').toBeGreaterThan(0)
    expect(summary.wins, '不该一场没赢').toBeGreaterThan(0)
    const session = adventure.session!
    // 首领战胜时在线也会把这一场记进会话,故 wins 是「普通战胜场 + 至多 1」
    const bossWin = session.wins - summary.wins
    expect(bossWin, '会话胜场 = 离线普通战胜场(加至多一场首领胜)').toBeGreaterThanOrEqual(0)
    expect(bossWin).toBeLessThanOrEqual(1)
    expect(session.losses, '离线败场必须写进会话').toBe(summary.battles - summary.wins)
    expect(session.wins + session.losses, '胜+负 = 这趟真打过的场次').toBe(summary.battles + bossWin)
  })
})
