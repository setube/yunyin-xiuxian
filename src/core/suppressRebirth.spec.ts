import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { usePlayerStore } from '@/stores/player'
import { REGIONS, maxTierForMajor } from '@/data/regions'
import { rollLinggen } from '@/core/linggenGen'
import { checkSuppression, settleSuppressedRegions, suppressionProgress } from './suppress'
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

  /**
   * 历练页的总纲从前写着「资格永久」,而 rebirth() 连 `suppressQualified` 一并清空:
   * 文案承诺的是跨世的那枚令,实际给的是本世内不再失效 —— 转世一次就当场分叉。
   * 这不只是措辞问题:玩家照这句话会以为新世炼气也能一键把旧世远境切回收益,
   * 而那正是数值爆炸的入口,代码刻意堵死了。
   *
   * 故障注入:把文案改回「资格永久,守满…」→ 本条红。
   */
  it('历练页不再承诺「资格永久」,并写明转世会散去', () => {
    const view = readFileSync(resolve(__dirname, '../views/AdventureView.vue'), 'utf8')
    expect(view, '资格只在本世内永久,必须点明转世').toContain('资格本世永久、转世随皮囊散去')
    expect(view, '不许再对玩家承诺跨世的「资格永久」').not.toContain('资格永久,守满')

    // 正对照:行为确实是「本世保留、转世清空」,文案不是凭空的
    const player = usePlayerStore()
    player.markSuppressQualified('qingyun')
    player.suppressRegion('qingyun')
    expect(player.suppressQualified, '本世内资格照旧保留').toContain('qingyun')
    player.rebirth(rollLinggen(rng))
    expect(player.suppressQualified, '转世后资格随皮囊散去').toEqual([])
  })

  /**
   * 转世后**只赢一场**就能把旧世的高阶地界重新镇压 —— 这条漏洞比文案更贵。
   *
   * `regionStats` 刻意跨世保留(「世界记得你」),而镇压判据读的正是这本 EMA:
   * 上一世在高阶地界打出 30 胜 / 均 2 回合 / 均伤 3%,新世炼气回去赢一场,
   * EMA 几乎不动(0.7×2 + 0.3×2),三判据照样全绿 —— 于是自动重新镇压,
   * 按旧阶位派发高阶装备与灵石。`rebirth()` 清空 `suppressQualified` 只堵住了
   * 「一键切回」这一条入口,判据本身仍拿着旧世的账。
   *
   * 现给战绩盖世号,判据只认本世那本;战绩本身照旧留着(兴衰/复聚钟/叙事)。
   *
   * 故障注入:把 `suppressionProgress` 的 life 判据删掉 → 本条红。
   */
  it('转世后旧世战绩不再替新世作证:赢一场不会重新镇压高阶地界', () => {
    const player = usePlayerStore()
    player.major = 12
    player.regionStats.hongmeng = {
      totalFights: 30,
      avgRounds: 2,
      avgDamageTakenPct: 0.03,
      consecutiveWins: 30,
      lastUpdateAt: Date.now()
    }
    player.markSuppressQualified('hongmeng')
    player.suppressRegion('hongmeng')
    expect(player.suppressedRegions).toEqual(['hongmeng'])

    player.rebirth(rollLinggen(rng))
    // 新世:只赢一场。EMA 若仍读旧账,这一场就足以让三判据全绿
    player.updateRegionStats('hongmeng', true, 2, 0.03)
    expect(player.regionStats.hongmeng!.totalFights, '本世战绩从 1 起算').toBe(1)
    expect(checkSuppression(player, 'hongmeng'), '旧世战绩不该替新世作证').toBe(false)

    // 阳性对照:本世真的打满二十场,判据照旧成立
    for (let i = 0; i < 19; i += 1) player.updateRegionStats('hongmeng', true, 2, 0.03)
    expect(player.regionStats.hongmeng!.totalFights).toBe(20)
    expect(checkSuppression(player, 'hongmeng'), '本世攒够就该能镇压').toBe(true)
  })

  it('跨世战绩保留原世号,不被读档改写成当前世', () => {
    const player = usePlayerStore()
    player.major = 12
    player.regionStats.hongmeng = {
      totalFights: 30,
      avgRounds: 2,
      avgDamageTakenPct: 0.03,
      consecutiveWins: 30,
      lastUpdateAt: Date.now(),
      life: player.reincarnation.count
    }
    player.rebirth(rollLinggen(rng))
    player.sanitize()
    // 旧世那本原样留着(叙事与兴衰照旧),世号不被「修补」成本世
    expect(player.regionStats.hongmeng!.life, '旧世战绩不该被读档洗成本世').toBe(0)
    expect(player.regionStats.hongmeng!.totalFights).toBe(30)
    expect(suppressionProgress(player.regionStats.hongmeng, player.suppressLife).qualified, '旧账不参与本世判据').toBe(false)
  })
})
