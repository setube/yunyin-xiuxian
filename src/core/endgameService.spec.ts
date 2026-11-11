import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useEndgameStore } from '@/stores/endgame'
import { useUiStore } from '@/stores/ui'
import { FURNACE_RATES, DAO_SOURCE_PER_FRUIT, FURNACE_STONE_TIER_AMOUNT, FURNACE_STONE_DAO_SOURCE } from '@/data/endgame'
import { chooseDaoPath, condenseDaoFruit, condenseFruitAffordable, currentDaoRules, endgameUnlocked, furnaceConvert, furnaceMaterialShortfall, furnaceStoneAffordable, furnaceStoneCost, furnaceConvertStone } from './endgameService'
import { stoneByTier } from './formulas'
import { maxTierForMajor } from '@/data/regions'
import { resolveWorld, startWorldExpedition } from './expedition'
import { attemptBreakthrough } from './breakthrough'
import { gn, gnZero, mulN, subClamp } from '@/utils/gnum'
import { formatGN } from '@/utils/format'

/**
 * 飞升也要渡天劫(大关皆劫)。用例验跨界叙事与跨世节点,不验渡劫平衡:准备度钉到抗性封顶 + 三维折算满,让十二道雷走完。
 * 真实玩家达到同一量级的来源见 tribulationDecision 的 statGuardOf 与 tribulationSpace.spec 的逐境普查。
 */
vi.mock('@/core/tribulationDecision', async importOriginal => {
  const real = await importOriginal<typeof import('@/core/tribulationDecision')>()
  return { ...real, currentStatGuard: () => ({ resist: 0.8, guard: 1 }) }
})

function ascend(): void {
  const player = usePlayerStore()
  // (0,0) → (9,x):每大境界 10 次推进(九层 + 跨境)
  for (let i = 0; i < 95; i += 1) player.advanceRealm()
}

