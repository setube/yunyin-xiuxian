/**
 * 历练 —— 战斗与中断路径
 * 含灵兽性格「败北保护」:lossReduction 须接入 runBattle,败北时低概率护住(不重伤、不计败绩、历练继续)。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore, type LastBattleView } from '@/stores/adventure'
import { useCultivationStore } from '@/stores/cultivation'
import { useLoreStore } from '@/stores/lore'
import { gnZero, sub, toNum } from '@/utils/gnum'
import { useResourcesStore } from '@/stores/resources'
import { EXPLORE_BOSS_AFTER_WINS, EVENT_AUTO_RESOLVE_SECONDS } from '@/data/constants'
import { enemyDef } from '@/data/enemies'
import { enemyTraits, TRAIT_NAMES } from './buildAdvisor'
import { noteEnemy } from './loreService'
import CombatPanel from '@/components/adventure/CombatPanel.vue'
import {
  tickExploration,
  startExploration,
  stopExploration,
  winsUntilRegionBoss,
  regionBossCleared,
  exploreEventChance
} from './exploration'
import { useUiStore } from '@/stores/ui'
import { useEndgameStore } from '@/stores/endgame'
import { startRetreat } from './earlyGameService'
import { endgameBusy } from './endgameActivity'

/**
 * 须与 petPersonality.EFFECTS 的 cautious 值一致(见 petPersonality.spec)。
 * 假 rng 按此值识别败北保护那一掷,不依赖调用顺序;其余 chance 一律为否。
 */
const CAUTIOUS_LOSS_REDUCTION = 0.04

const { protect, combatWin, combatHpPct, forceBuild } = vi.hoisted(() => ({
  protect: { value: false },
  combatWin: { value: false },
  // 默认身死(playerHpPct=0);遁走用例显式置值
  combatHpPct: { value: 0 },
  forceBuild: { value: false }
}))

vi.mock('@/utils/random', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/random')>()
  return {
    ...mod,
    rng: {
      next: () => 0.5,
      int: (_a: number, b: number) => b,
      float: (a: number, _b: number) => a,
      pick: <T,>(arr: readonly T[]): T => arr[0]!,
      weighted: <T,>(arr: readonly T[]): T => arr[0]!,
      chance: (p: number): boolean =>
        protect.value === true && Math.abs(p - CAUTIOUS_LOSS_REDUCTION) < 1e-9
    }
  }
})

// resolveCombat 胜负可控(默认败),makeEnemySnap 为占位敌
vi.mock('./combat', async importOriginal => {
  const mod = await importOriginal<typeof import('./combat')>()
  return {
    ...mod,
    resolveCombat: () =>
      combatWin.value
        ? { win: true, rounds: 5, playerHpPct: 0.9 }
        : { win: false, rounds: 5, playerHpPct: combatHpPct.value },
    // 伪造件须按 CombatantSnap 真形状给齐 attack/defense/maxHp(敌战力从这三维折出)
    makeEnemySnap: () => ({ attack: { m: 100, e: 0 }, defense: { m: 10, e: 0 }, maxHp: { m: 100, e: 0 } })
  }
})

// 半卡星级要有流派才出;forceBuild 只在渲染时打开,战斗结算仍走真识别
vi.mock('./buildDetect', async importOriginal => {
  const mod = await importOriginal<typeof import('./buildDetect')>()
  return {
    ...mod,
    detectBuild: (mods: Parameters<typeof mod.detectBuild>[0]) =>
      forceBuild.value
        ? { style: mod.BUILD_STYLES[0]!, affinity: 1, stageName: '', coreValues: [], displayName: '' }
        : mod.detectBuild(mods)
  }
})

function forgeSession(now: number, regionId = 'qingyun'): void {
  useAdventureStore().setSession({
    regionId,
    mode: 'normal',
    startedAt: now - 5000,
    endsAt: now + 60000,
    nextBattleAt: now - 1,
    wins: 0,
    losses: 0,
    events: 0,
    stoneGain: gnZero(),
    expGain: gnZero(),
    itemGain: 0
  })
}

