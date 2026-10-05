import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { REGIONS, maxTierForMajor } from '@/data/regions'
import { rollLinggen } from '@/core/linggenGen'
import { settleSuppressedRegions } from './suppress'
import { rng } from '@/utils/random'

/**
 * 转世 × 镇压 —— 旧世压下的高阶区域,不能在新世继续按旧阶位派发装备。
 *
 * 病灶:samsaraAudit 的原则是「保留『我是谁』,重置『我现在拥有多少』」,
 * 镇压权益(kind: state)却整档跨世 —— 新世炼气还在领旧世仙境的 20+ 阶装备,
 * 数值当场爆炸(玩家实报「低境界刷低副本掉远超当前的装备」)。
 * 修法:转世即「妖气复聚」—— 镇压权益随皮囊散去,区域回到历练地;而
 * 宿敌记忆与区域战绩(regionStats)仍随神魂不灭,「世界记得你」的叙事不丢。
 */
describe('转世不残留产出型镇压', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('新世(重掷后 major=0)能压的区域上限只到 2 阶 —— 远阶当属「重新经历」', () => {
    expect(maxTierForMajor(0)).toBe(2)
  })

  it('转世后,上一世镇压的远境应已复聚:结算不再为其派发装备', () => {
    const player = usePlayerStore()
    const far = REGIONS.filter(r => r.tier >= 20)[0]!
    player.suppressRegion(far.id)
    expect(player.suppressedRegions).toContain(far.id)

    // 转世:境界归零,这一世从头走
    player.rebirth(rollLinggen(rng))

    // 镇压权益不该跨世 —— 复聚回历练地
    expect(player.suppressedRegions).not.toContain(far.id)

    // 即便 tick 结算跑起来,也绝无旧世远境的高阶装备漏出来
    const got = settleSuppressedRegions(3 * 3600, rng)
    expect(got).toBeNull()
  })

  it('宿敌与区域战绩是「我是谁」,仍随神魂不灭(转世不清)', () => {
    const player = usePlayerStore()
    player.suppressRegion('qingyun')
    player.setNemeses([
      { enemyId: 'e_wolf', enemyName: '苍狼', regionId: 'qingyun', lossCount: 3, lastLossAt: Date.now() }
    ])
    player.rebirth(rollLinggen(rng))
    // 宿敌记忆保留;镇压权益(含时间戳)清空
    expect(player.nemeses.length).toBe(1)
    expect(player.suppressedRegions).toHaveLength(0)
    expect(Object.keys(player.suppressedSince)).toHaveLength(0)
  })
})
