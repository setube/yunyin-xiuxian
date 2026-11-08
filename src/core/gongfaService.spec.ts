/**
 * 功法升级到顶守卫。cultivation.upgrade 本身不加钳(learned = lv+1),「圆满不越级」只靠
 * gongfaUpgradeCost 在 lv >= def.maxLevel 时返回 null;闸松掉或调用方绕过,圆满功法会越级溢出。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCultivationStore } from '@/stores/cultivation'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'
import { comprehendGongfa, gongfaUpgradeCost, gongfaUpgradeShort, gongfaUpgradeShortfall, upgradeGongfa } from '@/core/gongfaService'
import { COMPREHEND_PAGE_COST } from '@/data/constants'
import { GONGFA, gongfaDef } from '@/data/gongfa'

const G = 'm_taixuan' // main 型,默认 maxLevel 9
const MAXLV = 9

describe('功法到顶守卫(upgradeGongfa / gongfaUpgradeCost)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('到顶(lv === maxLevel):gongfaUpgradeCost 为 null —— 不再有升级价', () => {
    useCultivationStore().learned = { [G]: MAXLV }
    expect(gongfaUpgradeCost(G)).toBeNull()
  })

  it('未学/未知功法:gongfaUpgradeCost 为 null', () => {
    expect(gongfaUpgradeCost(G)).toBeNull() // 没学过
    expect(gongfaUpgradeCost('no_such_gongfa')).toBeNull()
  })

  it('到顶再升级:拒绝、一文不花、等级停在 maxLevel(永不过顶)', () => {
    const cul = useCultivationStore()
    const res = useResourcesStore()
    cul.learned = { [G]: MAXLV }
    res.wudao = 1_000_000
    res.page = 1_000_000
    expect(upgradeGongfa(G)).toBe(false)
    expect(cul.learned[G]).toBe(MAXLV)
    expect(res.wudao).toBe(1_000_000)
    expect(res.page).toBe(1_000_000)
  })

  it('悟道点不足:拒绝、不扣残页、等级不变', () => {
    const cul = useCultivationStore()
    const res = useResourcesStore()
    cul.learned = { [G]: 1 }
    res.wudao = 0
    res.page = 1_000_000
    expect(upgradeGongfa(G)).toBe(false)
    expect(cul.learned[G]).toBe(1)
    expect(res.page).toBe(1_000_000)
  })

  it('残页不足:拒绝、不扣悟道点、等级不变', () => {
    const cul = useCultivationStore()
    const res = useResourcesStore()
    cul.learned = { [G]: 1 }
    res.wudao = 1_000_000
    res.page = 0
    expect(upgradeGongfa(G)).toBe(false)
    expect(cul.learned[G]).toBe(1)
    expect(res.wudao).toBe(1_000_000)
  })

  it('缺料判据分得清悟道点、残页与两样俱缺', () => {
    const res = useResourcesStore()
    const cost = { wudao: 10, page: 4 }
    res.wudao = 0
    res.page = 100
    expect(gongfaUpgradeShort(cost)).toBe('wudao')
    res.wudao = 100
    res.page = 0
    expect(gongfaUpgradeShort(cost)).toBe('page')
    res.wudao = 0
    expect(gongfaUpgradeShort(cost)).toBe('both')
    res.wudao = 10
    res.page = 4
    expect(gongfaUpgradeShort(cost)).toBeNull()
  })

  it('缺残页时提示只报残页,不再说悟道点也未足', () => {
    const cul = useCultivationStore()
    const res = useResourcesStore()
    cul.learned = { [G]: 1 }
    res.wudao = 1_000_000
    res.page = 0
    const cost = gongfaUpgradeCost(G)!
    expect(upgradeGongfa(G)).toBe(false)
    const text = useUiStore().toasts.at(-1)?.text ?? ''
    expect(text).toContain('残页')
    expect(text).not.toContain('悟道点')
    expect(text, '拒因要报实际残页差').toContain(`残页尚差 ${cost.page} 页`)
  })

  it('两样都缺时回执同报悟道点与残页的实际差额', () => {
    const cul = useCultivationStore()
    const res = useResourcesStore()
    cul.learned = { [G]: 1 }
    const cost = gongfaUpgradeCost(G)!
    res.wudao = 0
    res.page = 0
    expect(gongfaUpgradeShortfall(cost)).toEqual({ wudao: cost.wudao, page: cost.page })
    expect(upgradeGongfa(G)).toBe(false)
    const text = useUiStore().toasts.at(-1)?.text ?? ''
    expect(text).toContain(`悟道点尚差 ${cost.wudao}`)
    expect(text).toContain(`残页尚差 ${cost.page} 页`)
  })

  /**
   * 差额钳在 0:持有足够时不给出负数。
   *
   * `gongfaUpgradeShortfall` 是 `Math.max(0, 花费 - 持有)`。这条钳**是可达的** ——
   * 上面那条用例只测了「资源归零」,那时差额正好等于花费,钳不钳一个样;
   * 而持有充足时(悟道 1000、需 10),不钳就是 -990,直接进 toast 变成「悟道点尚差 -990」。
   * 变异扫描点名这处钳没有判据盯着。
   */
  it('持有充足时差额为 0,不给出负数', () => {
    const res = useResourcesStore()
    res.wudao = 1000
    res.page = 1000
    expect(gongfaUpgradeShortfall({ wudao: 10, page: 10 }), '持有远多于花费时差额该是 0,不是负数').toEqual({
      wudao: 0,
      page: 0
    })
    // 刚好够也是 0
    res.wudao = 10
    res.page = 10
    expect(gongfaUpgradeShortfall({ wudao: 10, page: 10 }), '刚好够时差额该是 0').toEqual({ wudao: 0, page: 0 })
  })

  it('只缺一样时只报那一样,另一样为 0', () => {
    const res = useResourcesStore()
    res.wudao = 1000
    res.page = 3
    expect(gongfaUpgradeShortfall({ wudao: 10, page: 10 }), '悟道点够、残页缺 7').toEqual({ wudao: 0, page: 7 })
    res.wudao = 4
    res.page = 1000
    expect(gongfaUpgradeShortfall({ wudao: 10, page: 10 }), '残页够、悟道点缺 6').toEqual({ wudao: 6, page: 0 })
  })

  it('成功:返回 true、等级 +1、精确扣 gongfaUpgradeCost 的悟道点+残页', () => {
    const cul = useCultivationStore()
    const res = useResourcesStore()
    cul.learned = { [G]: 1 }
    res.wudao = 1_000_000
    res.page = 1_000_000
    const cost = gongfaUpgradeCost(G)!
    expect(cost.wudao).toBeGreaterThan(0)
    expect(cost.page).toBeGreaterThan(0)
    const w0 = res.wudao
    const p0 = res.page
    expect(upgradeGongfa(G)).toBe(true)
    expect(cul.learned[G]).toBe(2)
    expect(res.wudao).toBe(w0 - cost.wudao)
    expect(res.page).toBe(p0 - cost.page)
  })
})