/** 会话还在时同刻再打一场 */
function fightAgain(now: number): void {
  const adventure = useAdventureStore()
  adventure.setSession({ ...adventure.session!, nextBattleAt: now - 1 })
  tickExploration(now)
}

describe('灵兽性格 · 败北保护(lossReduction 接入 runBattle)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    protect.value = false
    combatWin.value = false
  })

  it('谨慎灵兽败北时护住:不加重伤、不计败绩、历练继续', () => {
    const player = usePlayerStore()
    player.initCharacter('护主', { roots: [] } as never)
    player.setPet('pet_yueying') // cautious → lossReduction 0.04
    const now = Date.now()
    forgeSession(now)

    protect.value = true // 放行败北保护那一掷

    tickExploration(now)

    const cultivation = useCultivationStore()
    const adventure = useAdventureStore()
    expect(cultivation.buffs.some(b => b.defId === 'injury')).toBe(false)
    expect(adventure.session).not.toBeNull()
    expect(adventure.session?.losses).toBe(0)
  })

  it('无灵兽败北照常:受重伤、计败绩、中止历练', () => {
    const player = usePlayerStore()
    player.initCharacter('无护', { roots: [] } as never)
    const now = Date.now()
    forgeSession(now)

    tickExploration(now)

    const cultivation = useCultivationStore()
    const adventure = useAdventureStore()
    expect(cultivation.buffs.some(b => b.defId === 'injury')).toBe(true)
    expect(adventure.session).toBeNull() // stopExploration('defeat') 已清空
    expect(adventure.lastBattle?.result.win).toBe(false)
  })

  it('好战灵兽(lossReduction=0)败北不护:与无灵兽一致', () => {
    const player = usePlayerStore()
    player.initCharacter('莽打', { roots: [] } as never)
    player.setPet('pet_huoque') // fierce → lossReduction 0
    const now = Date.now()
    forgeSession(now)

    protect.value = true // 放行掷点,概率 0 仍不护

    tickExploration(now)

    const cultivation = useCultivationStore()
    const adventure = useAdventureStore()
    expect(cultivation.buffs.some(b => b.defId === 'injury')).toBe(true)
    expect(adventure.session).toBeNull()
  })
})

describe('连胜(接线 · runBattle 胜负驱动 player.winStreak)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    protect.value = false
    combatWin.value = false
  })

  it('战场得胜让连胜 +1', () => {
    const player = usePlayerStore()
    player.initCharacter('连胜测试', { roots: [] } as never)
    const now = Date.now()
    forgeSession(now)

    combatWin.value = true
    tickExploration(now)

    expect(player.winStreak).toBe(1)
  })

  it('真正的败北重置连胜(3→0);灵兽护住的那次不重置', () => {
    const player = usePlayerStore()
    player.initCharacter('连胜测试', { roots: [] } as never)
    player.setPet('pet_yueying') // cautious → lossReduction 0.04
    player.winStreak = 3
    const now = Date.now()
    forgeSession(now)

    protect.value = true // 被护住不算败,连胜保留
    tickExploration(now)
    expect(player.winStreak).toBe(3)
    expect(useAdventureStore().session).not.toBeNull()

    // 真正的败北:连胜清空
    player.setPet('pet_huoque') // fierce → lossReduction 0
    protect.value = false
    player.winStreak = 5
    forgeSession(now)
    tickExploration(now)
    expect(player.winStreak).toBe(0)
  })
})

