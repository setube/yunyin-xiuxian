/** 强化连升 · 批量账:计划只算不扣;连升扣款/记账与计划一致;0 级计划不扣 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { EquipmentInstance, GNum } from '@/types'
import { useInventoryStore } from '@/stores/inventory'
import { useResourcesStore } from '@/stores/resources'
import { useQuestsStore } from '@/stores/quests'
import { useUiStore } from '@/stores/ui'
import { ACHIEVEMENTS } from '@/data/achievements'
import { MAIN_QUESTS } from '@/data/quests'
import { add, gn, sub, toNum } from '@/utils/gnum'
import { upgradeCost } from './formulas'
import { equipLevelCap, equipUpgradeCost, upgradeBatchPlan, upgradeEquipment, upgradeEquipmentBatch, upgradeShortfall } from './forge'

/** 夹具:凡品 rank 0,upgradeCost 只吃 level/tier,折扣恒 0 */
function mk(uid: string, level: number): EquipmentInstance {
  return { uid, templateId: 'b_qingyun', quality: 'mortal', tier: 3, level, affixes: [] }
}

function seat(item: EquipmentInstance): void {
  useInventoryStore().items = [item]
}

function rich(): void {
  const r = useResourcesStore()
  r.dust = 1_000_000_000
  r.spiritStone = gn(1e30)
}

function costOf(lv: number): { dust: number; stone: GNum } {
  return upgradeCost(lv, 3, 0, 0)
}

/** 0..n-1 级成本累计 */
function sumUpTo(n: number): { dust: number; stone: GNum } {
  let dust = 0
  let stone = gn(0)
  for (let i = 0; i < n; i += 1) {
    dust += costOf(i).dust
    stone = add(stone, costOf(i).stone)
  }
  return { dust, stone }
}

describe('强化连升 · 批量账', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('计划只算不动手:到顶时 levels=上限、花费=各级成本之和、资源分文未动', () => {
    seat(mk('a', 0))
    rich()
    const beforeDust = useResourcesStore().dust
    const beforeStone = useResourcesStore().spiritStone
    const plan = upgradeBatchPlan('a')
    const expectTotal = sumUpTo(equipLevelCap())
    expect(plan.levels).toBe(equipLevelCap())
    expect(plan.dust).toBe(expectTotal.dust)
    expect(plan.stone).toEqual(expectTotal.stone)
    expect(plan.atCap).toBe(true)
    expect(useResourcesStore().dust).toBe(beforeDust)
    expect(useResourcesStore().spiritStone).toEqual(beforeStone)
  })

  it('余额恰够两级:levels=2、总花费=前两级之和、atCap=false', () => {
    seat(mk('b', 0))
    const r = useResourcesStore()
    r.dust = costOf(0).dust + costOf(1).dust
    r.spiritStone = gn(1e30)
    const plan = upgradeBatchPlan('b')
    expect(plan.levels).toBe(2)
    expect(plan.dust).toBe(costOf(0).dust + costOf(1).dust)
    expect(plan.stone).toEqual(add(costOf(0).stone, costOf(1).stone))
    expect(plan.atCap).toBe(false)
  })

  it('连一级都不够:levels=0、不标 atCap、零花费', () => {
    seat(mk('c', 0))
    const plan = upgradeBatchPlan('c') // 尘 0
    expect(plan.levels).toBe(0)
    expect(plan.atCap).toBe(false)
    expect(plan.dust).toBe(0)
    expect(plan.stone).toEqual(gn(0))
  })

  /*
   * uid 不在行囊里 —— 界面上的行可能来自过期快照(另一页把装备卖了 / 分解了)。
   * 变异扫描报 `if (!inst) return {...}` 改坏不红:去掉它下一句 `inst.level`
   * 会直接抛 TypeError。同型的判据在 bounty / market 那两路都已经有了。
   */
  it('计划:uid 不在行囊里则给中性计划,不抛也不报「已至上限」', () => {
    seat(mk('only', 0))
    expect(() => upgradeBatchPlan('ghost'), '过期快照算计划不该抛').not.toThrow()
    const plan = upgradeBatchPlan('ghost')
    expect(plan.levels).toBe(0)
    expect(plan.atCap, '不在行囊不是「已至上限」').toBe(false)
    expect(plan.dust).toBe(0)
    expect(plan.stone).toEqual(gn(0))
  })

  it('已至上限:levels=0 且 atCap=true(不是钱不够)', () => {
    seat(mk('d', equipLevelCap()))
    rich()
    const plan = upgradeBatchPlan('d')
    expect(plan.levels).toBe(0)
    expect(plan.atCap).toBe(true)
  })

  it('品质越高每级越贵:同阶同级不同品质,品质线的差价体现在计划里', () => {
    const mortal = mk('m1', 0)
    const excellent: EquipmentInstance = { ...mortal, uid: 'e1', quality: 'excellent' }
    seat(mortal)
    useInventoryStore().items = [mortal, excellent]
    rich()
    const pm = upgradeBatchPlan('m1')
    const pe = upgradeBatchPlan('e1')
    expect(pe.dust).toBeGreaterThan(pm.dust)
  })

  it('批量执行:一次升到位,扣款/记账与计划一致,返回升级数', () => {
    seat(mk('e', 0))
    const r = useResourcesStore()
    r.dust = costOf(0).dust + costOf(1).dust
    r.spiritStone = gn(1e30)
    const n = upgradeEquipmentBatch('e')
    expect(n).toBe(2)
    const inst = useInventoryStore().findItem('e')!
    expect(inst.level).toBe(2)
    expect(inst.invested!.dust).toBe(costOf(0).dust + costOf(1).dust)
    expect(r.dust).toBe(0)
  })

  it('批量执行:升不动时不扣一分、level 不动、返回 0', () => {
    seat(mk('f', 0))
    const r = useResourcesStore()
    r.dust = 0
    r.spiritStone = gn(0)
    expect(upgradeEquipmentBatch('f')).toBe(0)
    expect(useInventoryStore().findItem('f')!.level).toBe(0)
    expect(r.dust).toBe(0)
  })

  it('缺料写实际差额:只差一点时不是报总价', () => {
    seat(mk('g', 0))
    const r = useResourcesStore()
    const cost = costOf(0)
    r.dust = Math.max(0, cost.dust - 2)
    r.spiritStone = sub(cost.stone, gn(7))
    const gap = upgradeShortfall(cost)
    expect(gap.dust).toBe(2)
    expect(toNum(gap.stone)).toBeCloseTo(7, 6)
  })
})

