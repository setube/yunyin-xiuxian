import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { REGIONS, maxTierForMajor } from '@/data/regions'
import { rollLinggen } from '@/core/linggenGen'
import { settleSuppressedRegions } from './suppress'
import { rng } from '@/utils/random'

/**
 * 转世 × 镇压 —— 镇压是「这一世的地盘」,不是「我是谁」。
 *
 * 病灶:samsaraAudit 的原则是「保留『我是谁』,重置『我现在拥有多少』」,
 * 镇压权益(kind: state)却整档跨世 —— 新世炼气还在领旧世仙境的 20+ 阶装备,
 * 数值当场爆炸(玩家实报「低境界刷低副本掉远超当前的装备」)。
 * 修法:转世即「妖气复聚」—— 镇压权益随皮囊散去,区域回到历练地;而
 * 宿敌记忆与区域战绩(regionStats)仍随神魂不灭,「世界记得你」的叙事不丢。
 *
 * 读档兜底最初拿**境界当代理**(`minRealm > 当前境界` 即当旧世残留清掉),它有个
 * 真实可达的反例:进入某地只受解锁链与本世路线管,不受 minRealm 管 —— 在本世境界
 * 还低于副本标称时把那里打下来并镇压,下一次读档会被当成残留当场没收。现改记
 * **世号**(player.suppressLife):与当前世不符的才是残留。老档(上线前没有这一栏)
 * 仍按旧境界代理保守清一次,随后补盖世号。
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
    // 宿敌记忆保留;镇压权益(含时间戳与资格)清空
    expect(player.nemeses.length).toBe(1)
    expect(player.suppressedRegions).toHaveLength(0)
    expect(Object.keys(player.suppressedSince)).toHaveLength(0)
    expect(player.suppressQualified).toHaveLength(0)
  })

  it('老档兜底:修复前已转世的存档,读档时远境镇压照清(不然还得再转一次世)', () => {
    const player = usePlayerStore()
    // 模拟上线前的老档:没有 suppressLife 这一栏(哨兵 −1),带着 20+ 阶远境的镇压列表
    const far = REGIONS.filter(r => r.tier >= 20)[0]!
    expect(player.suppressLife, '新档默认是哨兵,读档后才补盖世号').toBe(-1)
    player.suppressedRegions = [far.id, 'qingyun']
    player.suppressQualified = [far.id, 'qingyun']
    player.suppressedSince = { [far.id]: 12345, qingyun: 67890 }
    player.sanitize()
    // 老档只认境界(境界 0 下 20 阶远境不可达)—— 妖气复聚;本世合法的 qingyun(minRealm 0)原样留
    expect(player.suppressedRegions).toEqual(['qingyun'])
    expect(player.suppressQualified).toEqual(['qingyun'])
    expect(Object.keys(player.suppressedSince)).toEqual(['qingyun'])
    // 清完立刻补盖世号:此后这一档走本体判据,不再按境界
    expect(player.suppressLife).toBe(player.reincarnation.count)
  })

  it('读档兜底只对老档:中期存档(境界高)里合法的远境镇压原样保留', () => {
    const player = usePlayerStore()
    // 合 8 境的老档:minRealm ≤ 8 的远境是本世合法镇压,不许误清
    player.major = 8
    const far = REGIONS.filter(r => r.tier >= 20)[0]!
    expect(far.minRealm).toBeLessThanOrEqual(8)
    player.suppressedRegions = [far.id]
    player.suppressQualified = [far.id]
    player.sanitize()
    expect(player.suppressedRegions).toEqual([far.id])
    expect(player.suppressQualified).toEqual([far.id])
    // 但老档里「境界之下也不可能的」(minRealm 9+)还是清 —— 那批档分不出本世/旧世,取保守
    const impossibleId = REGIONS.filter(r => r.minRealm > 8)[0]!.id
    player.suppressLife = -1 // 重新摆成老档哨兵:这条判据只在没有世号时走
    player.suppressedRegions = [far.id, impossibleId]
    player.suppressedSince = { [far.id]: 1, [impossibleId]: 2 }
    player.sanitize()
    expect(player.suppressedRegions).toEqual([far.id])
  })

  /**
   * 新判据的本体:**本世真的打下来的镇压,不因境界低于副本标称而被没收**。
   *
   * 病灶:进入某地只受解锁链与本世路线管,不受 minRealm 管 —— 于是玩家完全可能
   * 在本世境界还低于副本标称时把它打下来并镇压,而下一次读档时那份镇压会被
   * 「minRealm > 当前境界」当成旧世残留当场清掉。镇压的跨世判据应当是**世号**,
   * 不是境界。
   */
  it('本世镇压的高境副本读档不被境界判据没收(判据是世号,不是境界)', () => {
    const player = usePlayerStore()
    // 本世(第 0 世)压下一处 minRealm 高于当前境界的远境 —— 解锁链允许,能真打出来
    player.major = 0
    const far = REGIONS.filter(r => r.tier >= 20)[0]!
    expect(far.minRealm).toBeGreaterThan(0)
    player.suppressRegion(far.id)
    expect(player.suppressedRegions).toEqual([far.id])

    player.sanitize()
    expect(player.suppressedRegions, '本世的地盘不因境界低被没收').toEqual([far.id])
    expect(player.suppressLife).toBe(player.reincarnation.count)
  })

  it('转世后旧世镇压清空且世号跟上:判据换成世号后仍不残留', () => {
    const player = usePlayerStore()
    const far = REGIONS.filter(r => r.tier >= 20)[0]!
    player.suppressRegion(far.id)
    player.rebirth(rollLinggen(rng))
    expect(player.suppressedRegions, '转世即放下地盘').toEqual([])
    expect(player.suppressLife, '世号随转世前进').toBe(player.reincarnation.count)
    player.sanitize()
    expect(player.suppressedRegions).toEqual([])
  })
})
