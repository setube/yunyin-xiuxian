import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useEndgameStore } from '@/stores/endgame'
import { FURNACE_RATES, DAO_SOURCE_PER_FRUIT, FURNACE_STONE_TIER_AMOUNT, FURNACE_STONE_DAO_SOURCE } from '@/data/endgame'
import { chooseDaoPath, condenseDaoFruit, currentDaoRules, endgameUnlocked, furnaceConvert, furnaceStoneCost, furnaceConvertStone } from './endgameService'
import { stoneByTier } from './formulas'
import { maxTierForMajor } from '@/data/regions'
import { resolveWorld, startWorldExpedition } from './expedition'
import { attemptBreakthrough } from './breakthrough'
import { gnZero } from '@/utils/gnum'

/**
 * 飞升也要渡天劫(大关皆劫)。
 *
 * 这条用例验的是**跨界叙事与跨世节点**,不是渡劫平衡 —— 故把准备度钉到"该有的
 * 样子"(抗性封顶 + 三维折算满),让十二道雷真的走完。真实玩家达到同一量级靠的是
 * 功法分支(劫印/渡厄)、天赋雷体、灵兽、护腕、称号与丹药,见 tribulationDecision
 * 的 statGuardOf 与 tribulationSpace.spec 的逐境普查。
 */
vi.mock('@/core/tribulationDecision', async importOriginal => {
  const real = await importOriginal<typeof import('@/core/tribulationDecision')>()
  return { ...real, currentStatGuard: () => ({ resist: 0.8, guard: 1 }) }
})

function ascend(): void {
  const player = usePlayerStore()
  // (0,0) → (9,x):每个大境界需 10 次推进(九层 + 跨境)
  for (let i = 0; i < 95; i += 1) player.advanceRealm()
}

describe('真仙终局服务', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未至真仙不得踏天', () => {
    expect(endgameUnlocked()).toBe(false)
    expect(chooseDaoPath('sword')).toBe(false)
    // 旧线性入口 challengeWorld 已删(Phase 21 起由路线远征取代),这里改为钉现役入口的同一道闸
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
    expect(resources.ore).toBe(5) // 余数保留
  })

  it('熔炉的草唯仙品起可熔:凡/灵不入炉、按品实扣,不白拿道源(over-credit 修)', () => {
    ascend()
    const resources = useResourcesStore()
    const endgame = useEndgameStore()
    const rate = FURNACE_RATES.find(r => r.resource === 'herb')! // per 60
    // 凡品 40 + 灵品 20 = 60,但凡/灵不入炉 → meltable 0,既熔不了也入不了账
    resources.$patch({ herbByGrade: { 1: 40, 2: 20, 3: 0, 4: 0, 5: 0 } })
    expect(furnaceConvert(rate)).toBe(0)
    expect(endgame.daoSource).toBe(0)
    // 仙品 120 → 2 缕,只扣仙品,凡/灵分毫未动
    resources.$patch({ herbByGrade: { 1: 40, 2: 20, 3: 120, 4: 0, 5: 0 } })
    expect(furnaceConvert(rate)).toBe(2)
    expect(endgame.daoSource).toBe(2)
    expect(resources.herbMeltable).toBe(0)
    expect(resources.herbByGrade[1] + resources.herbByGrade[2], '凡/灵品不入炉').toBe(60)
    // 跨品:仙 30 + 神 35 = 65 → 1 缕,自低品起扣 60(仙30+神30),神余 5;道源只按实扣入账
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
    // 入界战有胜有败:胜则 run 在途,败则当场落痕并清空 run —— 两条路都算"进过界"
    expect(endgame.worldRun?.worldId ?? endgame.marks.at(-1)?.targetId).toBe('chiyan')
    expect(endgame.daoSource).toBe(before - world.entryCost)
  })

  it('未择道途不可远征', () => {
    ascend()
    const endgame = useEndgameStore()
    endgame.addDaoSource(50)
    expect(startWorldExpedition('chiyan', null)).toBeNull()
    expect(endgame.daoSource).toBe(50) // 未扣费
  })

  /**
   * 扩界后真仙不再是大道的尽头 —— 它只是仙界的门槛。
   * 这条守住「继续攀登」与「天界常开」两件事:门槛改锚后,上面还有境界可走,
   * 而终局内容在整个仙界/神界/混沌海期间始终可用(不因境界升高而关闭)。
   */
  it('真仙之上仍可继续攀登,且天界始终开启', () => {
    const player = usePlayerStore()
    ascend() // 至真仙(仙界门槛)
    expect(player.realm.name).toBe('真仙')
    expect(player.worldName).toBe('仙界')
    expect(endgameUnlocked()).toBe(true)

    // 从真仙沿真实突破继续推进(每大境界九层 + 跨境,共十步)
    let guard = 0
    while (!player.atMaxRealm && guard < 500) {
      player.advanceRealm()
      guard += 1
    }
    expect(player.atMaxRealm).toBe(true)
    expect(player.realm.name).toBe('混沌道祖')
    expect(player.worldName).toBe('混沌海')
    expect(endgameUnlocked()).toBe(true) // 越往高处走,天界只会更开,不会关
  })

  /**
   * 飞升是扩界新增的三次「换一片天」之一(另两次是入神、归返混沌)。
   * 从前真仙是唯一的「无劫门槛」(旧设计当它是飞升之赏),只按成功率判定;
   * 现在大关皆劫 —— 飞升同样要渡(见本文件顶部的 mock 说明),
   * 这条守住跨界叙事与跨世节点真的落到存档里。
   */
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
    // 大关进阶时附上该境出处(可解释性):真仙取道教仙阶
    expect(view?.message).toContain('道教仙阶')
  })
})

/**
 * 天道熔炉 · 灵石熔铸价随层级(ISS-214 口径直测)。
 *
 * economySim 只守「凝一枚道果的材料代价不随层级漂移」,但它用的是自己那份
 * stoneByTier(tier, FURNACE_STONE_TIER_AMOUNT)(economySim.ts:217),不调用现役的
 * furnaceStoneCost —— 现役函数此前没有任何直测。旧病(SS-214)是把熔铸价冻在真仙那层,
 * 一到混沌海道果就相对收入塌 1.9^12。这三条把现役函数钉死在「价随层级、相对收入恒定」。
 */
describe('天道熔炉 · 灵石熔铸价随层级(现役函数直测)', () => {
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

  it('价相对一战灵石收入恒定(ISS-214 本质:花的是这一层的钱)', () => {
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
    // 不足:灵石清零 → 转不出,道源与灵石分文不动(原子)
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
})