describe('收尾总结 · 战绩报胜负两本账', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    protect.value = false
    combatWin.value = false
    combatHpPct.value = 0
  })

  function sessionWith(wins: number, losses: number): void {
    const now = Date.now()
    useAdventureStore().setSession({
      regionId: 'qingyun',
      mode: 'normal',
      startedAt: now - 5000,
      endsAt: now + 60000,
      nextBattleAt: now,
      wins,
      losses,
      events: 1,
      stoneGain: gnZero(),
      expGain: gnZero(),
      itemGain: 0
    })
  }

  function lastToast(): string {
    const toasts = useUiStore().toasts
    return toasts[toasts.length - 1]?.text ?? ''
  }

  it('圆满结束:报「胜 N 场 · 负 M 场」,不再省略败场', () => {
    sessionWith(9, 4)
    stopExploration('complete')
    expect(lastToast()).toContain('胜 9 场 · 负 4 场')
    expect(lastToast()).toContain('际遇 1 次')
  })

  it('被打断归来:同样带上战绩与所得,让玩家知道这趟赚没赚', () => {
    sessionWith(1, 2)
    stopExploration('defeat')
    expect(lastToast()).toContain('胜 1 场 · 负 2 场')
    expect(lastToast()).toContain('灵石 +')
  })

  it('全胜时只说胜场(没有败场就不摆一行「负 0 场」)', () => {
    sessionWith(5, 0)
    stopExploration('manual')
    expect(lastToast()).toContain('胜 5 场')
    expect(lastToast()).not.toContain('负 0 场')
  })
})

/** 回归:遁走(playerHpPct>0)只是无功而返,不重伤、不计宿敌,连胜照清;身死照常惩罚 */
describe('回合耗尽·遁走 ≠ 身死·败北(处置分开)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    protect.value = false
    combatWin.value = false
    combatHpPct.value = 0.4
  })

  it('遁走(满血无功而返):不加重伤、不计宿敌败绩、连胜照清、中止历练', () => {
    combatHpPct.value = 0.4 // 遁走,未死
    const player = usePlayerStore()
    player.initCharacter('拖佬', { roots: [] } as never)
    player.winStreak = 3
    const now = Date.now()
    forgeSession(now)

    tickExploration(now)

    const cultivation = useCultivationStore()
    const adventure = useAdventureStore()
    expect(cultivation.buffs.some(b => b.defId === 'injury'), '遁走不该受重伤').toBe(false)
    expect(player.nemeses, '遁走不是败北,不该记宿敌').toHaveLength(0)
    expect(player.winStreak, '非胜则连胜照清').toBe(0)
    expect(adventure.session, '无功而返也应中止历练').toBeNull()
  })

  it('身死(气血耗尽):照常重伤、计宿敌败绩、中止历练', () => {
    combatHpPct.value = 0 // 气血耗尽
    const player = usePlayerStore()
    player.initCharacter('阵亡', { roots: [] } as never)
    const now = Date.now()
    forgeSession(now)

    tickExploration(now)

    const cultivation = useCultivationStore()
    const adventure = useAdventureStore()
    expect(cultivation.buffs.some(b => b.defId === 'injury')).toBe(true)
    expect(player.nemeses, '身死是败北,该计一次宿敌').toHaveLength(1)
    expect(adventure.session).toBeNull()
  })
})

/** 镇压资格只在首次达成时自动接管 */
describe('镇压资格首次自动、此后自由', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    protect.value = false
    combatWin.value = true
  })

  it('首次达成条件 → 自动转收益并记下资格;停取后再胜,不再自动接管', () => {
    const player = usePlayerStore()
    player.initCharacter('镇守', { roots: [] } as never)
    // 已达镇压条件的一地
    const stats = { totalFights: 30, avgRounds: 2, avgDamageTakenPct: 0.03, consecutiveWins: 30, lastUpdateAt: Date.now() }
    player.regionStats.qingyun = { ...stats }

    const now = Date.now()
    forgeSession(now)
    tickExploration(now)
    expect(player.suppressedRegions, '首次达成应自动转收益').toContain('qingyun')
    expect(player.suppressQualified).toContain('qingyun')

    // 停取收益后再胜
    player.unsuppressRegion('qingyun')
    player.regionStats.qingyun = { ...stats }
    const now2 = Date.now() + 60_000
    forgeSession(now2)
    tickExploration(now2)
    expect(player.suppressedRegions, '已取得资格后不该再被自动接管').not.toContain('qingyun')
    expect(player.suppressQualified).toContain('qingyun')
  })
})