/** 功法参悟(藏经阁)边界。参悟走 RNG(learnRandomGongfa 随机加权),不断言习得哪一部;参悟池 = minRealm ≤ major+1 */
describe('功法参悟边界(comprehendGongfa)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('残页不足(page=0):拒绝、不习得、残页不动', () => {
    const cul = useCultivationStore()
    const res = useResourcesStore()
    cul.learned = {}
    res.page = 0
    const before = Object.keys(cul.learned).length
    expect(comprehendGongfa()).toBe(false)
    expect(res.page).toBe(0)
    expect(Object.keys(cul.learned).length).toBe(before)
    expect(useUiStore().toasts.at(-1)?.text, '参悟拒因要报实际残页差').toContain(
      `残页尚差 ${COMPREHEND_PAGE_COST} 页`,
    )
  })

  it('残页足够:成功习得一部,精确扣 COMPREHEND_PAGE_COST 残页,新增份在池内且此前未学', () => {
    const cul = useCultivationStore()
    const res = useResourcesStore()
    cul.learned = {}
    res.page = 1_000_000
    const before = Object.keys(cul.learned)
    expect(comprehendGongfa()).toBe(true)
    expect(res.page).toBe(1_000_000 - COMPREHEND_PAGE_COST)
    const after = Object.keys(cul.learned)
    expect(after.length).toBe(before.length + 1)
    const newId = after.find(id => !before.includes(id))!
    expect(gongfaDef(newId)?.minRealm).toBeLessThanOrEqual(1) // major 0 + 1:池内
    expect(before.includes(newId)).toBe(false)
  })

  it('全学(池已空):拒绝、不习得、残页不动', () => {
    const cul = useCultivationStore()
    const res = useResourcesStore()
    // 学满参悟池(minRealm ≤ major(0)+1)
    cul.learned = Object.fromEntries(GONGFA.filter(g => g.minRealm <= 1).map(g => [g.id, 1]))
    res.page = 1000
    expect(comprehendGongfa()).toBe(false)
    expect(res.page).toBe(1000)
  })
})
