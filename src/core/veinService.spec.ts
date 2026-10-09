/**
 * 灵脉投资服务的核心契约 —— 修复前 UI 把主脉和副脉一刀切卡在 30,
 * UI 上主脉到不了 70、「改立主脉」没有入口。服务侧逻辑本就是 70/30 分轨,
 * 这里把服务契约锁死,杜绝 UI 与服务再分叉。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { gn, toNum } from '@/utils/gnum'
import { investVein, switchMainVein, veinCap, veinInvestPlan, investVeinBatch, veinPointCost, veinSwitchCost } from './veinService'
import { usePlayerStore } from '@/stores/player'
import { useDongfuStore } from '@/stores/dongfu'
import { useResourcesStore } from '@/stores/resources'

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
    expect(veinCap('gather')).toBe(30) // 未定主脉时按副脉算

    // 连投 40 点:首投定主,之后一路投到 40(越过副脉 30 上限)
    for (let i = 0; i < 40; i += 1) investVein('gather')
    expect(dongfu.veinMain).toBe('gather')
    expect(dongfu.veinPoints.gather).toBe(40)
    expect(veinCap('gather')).toBe(70) // 主脉 70

    // 继续投到 70 仍可行,再多则拒
    for (let i = 40; i < 70; i += 1) expect(investVein('gather')).toBe(true)
    expect(dongfu.veinPoints.gather).toBe(70)
    expect(investVein('gather')).toBe(false)
  })

  it('改立主脉:付费换向,原主脉点数保留但降至副脉上限不可续投', () => {
    const dongfu = useDongfuStore()
    for (let i = 0; i < 40; i += 1) investVein('gather') // gather 成主,40 点

    expect(switchMainVein('craft')).toBe(true)
    expect(dongfu.veinMain).toBe('craft')
    // 原主脉点数不回收:gather 保持 40,但已是副脉,再投被上限拦下
    expect(dongfu.veinPoints.gather).toBe(40)
    expect(veinCap('gather')).toBe(30)
    expect(investVein('gather')).toBe(false)
    // 新主脉 craft 可过 30
    for (let i = 0; i < 35; i += 1) expect(investVein('craft')).toBe(true)
    expect(dongfu.veinPoints.craft).toBe(35)
  })

  it('总容量 100:主脉 70 + 副脉 30 = 100,第 101 点被拒(单点与批量皆拒)', () => {
    const d = useDongfuStore()
    for (let i = 0; i < 70; i += 1) expect(investVein('gather')).toBe(true)
    for (let i = 0; i < 30; i += 1) expect(investVein('craft')).toBe(true)
    expect(d.veinTotal).toBe(100)
    expect(investVein('insight')).toBe(false) // 第 101 点:单点拒
    expect(investVeinBatch('insight')).toBe(0) // 批量一口也开不了
    expect(veinInvestPlan('insight').blocked).toBe('full') // 计划如实报「满却」
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
    for (let i = 0; i < 40; i += 1) investVein('gather') // gather 主脉 40
    expect(veinInvestPlan('craft').points).toBe(30) // 副脉可再注 30
    expect(investVeinBatch('craft')).toBe(30)
    expect(d.veinPoints.craft).toBe(30)
    expect(veinInvestPlan('craft').blocked).toBe('peak') // 已到副脉顶
    expect(investVeinBatch('craft')).toBe(0)
  })

  it('计划按灵石取 floor(灵石/单价),不四舍五入', () => {
    const cost = toNum(veinPointCost())
    useResourcesStore().spiritStone = gn(2.5 * cost) // 2.5 倍单价:floor 2 / round 3
    const plan = veinInvestPlan('gather') // 未定主脉,主脉档 70,总容量空
    expect(plan.blocked).toBeNull()
    expect(plan.points).toBe(2) // floor,不是 round
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
    expect(toNum(useResourcesStore().spiritStone)).toBe(0) // 恰好扣清
  })

  it('迁移费不足:拒绝换主,主脉不动、分文不扣', () => {
    const d = useDongfuStore()
    investVein('gather')
    const cost = toNum(veinSwitchCost())
    useResourcesStore().spiritStone = gn(cost - 1)
    expect(switchMainVein('craft')).toBe(false)
    expect(d.veinMain).toBe('gather')
    expect(toNum(useResourcesStore().spiritStone)).toBe(cost - 1)
  })

})