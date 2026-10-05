/**
 * 历练 —— 战斗与中断路径
 *
 * 聚焦 Phase 31.0 S4 灵兽性格的「败北保护」:
 * 慢稳/谨慎的灵兽带 lossReduction(降低失败率),败北时低概率护住玩家,
 * 免于重伤、不计败绩、历练继续。此前 lossReduction 只在 petPersonality 里
 * 定义了数值,从未接入 runBattle —— 描述即承诺,不生效就是欺骗。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useAdventureStore } from '@/stores/adventure'
import { useCultivationStore } from '@/stores/cultivation'
import { gnZero, sub, toNum } from '@/utils/gnum'
import { useResourcesStore } from '@/stores/resources'
import { EXPLORE_BOSS_AFTER_WINS } from '@/data/constants'
import { tickExploration, startExploration, winsUntilRegionBoss } from './exploration'
import { startRetreat } from './earlyGameService'

/**
 * 与 petPersonality.EFFECTS 里的 cautious 值保持一致(见 petPersonality.spec)。
 * 假 rng 用这个精确值来识别「败北保护那一掷」,测试不依赖调用顺序:
 * 只有 lossReduction 这一掷会被放行,其余 chance 一律为否
 * (事件跳掉、邂逅不触发、残魂不显现),从而干净地走到败北分支。
 */
const CAUTIOUS_LOSS_REDUCTION = 0.04

const { protect, combatWin } = vi.hoisted(() => ({ protect: { value: false }, combatWin: { value: false } }))

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

// resolveCombat 恒为可控胜负(默认败),makeEnemySnap 恒为占位敌
vi.mock('./combat', async importOriginal => {
  const mod = await importOriginal<typeof import('./combat')>()
  return {
    ...mod,
    resolveCombat: () => (combatWin.value ? { win: true, rounds: 5, playerHpPct: 0.9 } : { win: false, rounds: 5, playerHpPct: 0.4 }),
    // 敌战力从快照三维折出(enemyPowerOf 读 attack/defense/maxHp),
    // 伪造件得按 CombatantSnap 的真形状给齐 —— 旧形状 {hp,def,atk} 会被 powerScore 踩到 undefined
    makeEnemySnap: () => ({ attack: { m: 100, e: 0 }, defense: { m: 10, e: 0 }, maxHp: { m: 100, e: 0 } })
  }
})

function forgeSession(now: number): void {
  useAdventureStore().setSession({
    regionId: 'qingyun',
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

    protect.value = true // 即使放行掷点,0 的概率也恒不护

    tickExploration(now)

    const cultivation = useCultivationStore()
    const adventure = useAdventureStore()
    expect(cultivation.buffs.some(b => b.defId === 'injury')).toBe(true)
    expect(adventure.session).toBeNull()
  })
})

describe('连胜(TASK-022 接线 · runBattle 胜负驱动 player.winStreak)', () => {
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

    protect.value = true // 败北被护住:不算败 → 连胜保留
    tickExploration(now)
    expect(player.winStreak).toBe(3)
    expect(useAdventureStore().session).not.toBeNull()

    // 再来一场真正的败北(无灵兽保护):连胜清空
    player.setPet('pet_huoque') // fierce → lossReduction 0
    protect.value = false
    player.winStreak = 5
    forgeSession(now)
    tickExploration(now)
    expect(player.winStreak).toBe(0)
  })
})

/**
 * 镇压资格只在**首次**达成时自动接管(DEC-018):
 * 若每次优势取胜都自动转成收益态,玩家就没法自由选择「这一世我要历练它」。
 */
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

    // 玩家改主意:停取收益,重新历练此地
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

/**
 * 会话账目与战报 —— 与 afterWin 的真实入账同源。
 *
 * 从前会话自己按 stoneByTier(tier, 10×modeMult) 记一份灵石(漏了福缘/区域事件/首领倍率),
 * expGain 从头到尾恒为 0,itemGain 数的是掉落**文案行数**(连「战利品翻倍!」也算一件)。
 * 于是「本次所得」和行囊里真正多出来的东西对不上 —— 这几个字段本来就是为了给玩家看。
 */
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
    // 第一战会带上首胜成就这类一次性奖励,不能拿来对账;比第二战的增量才干净
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

    // 假 rng 把所有概率判定压成否:本战无实物掉落,但明细栏必须存在且为空表
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
    // 无规则时「我」应等于面板战力(同一套 finalStats 三维折出)
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
})