describe('真仙终局服务', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未至真仙不得踏天', () => {
    expect(endgameUnlocked()).toBe(false)
    expect(chooseDaoPath('sword')).toBe(false)
    expect(startWorldExpedition('chiyan', null)).toBeNull()
  })

  it('道途一生一诺,规则随身', () => {
    ascend()
    expect(chooseDaoPath('slaughter')).toBe(true)
    expect(chooseDaoPath('sword')).toBe(false) // 已定,不可另择
    const rules = currentDaoRules()
    expect(rules?.playerAtkMult).toBe(1.25)
    expect(rules?.maxRounds).toBe(35)
  })

  it('天道熔炉:闲置资源熔作道源,余数保留', () => {
    ascend()
    const resources = useResourcesStore()
    const endgame = useEndgameStore()
    resources.addSmall('ore', 130)
    const rate = FURNACE_RATES.find(r => r.resource === 'ore')!
    const gained = furnaceConvert(rate) // 130/25 = 5 缕
    expect(gained).toBe(5)
    expect(endgame.daoSource).toBe(5)
    expect(resources.ore).toBe(5)
  })

  it('熔炉预览通过后扣料失败:必须报出回执,不能点了没反应', () => {
    ascend()
    const resources = useResourcesStore()
    const endgame = useEndgameStore()
    const rate = FURNACE_RATES.find(r => r.resource === 'ore')!
    resources.ore = rate.per
    const before = endgame.daoSource
    vi.spyOn(resources, 'spendSmall').mockImplementation(() => {
      resources.ore = 0
      return false
    })
    expect(furnaceConvert(rate)).toBe(0)
    expect(endgame.daoSource).toBe(before)
    expect(useUiStore().toasts.at(-1)).toEqual(
      expect.objectContaining({ text: `${rate.name}尚差 ${rate.per}`, kind: 'warn' })
    )
  })

  it('熔炉材料不够一缕时写出实际差量,且与预览同源', () => {
    ascend()
    const resources = useResourcesStore()
    const rate = FURNACE_RATES.find(r => r.resource === 'ore')!
    resources.ore = rate.per - 7
    expect(furnaceMaterialShortfall(rate), '差 7 块才够一缕').toBe(7)
    expect(furnaceConvert(rate)).toBe(0)
    expect(useUiStore().toasts.at(-1)?.text).toContain(`${rate.name}尚差 7`)
    expect(useUiStore().toasts.at(-1)?.text).not.toContain(`尚差 ${rate.per}`)
  })

  /**
   * 材料差额钳在 0:够一炉时不给出负数。
   *
   * `furnaceMaterialShortfall` 是 `Math.max(0, rate.per - have)`,而它的消费点是
   * `furnaceConvert` 的 `if (daoSource <= 0) toast(\`${name}尚差 ${差额}\`)`。
   * 上面那条用例只测了「材料不足」,那时差额正好是正的;材料充足时若不钳,
   * 差额会是负数,直接进 toast 变成「灵草尚差 -90」。变异扫描点名这处钳没有判据盯着。
   */
  it('材料够一炉时差额为 0,不给出负数', () => {
    ascend()
    const resources = useResourcesStore()
    for (const rate of FURNACE_RATES) {
      const setHave = (n: number): void => {
        if (rate.resource === 'herb') {
          // 只有仙品+(≥3)可入炉,故把量放在 3 品
          resources.herbByGrade = { 1: 0, 2: 0, 3: n, 4: 0, 5: 0 }
        } else {
          resources[rate.resource] = n
        }
      }
      setHave(rate.per * 10)
      expect(furnaceMaterialShortfall(rate), `${rate.name} 远多于所需时差额该是 0,不是负数`).toBe(0)
      setHave(rate.per)
      expect(furnaceMaterialShortfall(rate), `${rate.name} 刚好够一炉时差额该是 0`).toBe(0)
      setHave(rate.per - 1)
      expect(furnaceMaterialShortfall(rate), `${rate.name} 差一块时差额该是 1`).toBe(1)
    }
  })

  it('熔炉的草唯仙品起可熔:凡/灵不入炉、按品实扣,不白拿道源(over-credit 修)', () => {
    ascend()
    const resources = useResourcesStore()
    const endgame = useEndgameStore()
    const rate = FURNACE_RATES.find(r => r.resource === 'herb')! // per 60
    // 凡/灵不入炉:凡 40 + 灵 20 = 60 也熔不了
    resources.$patch({ herbByGrade: { 1: 40, 2: 20, 3: 0, 4: 0, 5: 0 } })
    expect(furnaceConvert(rate)).toBe(0)
    expect(endgame.daoSource).toBe(0)
    // 仙品 120 → 2 缕
    resources.$patch({ herbByGrade: { 1: 40, 2: 20, 3: 120, 4: 0, 5: 0 } })
    expect(furnaceConvert(rate)).toBe(2)
    expect(endgame.daoSource).toBe(2)
    expect(resources.herbMeltable).toBe(0)
    expect(resources.herbByGrade[1] + resources.herbByGrade[2], '凡/灵品不入炉').toBe(60)
    // 跨品:仙 30 + 神 35 → 1 缕,自低品起扣 60,神余 5
    endgame.daoSource = 0
    resources.$patch({ herbByGrade: { 1: 0, 2: 0, 3: 30, 4: 35, 5: 0 } })
    expect(furnaceConvert(rate)).toBe(1)
    expect(endgame.daoSource).toBe(1)
    expect(resources.herbByGrade[3]).toBe(0)
    expect(resources.herbByGrade[4]).toBe(5)
  })

  it('道源凝道果:走既有软上限体系', () => {
    ascend()
    const endgame = useEndgameStore()
    const player = usePlayerStore()
    endgame.addDaoSource(DAO_SOURCE_PER_FRUIT)
    expect(condenseDaoFruit()).toBe(true)
    expect(player.reincarnation.daoFruit).toBe(1)
    expect(condenseDaoFruit()).toBe(false) // 道源不足
  })

  it('连凝 n 枚:整笔原子,道源不够全额就一枚也不凝', () => {
    ascend()
    const endgame = useEndgameStore()
    const player = usePlayerStore()
    // 只够 3 枚,却要 5 枚
    endgame.addDaoSource(DAO_SOURCE_PER_FRUIT * 3)
    expect(condenseDaoFruit(5), '道源不足全额却凝出了几枚').toBe(false)
    expect(player.reincarnation.daoFruit, '失败的整笔不该留下半截').toBe(0)
    expect(endgame.daoSource, '失败不该扣走道源').toBe(DAO_SOURCE_PER_FRUIT * 3)

    // 恰好够 3 枚
    expect(condenseDaoFruit(3)).toBe(true)
    expect(player.reincarnation.daoFruit).toBe(3)
    expect(endgame.daoSource).toBe(0)
  })

  it('可凝枚数与凝炼同口径:按整枚算,不算零头', () => {
    ascend()
    const endgame = useEndgameStore()
    endgame.addDaoSource(DAO_SOURCE_PER_FRUIT * 4 + Math.floor(DAO_SOURCE_PER_FRUIT / 2))
    expect(condenseFruitAffordable(), '零头被算成了一枚').toBe(4)
    expect(condenseFruitAffordable()).toBe(Math.floor(endgame.daoSource / DAO_SOURCE_PER_FRUIT))
  })

  /** 故障注入:condenseDaoFruit 恢复置 daoFruitTutorialSeen,本用例红 */
  it('凝成道果不置道果说明已见 —— 已见归玩家关掉说明时置,凝果即置则说明显示中刷新就永久丢失', () => {
    ascend()
    const endgame = useEndgameStore()
    endgame.addDaoSource(DAO_SOURCE_PER_FRUIT * 2)
    expect(condenseDaoFruit()).toBe(true)
    expect(condenseDaoFruit()).toBe(true)
    expect(usePlayerStore().reincarnation.daoFruit).toBe(2)
    expect(endgame.daoFruitTutorialSeen).toBe(false)
  })

  it('入界即扣道源、开出一场入界战(结算与留痕由路线远征自己管)', () => {
    ascend()
    const endgame = useEndgameStore()
    chooseDaoPath('slaughter')
    endgame.addDaoSource(20)
    const world = resolveWorld('chiyan')!
    const before = endgame.daoSource
    const result = startWorldExpedition('chiyan', null)
    expect(result).not.toBeNull()
    expect(result!.row.foeName.length).toBeGreaterThan(0)
    // 胜则 run 在途,败则当场落痕并清空 run
    expect(endgame.worldRun?.worldId ?? endgame.marks.at(-1)?.targetId).toBe('chiyan')
    expect(endgame.daoSource).toBe(before - world.entryCost)
  })

  it('未择道途不可远征', () => {
    ascend()
    const endgame = useEndgameStore()
    endgame.addDaoSource(50)
    expect(startWorldExpedition('chiyan', null)).toBeNull()
    expect(endgame.daoSource).toBe(50)
  })

  /** 真仙只是仙界门槛;终局内容在仙界/神界/混沌海期间始终可用 */
  it('真仙之上仍可继续攀登,且天界始终开启', () => {
    const player = usePlayerStore()
    ascend()
    expect(player.realm.name).toBe('真仙')
    expect(player.worldName).toBe('仙界')
    expect(endgameUnlocked()).toBe(true)

    let guard = 0
    while (!player.atMaxRealm && guard < 500) {
      player.advanceRealm()
      guard += 1
    }
    expect(player.atMaxRealm).toBe(true)
    expect(player.realm.name).toBe('混沌道祖')
    expect(player.worldName).toBe('混沌海')
    expect(endgameUnlocked()).toBe(true)
  })

  /** 飞升是三次「换一片天」之一(另两次是入神、归返混沌);同样要渡劫,见文件顶部 mock */
  it('飞升真仙:记下跨世节点 first_immortal,并给出界域叙事', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const endgame = useEndgameStore()
    player.major = 8 // 渡劫圆满,下一步即飞升
    player.sub = 9

    let view = null as ReturnType<typeof attemptBreakthrough>
    for (let i = 0; i < 200 && !view?.success; i += 1) {
      player.exp = player.expReq
      resources.setQi(player.qiCapValue, player.qiCapValue)
      view = attemptBreakthrough()
    }

    expect(view?.success).toBe(true)
    expect(player.major).toBe(9)
    expect(player.realm.name).toBe('真仙')
    expect(endgame.milestones.some(m => m.id === 'first_immortal')).toBe(true)
    expect(view?.message).toContain('仙界')
    // 大关进阶附该境出处:真仙取道教仙阶
    expect(view?.message).toContain('道教仙阶')
  })
})

