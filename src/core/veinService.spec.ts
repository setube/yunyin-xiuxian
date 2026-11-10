/** 灵脉投资服务契约:主脉 70 / 副脉 30 分轨,UI 须与此一致 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { gn, toNum } from '@/utils/gnum'
import { investVein, switchMainVein, veinCap, veinInvestPlan, investVeinBatch, veinPointCost, veinPointShortfall, veinSwitchCost, veinSwitchShortfall } from './veinService'
import { usePlayerStore } from '@/stores/player'
import { useDongfuStore } from '@/stores/dongfu'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'

describe('灵脉投资(Phase 30.3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const player = usePlayerStore()
    player.major = 2 // 金丹,灵脉开放
    useResourcesStore().spiritStone = gn(1e9) // 不限灵石
  })

  it('未定主脉时首投即成主脉,主脉可投过 30 直达 70', () => {
    const dongfu = useDongfuStore()
    expect(dongfu.veinMain).toBeNull()
    expect(veinCap('gather')).toBe(70) // 未定主脉按主脉档,与批量同口径

    for (let i = 0; i < 40; i += 1) investVein('gather')
    expect(dongfu.veinMain).toBe('gather')
    expect(dongfu.veinPoints.gather).toBe(40)
    expect(veinCap('gather')).toBe(70)

    for (let i = 40; i < 70; i += 1) expect(investVein('gather')).toBe(true)
    expect(dongfu.veinPoints.gather).toBe(70)
    expect(investVein('gather')).toBe(false)
  })

  it('失败的首次投资不立主脉:灵石不足的被拒点击,主脉仍空置', () => {
    const dongfu = useDongfuStore()
    expect(dongfu.veinMain).toBeNull()
    const cost = toNum(veinPointCost())
    useResourcesStore().spiritStone = gn(cost - 1) // 只差一枚灵石
    expect(investVein('gather'), '灵石不足应被拒').toBe(false)
    expect(dongfu.veinMain, '被拒的投资不该立主脉').toBeNull()
    expect(dongfu.veinPoints.gather ?? 0).toBe(0)
    expect(toNum(veinPointShortfall()), '单点缺口要按实际石差报').toBeCloseTo(1, 9)
    expect(useUiStore().toasts.at(-1)?.text, '拒因写实际石差').toContain('灵石尚差 1')
    useResourcesStore().spiritStone = gn(1e9)
    expect(investVein('gather')).toBe(true)
    expect(dongfu.veinMain).toBe('gather')
  })

  it('改立主脉:付费换向,原主脉点数保留但降至副脉上限不可续投', () => {
    const dongfu = useDongfuStore()
    for (let i = 0; i < 40; i += 1) investVein('gather')

    expect(switchMainVein('craft')).toBe(true)
    expect(dongfu.veinMain).toBe('craft')
    expect(dongfu.veinPoints.gather).toBe(40)
    expect(veinCap('gather')).toBe(30)
    expect(investVein('gather')).toBe(false)
    for (let i = 0; i < 35; i += 1) expect(investVein('craft')).toBe(true)
    expect(dongfu.veinPoints.craft).toBe(35)
  })

  it('总容量 100:主脉 70 + 副脉 30 = 100,第 101 点被拒(单点与批量皆拒)', () => {
    const d = useDongfuStore()
    for (let i = 0; i < 70; i += 1) expect(investVein('gather')).toBe(true)
    for (let i = 0; i < 30; i += 1) expect(investVein('craft')).toBe(true)
    expect(d.veinTotal).toBe(100)
    expect(investVein('insight')).toBe(false)
    expect(investVeinBatch('insight')).toBe(0)
    expect(veinInvestPlan('insight').blocked).toBe('full')
  })

  it('未定主脉首投按主脉档 70(不是副脉 30):批量一口气注满 70', () => {
    const d = useDongfuStore()
    expect(d.veinMain).toBeNull()
    expect(investVeinBatch('gather')).toBe(70)
    expect(d.veinPoints.gather).toBe(70)
    expect(d.veinMain).toBe('gather')
  })

  it('副脉到顶(30):计划报 peak,批量一口也开不了', () => {
    const d = useDongfuStore()
    for (let i = 0; i < 40; i += 1) investVein('gather')
    expect(veinInvestPlan('craft').points).toBe(30)
    expect(investVeinBatch('craft')).toBe(30)
    expect(d.veinPoints.craft).toBe(30)
    expect(veinInvestPlan('craft').blocked).toBe('peak')
    expect(investVeinBatch('craft')).toBe(0)
  })

  /*
   * 未解锁(金丹之前)那一档之前没有用例 —— 变异扫描报 veinInvestPlan 的
   * `if (!veinsUnlocked()) return zero(null)` 改坏不红。
   *
   * 去掉守卫时,dongfu.veinTotal 是 0、主脉未定,按主脉档 70 算,灵石又管够,
   * 于是计划里 points 变成一个正数 —— 界面会报「可投 N 点」并让按钮可点,
   * 而 investVein/investVeinBatch 自己还有守卫,点下去一注也投不成。
   */
  it('未解锁时计划给不出点数,且 investVein 也一注投不成', () => {
    usePlayerStore().major = 1 // 筑基,未到金丹
    const plan = veinInvestPlan('gather')
    expect(plan.points, '未解锁不该报出可投点数').toBe(0)
    expect(plan.blocked, '未解锁不是「有原因受阻」,是压根没开放').toBeNull()
    expect(investVein('gather'), '单点同样投不成').toBe(false)
    expect(investVeinBatch('gather'), '批量同样投不成').toBe(0)
    expect(useDongfuStore().veinPoints.gather ?? 0, '一注都没落地').toBe(0)
  })

  it('计划按灵石取 floor(灵石/单价),不四舍五入', () => {
    const cost = toNum(veinPointCost())
    useResourcesStore().spiritStone = gn(2.5 * cost) // 2.5 倍单价:floor 2 / round 3
    const plan = veinInvestPlan('gather')
    expect(plan.blocked).toBeNull()
    expect(plan.points).toBe(2)
  })

  it('批量按总账一笔扣一笔加:预览==实账(stone=plan.stone,points=plan.points,return=plan.points)', () => {
    const d = useDongfuStore()
    useResourcesStore().spiritStone = gn(5000)
    const plan = veinInvestPlan('gather')
    const stoneBefore = toNum(useResourcesStore().spiritStone)
    const p = investVeinBatch('gather')
    expect(p).toBe(plan.points)
    expect(d.veinPoints.gather).toBe(plan.points)
    expect(stoneBefore - toNum(useResourcesStore().spiritStone)).toBe(toNum(plan.stone))
  })

  it('迁移主脉付费:成功扣 veinSwitchCost(20×)→ 战略代价', () => {
    const d = useDongfuStore()
    investVein('gather')
    const cost = toNum(veinSwitchCost())
    useResourcesStore().spiritStone = gn(cost) // 恰好够
    expect(switchMainVein('craft')).toBe(true)
    expect(d.veinMain).toBe('craft')
    expect(toNum(useResourcesStore().spiritStone)).toBe(0)
  })

  it('迁移费不足:拒绝换主,主脉不动、分文不扣', () => {
    const d = useDongfuStore()
    investVein('gather')
    const cost = toNum(veinSwitchCost())
    useResourcesStore().spiritStone = gn(cost - 1)
    expect(switchMainVein('craft')).toBe(false)
    expect(d.veinMain).toBe('gather')
    expect(toNum(useResourcesStore().spiritStone)).toBe(cost - 1)
    expect(toNum(veinSwitchShortfall())).toBeCloseTo(1, 9)
    expect(useUiStore().toasts.at(-1)?.text).toContain('灵石尚差 1')
  })

})