describe('闭关禁令:闭关期间不得进入历练(Phase 28 接线后)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    protect.value = false
    combatWin.value = false
  })

  it('startExploration 在闭关中被拒,不产生会话(拒绝原因显式而非静默)', () => {
    const player = usePlayerStore()
    player.initCharacter('闭关测试', { roots: [] } as never)
    startRetreat()
    expect(startExploration('qingyun', 'normal')).toBe(false)
    expect(useAdventureStore().session).toBeNull()
    expect(useCultivationStore().hasBuff('retreat')).toBe(true)
  })
})

/** 在途互斥的反方向:远征途中不许开历练,否则历练心跳与远征 runSnap 同时推进 */
describe('在途互斥 · 远征途中不得再开一程历练', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    protect.value = false
    combatWin.value = false
  })

  it('远征在途:起程被拒、不落会话,并指名统一判据的拒因', () => {
    const endgame = useEndgameStore()
    const adventure = useAdventureStore()
    endgame.worldRun = {
      worldId: 'chiyan',
      pactId: null,
      gateId: null,
      layer: 1,
      bonus: 0,
      rows: [],
      carriedHpPct: 1,
      totalRounds: 0,
      winStacks: 0
    }
    expect(startExploration('qingyun', 'normal'), '远征途中不该还能开历练').toBe(false)
    expect(adventure.session, '被拒就不该落会话').toBeNull()
    // 拒因取 endgameBusy 单源
    expect(useUiStore().toasts.at(-1)?.text).toContain(endgameBusy(endgame.worldRun, null, null)!.reason)
  })

  it('清空在途后同一入口放行(守卫只认在途,不是把人永久锁死)', () => {
    const endgame = useEndgameStore()
    endgame.worldRun = null
    expect(startExploration('qingyun', 'normal')).toBe(true)
    expect(useAdventureStore().session).not.toBeNull()
  })
})

/** 会话账目与战报:与 afterWin 的真实入账同源;itemGain 数实物件数,不数文案行 */
describe('会话账目 · 与真实入账同源', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    protect.value = false
    combatWin.value = true
  })

  it('得胜后会话累计的灵石/修为,等于行囊与修为的真实增量', () => {
    const adventure = useAdventureStore()
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.initCharacter('记账', { roots: [] } as never)

    const now = Date.now()
    forgeSession(now)
    // 首战含首胜成就等一次性奖励,对账取第二战增量
    tickExploration(now)
    const s1 = adventure.session!
    const stoneBefore = { ...resources.spiritStone }
    const expBefore = { ...player.exp }
    adventure.setSession({ ...s1, nextBattleAt: now - 1 })
    tickExploration(now)

    const s = adventure.session!
    expect(s.wins).toBe(2)
    expect(toNum(sub(s.stoneGain, s1.stoneGain)), '会话灵石账应等于行囊增量').toBeCloseTo(
      toNum(sub(resources.spiritStone, stoneBefore)),
      6
    )
    expect(toNum(sub(s.expGain, s1.expGain)), '会话修为账应等于修为增量').toBeCloseTo(
      toNum(sub(player.exp, expBefore)),
      6
    )
    expect(toNum(s.stoneGain), '战斗确有产出,别把账记成 0').toBeGreaterThan(0)
    expect(toNum(s.expGain)).toBeGreaterThan(0)
  })

  it('战报带上本战掉落明细(原文案不再算作拾获件数)', () => {
    const adventure = useAdventureStore()
    const player = usePlayerStore()
    player.initCharacter('战报', { roots: [] } as never)

    const now = Date.now()
    forgeSession(now)
    tickExploration(now)

    // 假 rng 概率判定恒否:无实物掉落,明细栏须存在且为空表
    expect(Array.isArray(adventure.lastBattle?.loot)).toBe(true)
    expect(adventure.session!.itemGain, '无实物掉落时件数为 0(旧实现会把提示行算成一件)').toBe(0)
  })

  it('战报把开打那一刻的双方战力一起带走:敌力与「我」同刻冻结,不为战后换装所动', () => {
    const adventure = useAdventureStore()
    const player = usePlayerStore()
    player.initCharacter('同刻', { roots: [] } as never)
    const now = Date.now()
    forgeSession(now)
    tickExploration(now)
    const view = adventure.lastBattle
    expect(view).not.toBeNull()
    expect(view!.enemyPower).toBeDefined()
    expect(view!.playerPower).toBeDefined()
    // 无规则时「我」= 面板战力
    expect(toNum(view!.playerPower!)).toBeCloseTo(toNum(player.finalStats.power), 6)
  })
})