/**
 * 现役 furnaceStoneCost 直测。economySim 用自己那份 stoneByTier(tier, FURNACE_STONE_TIER_AMOUNT),不调用现役函数。
 * 熔铸价冻在真仙那层会让混沌海道果相对收入塌 1.9^12。
 */
describe('天道熔炉 · 灵石熔铸价随层级(现役函数直测)', () => {
  /*
   * 新 pinia = 干净的 resources / endgame / player。
   *
   * 这个块原先一条 beforeEach 都没有,而块内第一条用例顺手把 `player.major` 改成 20、
   * 后一条又自己设成 14 并读 `furnaceStoneCost()` —— 前者跑在前时后者没事,
   * 乱序把顺序调过来就红:实测 `expected false to be true`(灵石按 20 境价算,给 14 境的量付不起)。
   */
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function toN(g: { m: number; e: number }): number {
    return g.m * Math.pow(10, g.e)
  }

  it('价 = stoneByTier(玩家当前层级, FURNACE_STONE_TIER_AMOUNT),随层级走', () => {
    for (const major of [9, 14, 20]) {
      const player = usePlayerStore()
      player.major = major
      expect(maxTierForMajor(major), `境 ${major} 的层级`).toBeGreaterThan(0)
      expect(furnaceStoneCost(), `境 ${major} 的熔铸价该按该境层级算`).toEqual(
        stoneByTier(maxTierForMajor(major), FURNACE_STONE_TIER_AMOUNT)
      )
    }
  })

  it('价相对一战灵石收入恒定(本质:花的是这一层的钱)', () => {
    const ratios = [9, 14, 20].map(major => {
      usePlayerStore().major = major
      const tier = maxTierForMajor(major)
      return toN(furnaceStoneCost()) / toN(stoneByTier(tier, 10))
    })
    expect(ratios[0]!, '300/10 同条 stoneByTier,代价恒为 30').toBeCloseTo(30, 6)
    expect(ratios[1]! as number).toBeCloseTo(ratios[0] as number, 6)
    expect(ratios[2]! as number).toBeCloseTo(ratios[0] as number, 6)
  })

  it('融灵石成道源:足则转成、扣灵石、入道源;不足则 false 且分文不动(原子)', () => {
    const resources = useResourcesStore()
    const endgame = useEndgameStore()
    const player = usePlayerStore()
    resources.spiritStone = gnZero()
    expect(furnaceConvertStone()).toBe(false)
    expect(endgame.daoSource).toBe(0)
    expect(toN(resources.spiritStone)).toBe(0)

    player.major = 14
    const cost = furnaceStoneCost()
    resources.addStone(cost)
    const before = toN(resources.spiritStone)
    expect(furnaceConvertStone()).toBe(true)
    expect(endgame.daoSource, '熔作道源入账').toBe(FURNACE_STONE_DAO_SOURCE)
    expect(toN(resources.spiritStone), '足额扣掉一份').toBe(before - toN(cost))
  })

  it('灵石熔铸扣款瞬时失败:回执点名尚差多少,不静默', () => {
    const resources = useResourcesStore()
    const player = usePlayerStore()
    player.major = 14
    resources.spiritStone = gn(furnaceStoneCost())
    const cost = furnaceStoneCost()
    vi.spyOn(resources, 'spendStone').mockImplementation(() => {
      resources.spiritStone = gnZero()
      return false
    })
    expect(furnaceConvertStone()).toBe(false)
    expect(useUiStore().toasts.at(-1)).toEqual(
      expect.objectContaining({ text: `灵石尚差 ${formatGN(cost)}`, kind: 'warn' })
    )
  })
})

