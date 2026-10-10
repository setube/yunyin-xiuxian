/**
 * 功法参悟/升级到顶(upgradeGongfa + gongfaUpgradeCost)守卫。
 *
 * cultivation.upgrade 本身不加钳(learned = lv+1);整条「圆满不越级」全靠
 * gongfaUpgradeCost 在 lv >= def.maxLevel 时返回 null 这道闸。此前只有
 * gongfaBranch.spec 测数据层,upgradeGongfa/gongfaUpgradeCost/comprehendGongfa
 * 无任何直接规格——闸一旦松掉或调用方绕过,圆满功法会越级溢出,静默腐蚀 功法加成。
 * 这里走升级路径(无 RNG),以 gongfaUpgradeCost 为 oracle,断言到顶拒绝不扣、
 * 缺料拒绝不扣、成功精确扣并+1、永不过顶。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCultivationStore } from '@/stores/cultivation'
import { useResourcesStore } from '@/stores/resources'
import { comprehendGongfa, gongfaUpgradeCost, upgradeGongfa } from '@/core/gongfaService'
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
    expect(cul.learned[G]).toBe(MAXLV) // 不越级
    expect(res.wudao).toBe(1_000_000) // 不扣
    expect(res.page).toBe(1_000_000) // 不扣
  })

  it('悟道点不足:拒绝、不扣残页、等级不变', () => {
    const cul = useCultivationStore()
    const res = useResourcesStore()
    cul.learned = { [G]: 1 }
    res.wudao = 0 // 不足
    res.page = 1_000_000
    expect(upgradeGongfa(G)).toBe(false)
    expect(cul.learned[G]).toBe(1)
    expect(res.page).toBe(1_000_000) // 残页没被扣
  })

  it('残页不足:拒绝、不扣悟道点、等级不变', () => {
    const cul = useCultivationStore()
    const res = useResourcesStore()
    cul.learned = { [G]: 1 }
    res.wudao = 1_000_000
    res.page = 0 // 不足
    expect(upgradeGongfa(G)).toBe(false)
    expect(cul.learned[G]).toBe(1)
    expect(res.wudao).toBe(1_000_000) // 悟道点没被扣
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

/**
 * 功法参悟(藏经阁)边界:残页不足不学、池内未学才习得、学完不扣残页。
 * 参悟走 RNG(learnRandomGongfa 随机加权),故不断言「习得哪一部」,只断言
 * 属性:残页数、习得计数 +1、新增那一部在参悟池里(minRealm ≤ major+1)此前未学。
 */
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
    expect(res.page).toBe(0) // 不扣(本来就没有)
    expect(Object.keys(cul.learned).length).toBe(before) // 不学
  })

  it('残页足够:成功习得一部,精确扣 COMPREHEND_PAGE_COST 残页,新增份在池内且此前未学', () => {
    const cul = useCultivationStore()
    const res = useResourcesStore()
    cul.learned = {}
    res.page = 1_000_000
    const before = Object.keys(cul.learned)
    expect(comprehendGongfa()).toBe(true)
    expect(res.page).toBe(1_000_000 - COMPREHEND_PAGE_COST) // 精确扣 12 残页
    const after = Object.keys(cul.learned)
    expect(after.length).toBe(before.length + 1) // 恰好习得一部
    const newId = after.find(id => !before.includes(id))!
    expect(gongfaDef(newId)?.minRealm).toBeLessThanOrEqual(1) // major 0 + 1:池内
    expect(before.includes(newId)).toBe(false) // 此前未学
  })

  it('全学(池已空):拒绝、不习得、残页不动', () => {
    const cul = useCultivationStore()
    const res = useResourcesStore()
    // 把 minRealm ≤ major(0)+1 的功法全学掉 → 参悟池为空
    cul.learned = Object.fromEntries(GONGFA.filter(g => g.minRealm <= 1).map(g => [g.id, 1]))
    res.page = 1000
    expect(comprehendGongfa()).toBe(false)
    expect(res.page).toBe(1000) // 不扣
  })
})