describe('首领门槛 · 界面提示与战斗判定同源', () => {
  it('未靖地界:差多少胜一目了然,满门槛即为 0', () => {
    expect(winsUntilRegionBoss(0, false)).toBe(EXPLORE_BOSS_AFTER_WINS)
    expect(winsUntilRegionBoss(3, false)).toBe(EXPLORE_BOSS_AFTER_WINS - 3)
    expect(winsUntilRegionBoss(EXPLORE_BOSS_AFTER_WINS, false)).toBe(0)
    expect(winsUntilRegionBoss(EXPLORE_BOSS_AFTER_WINS + 5, false), '门槛之上不出现负数').toBe(0)
  })

  it('已靖地界:不再有首领,提示返回 null', () => {
    expect(winsUntilRegionBoss(0, true)).toBeNull()
  })

  it('界面提示按本世路线判首领已靖(路线内的区域优先看本世节点,不看旧 REGIONS 链)', () => {
    const adventure = useAdventureStore()
    const regionId = 'qingyun'
    // 本世节点已通、旧 REGIONS cleared 链为空:应判首领已靖
    adventure.$patch({
      mortalWorld: {
        seed: 1, shapeId: 's', shapeName: 's', rhythmId: 'r', rhythmName: 'r', ruleId: 'r',
        chain: [{ nodeId: 'n1_qingyun', fromId: regionId, name: '落霞谷', tier: 1, enemies: [], boss: 'b', archetype: 'a', eventTags: [] }]
      } as never,
      mortalCleared: ['n1_qingyun'],
      cleared: [] // 旧链未清
    })
    expect(adventure.cleared.includes(regionId), '构型前提:旧链没清').toBe(false)
    expect(regionBossCleared(regionId), '本世节点已通,界面该报首领已靖,不再差胜').toBe(true)
  })

  it('无本世路线节点(老档兼容):按旧 REGIONS cleared 链判', () => {
    const adventure = useAdventureStore()
    adventure.$patch({ mortalWorld: null, cleared: ['qingyun'] })
    expect(regionBossCleared('qingyun')).toBe(true)
    adventure.$patch({ cleared: [] })
    expect(regionBossCleared('qingyun')).toBe(false)
  })
})

/**
 * 待决事件超时(> EVENT_AUTO_RESOLVE_SECONDS)自动结算,手动模式;勿扰模式见 explorationDnd.spec。
 * tick 显式传 now,不需假时钟。
 */
describe('历练 · 待决事件超时自动结算', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    protect.value = false
    combatWin.value = false
  })

  it('未超时(now − since ≤ 120s):仍挂着待决,不自动了结、事件数不动', () => {
    const now = Date.now()
    forgeSession(now)
    const adv = useAdventureStore()
    adv.setPendingEvent('ft_sword_remnant', now - 119_000) // 差 1 秒不到 120s
    tickExploration(now)
    expect(adv.pendingEventId, '未超时不该自己了结').toBe('ft_sword_remnant')
    expect(adv.session!.events).toBe(0)
  })

  it('已超时(> 120s):按默认选项自动结清 —— 清待决、事件 +1、重排下一战', () => {
    const now = Date.now()
    forgeSession(now)
    const adv = useAdventureStore()
    const beforeBattle = adv.session!.nextBattleAt
    adv.setPendingEvent('ft_sword_remnant', now - 121_000) // 超过 120s 一秒
    tickExploration(now)
    expect(adv.pendingEventId, '超时该自动了结').toBeNull()
    expect(adv.pendingEventSince).toBe(0)
    const s = adv.session!
    expect(s.events).toBe(1)
    expect(s.nextBattleAt).toBeGreaterThan(beforeBattle)
  })

  it('结清后再 tick:不重复结算(事件数不再 +1)', () => {
    const now = Date.now()
    forgeSession(now)
    const adv = useAdventureStore()
    adv.setPendingEvent('ft_sword_remnant', now - EVENT_AUTO_RESOLVE_SECONDS * 1000 - 1000)
    tickExploration(now)
    expect(adv.session!.events).toBe(1)
    tickExploration(now)
    expect(adv.pendingEventId).toBeNull()
    expect(adv.session!.events, '不该重复结算成 2').toBe(1)
  })
})