describe('天道熔炉 · 灵石批量熔铸', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('给定够熔三次的灵石,当一次熔三次,则扣三份价、入三份道源', () => {
    const resources = useResourcesStore()
    const endgame = useEndgameStore()
    const player = usePlayerStore()
    player.major = 14
    const unit = furnaceStoneCost()
    resources.spiritStone = mulN(unit, 3)
    expect(furnaceConvertStone(3)).toBe(true)
    expect(endgame.daoSource, '入三份道源').toBe(FURNACE_STONE_DAO_SOURCE * 3)
    expect(resources.spiritStone, '扣三份价,余额恰好归零').toEqual(gnZero())
  })

  it('给定只够熔两次的灵石,当要熔三次,则一次也不熔且分文不动(原子)', () => {
    const resources = useResourcesStore()
    const endgame = useEndgameStore()
    const player = usePlayerStore()
    player.major = 14
    const unit = furnaceStoneCost()
    resources.spiritStone = mulN(unit, 2)
    const before = { ...resources.spiritStone }

    expect(furnaceConvertStone(3), '整笔原子:不够就一次也不熔').toBe(false)
    expect(endgame.daoSource).toBe(0)
    expect(resources.spiritStone, '分文不动').toEqual(before)
  })

  it('可熔次数按单价整笔算:余额恰够 N 份时给 N,差一点就退回 N-1', () => {
    const resources = useResourcesStore()
    const player = usePlayerStore()
    player.major = 14
    const unit = furnaceStoneCost()
    resources.spiritStone = mulN(unit, 5)
    expect(furnaceStoneAffordable()).toBe(5)
    resources.spiritStone = subClamp(mulN(unit, 5), gn(1))
    expect(furnaceStoneAffordable(), '差一点就不算第 5 次').toBe(4)
    resources.spiritStone = gnZero()
    expect(furnaceStoneAffordable()).toBe(0)
  })
})