describe('炼器 · 单步强化(upgradeEquipment)边界', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('成功:升一级、精确扣 dust+stone、invested 累计(分解八成返还的账本)', () => {
    seat(mk('a', 0))
    // 预先结清成就/主线:首次强化成就赏 24 石会混进差额
    useQuestsStore().$patch({ achieved: ACHIEVEMENTS.map(a => a.id), mainIdx: MAIN_QUESTS.length - 1 })
    // 灵石用 1e6:1e30 下 65 石成本被浮点精度吞掉
    const r = useResourcesStore()
    r.dust = 1_000_000
    r.spiritStone = gn(1_000_000)
    const d0 = r.dust
    const s0 = { ...r.spiritStone }
    // 预期取 equipUpgradeCost(含当前 forgeDiscount),不手写 discount=0
    const cost = equipUpgradeCost('a')!
    expect(upgradeEquipment('a')).toBe(true)
    const item = useInventoryStore().findItem('a')!
    expect(item.level).toBe(1)
    expect(r.dust).toBe(d0 - cost.dust)
    expect(toNum(sub(s0, r.spiritStone))).toBeCloseTo(toNum(cost.stone), 6)
    expect(item.invested?.dust).toBe(cost.dust)
    expect(toNum(item.invested?.stone ?? gn(0))).toBeCloseTo(toNum(cost.stone), 6)
  })

  it('到顶:返回 false、level 不动、分文不扣', () => {
    seat(mk('a', equipLevelCap()))
    rich()
    const r = useResourcesStore()
    const d0 = r.dust
    const s0 = { ...r.spiritStone }
    expect(upgradeEquipment('a')).toBe(false)
    expect(useInventoryStore().findItem('a')!.level).toBe(equipLevelCap())
    expect(r.dust).toBe(d0)
    expect(r.spiritStone).toEqual(s0)
  })

  it('未知 uid:返回 false、无副作用', () => {
    rich()
    const r = useResourcesStore()
    const d0 = r.dust
    expect(upgradeEquipment('ghost')).toBe(false)
    expect(r.dust).toBe(d0)
  })

  it('器灵尘不足:不扣、level 不动', () => {
    seat(mk('a', 0))
    const cost = costOf(0)
    const r = useResourcesStore()
    r.dust = cost.dust - 1 // 差 1 尘
    r.spiritStone = gn(1e30)
    const d0 = r.dust
    expect(upgradeEquipment('a')).toBe(false)
    expect(useInventoryStore().findItem('a')!.level).toBe(0)
    expect(r.dust).toBe(d0)
    expect(useUiStore().toasts.at(-1)?.text).toContain('尚差 1')
  })

  it('灵石不足:不扣、level 不动', () => {
    seat(mk('a', 0))
    const cost = costOf(0)
    const r = useResourcesStore()
    r.dust = 1_000_000_000
    r.spiritStone = sub(cost.stone, gn(1)) // 差 1 灵石
    const d0 = r.dust
    const s0 = { ...r.spiritStone }
    expect(upgradeEquipment('a')).toBe(false)
    expect(useInventoryStore().findItem('a')!.level).toBe(0)
    expect(r.dust).toBe(d0)
    expect(r.spiritStone).toEqual(s0)
    expect(useUiStore().toasts.at(-1)?.text).toContain('尚差 1')
  })
})

describe('强化 · 材料差额钳制', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /*
   * 差额必须钳到 0:器灵尘多过所需时,负差额会一路印成「器灵尘尚差 -900」。
   */
  it('器灵尘多于所需:差额为 0,不出负数', () => {
    const r = useResourcesStore()
    r.dust = 100
    expect(upgradeShortfall({ dust: 50, stone: { m: 1, e: 0 } }).dust, '多于所需应为 0').toBe(0)
    expect(upgradeShortfall({ dust: 500, stone: { m: 1, e: 0 } }).dust, '少于所需应为差值').toBe(400)
  })
})