describe('区域事件 eventMult 真算进际遇率', () => {
  it('古墓 eventMult=1.5 真抬高际遇率,不只写在 desc', () => {
    const player = usePlayerStore()
    const base = exploreEventChance('qingyun', {})
    player.regionEvent = { regionId: 'qingyun', eventId: 'gumu', endsAt: Date.now() + 60_000 }
    try {
      expect(exploreEventChance('qingyun', {})).toBeCloseTo(base * 1.5, 6)
    } finally {
      player.regionEvent = null
    }
  })
})

/**
 * 第一次照面不露特性与星级:战报带开打那一刻的认知快照。
 * runBattle 同步入账认知、界面随后才渲染,读当前认知时首战已「眼熟」。
 */
describe('开打认知快照 · 第一次照面算未识', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    protect.value = false
    combatWin.value = true
    combatHpPct.value = 0
  })

  it('普通敌首战得胜:快照未识(本战已入账也不算);同一敌第二场才眼熟', () => {
    usePlayerStore().initCharacter('初见', { roots: [] } as never)
    const adventure = useAdventureStore()
    const now = Date.now()
    forgeSession(now)
    tickExploration(now)

    const first = adventure.lastBattle!
    expect(first.isBoss, '构型前提:普通敌').toBe(false)
    expect(useLoreStore().enemyLoreOf(first.enemyId!), '构型前提:本战已入账,当前认知已是眼熟').toBe(1)
    expect(first.foeKnown, '第一次照面该算未识').toBe(false)

    fightAgain(now)
    expect(adventure.lastBattle!.enemyId, '构型前提:同一敌').toBe(first.enemyId)
    expect(adventure.lastBattle!.foeKnown, '交过一场手,第二场该眼熟').toBe(true)
  })

  it('首领首战得胜:快照未识', () => {
    usePlayerStore().initCharacter('斩首', { roots: [] } as never)
    const adventure = useAdventureStore()
    const now = Date.now()
    forgeSession(now)
    adventure.setSession({ ...adventure.session!, wins: EXPLORE_BOSS_AFTER_WINS })
    tickExploration(now)

    expect(adventure.lastBattle!.isBoss, '构型前提:这一战是首领').toBe(true)
    expect(adventure.lastBattle!.foeKnown).toBe(false)
  })

  // 首领胜一记还不到倍算门槛,上一例分不出快照早晚;败绩记三、本战即到眼熟,这一例才分得出
  it('首领首战败北:本战已记到眼熟,快照仍未识', () => {
    combatWin.value = false
    usePlayerStore().initCharacter('折戟', { roots: [] } as never)
    const adventure = useAdventureStore()
    const now = Date.now()
    forgeSession(now)
    adventure.setSession({ ...adventure.session!, wins: EXPLORE_BOSS_AFTER_WINS })
    tickExploration(now)

    const b = adventure.lastBattle!
    expect(b.isBoss, '构型前提:这一战是首领').toBe(true)
    expect(useLoreStore().enemyLoreOf(b.enemyId!), '构型前提:本战败绩已把首领记到眼熟').toBe(1)
    expect(b.foeKnown).toBe(false)
  })

  it('首战败北:会话收兵、战报留到下趟,快照仍是未识', () => {
    combatWin.value = false
    usePlayerStore().initCharacter('初败', { roots: [] } as never)
    const adventure = useAdventureStore()
    const now = Date.now()
    forgeSession(now)
    tickExploration(now)

    expect(adventure.session, '构型前提:败北收兵').toBeNull()
    const b = adventure.lastBattle!
    expect(useLoreStore().enemyLoreOf(b.enemyId!), '构型前提:败绩已入账').toBeGreaterThanOrEqual(1)
    expect(b.foeKnown).toBe(false)
  })

  it('旧战报缺 foeKnown:修形不报错、字段留空;非布尔不放行', () => {
    const adventure = useAdventureStore()
    const legacy = {
      enemyName: '三尾灵狐',
      enemyIcon: 'paw',
      enemyId: 'e_fox',
      isBoss: false,
      result: { win: true, log: [], rounds: 3, playerHpPct: 1 },
      at: 1
    }
    adventure.lastBattle = legacy
    expect(() => adventure.sanitize()).not.toThrow()
    expect(adventure.lastBattle, '缺一栏不该整份作废').not.toBeNull()
    expect(adventure.lastBattle!.foeKnown).toBeUndefined()

    adventure.lastBattle = { ...legacy, foeKnown: 'yes' } as unknown as LastBattleView
    adventure.sanitize()
    expect(adventure.lastBattle!.foeKnown, '坏值不该当成已眼熟').toBeUndefined()

    adventure.lastBattle = { ...legacy, foeKnown: false }
    adventure.sanitize()
    expect(adventure.lastBattle!.foeKnown).toBe(false)
  })
})

/** 战斗页敌方半卡:服务端渲染真组件(不跑 onMounted 回放),特性与星级跟开打快照走 */
describe('战斗页敌方半卡 · 特性与星级读开打快照', () => {
  /** 假 rng 的 pick 取敌表首位:万妖林首位是三尾灵狐 */
  const REGION = 'wanyao'
  const FOE = 'e_fox'
  const traitNames = enemyTraits(enemyDef(FOE)!).map(t => TRAIT_NAMES[t])
  const STARS = /[★☆]/
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    protect.value = false
    combatWin.value = true
    combatHpPct.value = 0
    forceBuild.value = false
  })

  /** 星级的 title 也写着特性名:特性断言须用不带流派的渲染,否则标签丢了也照样过 */
  async function renderPanel(withBuild = false): Promise<string> {
    const app = createSSRApp(CombatPanel)
    app.use(pinia)
    forceBuild.value = withBuild
    try {
      return await renderToString(app)
    } finally {
      forceBuild.value = false
    }
  }

  it('首战得胜:半卡不出特性与星级;第二场才出', async () => {
    expect(traitNames.length, '构型前提:此敌须带特性').toBeGreaterThan(0)
    usePlayerStore().initCharacter('照面', { roots: [] } as never)
    const now = Date.now()
    forgeSession(now, REGION)
    tickExploration(now)
    expect(useAdventureStore().lastBattle?.enemyId, '构型前提:遇上的就是此敌').toBe(FOE)

    const first = await renderPanel()
    for (const name of traitNames) expect(first, `第一次照面露了「${name}」`).not.toContain(name)
    expect(await renderPanel(true), '第一次照面露了星级').not.toMatch(STARS)

    fightAgain(now)
    const second = await renderPanel()
    for (const name of traitNames) expect(second, `交过手该见「${name}」`).toContain(name)
    expect(await renderPanel(true), '交过手该见星级').toMatch(STARS)
  })

  it('旧战报无快照:按当前认知,未识不出、眼熟才出', async () => {
    usePlayerStore().initCharacter('旧档', { roots: [] } as never)
    useAdventureStore().lastBattle = {
      enemyName: '三尾灵狐',
      enemyIcon: 'paw',
      enemyId: FOE,
      isBoss: false,
      result: { win: true, log: [], rounds: 3, playerHpPct: 1 },
      at: 1
    }
    const unknown = await renderPanel()
    for (const name of traitNames) expect(unknown, `未识就露了「${name}」`).not.toContain(name)
    expect(await renderPanel(true), '未识就露了星级').not.toMatch(STARS)

    noteEnemy(FOE, true)
    const known = await renderPanel()
    for (const name of traitNames) expect(known, `眼熟后该见「${name}」`).toContain(name)
    expect(await renderPanel(true), '眼熟后该见星级').toMatch(STARS)
  })
})
