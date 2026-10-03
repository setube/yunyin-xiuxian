/**
 * 建筑连升 · 批量账
 * buildingBatchPlan 只算不动手(级数受品类满级 / 洞府辖限 / 余额共同约束,
 * 判据与 buildingUpgradeInfo 同源),upgradeBuildingBatch 按计划一次升到位,
 * 扣费/等级与计划一致;一升都升不动(0 级计划)时绝不扣一分。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { add, gn, sub, toNum } from '@/utils/gnum'
import { buildingCost } from './formulas'
import { track } from './progress'
import { buildingBatchPlan, upgradeBuildingBatch } from './buildingService'
import { usePlayerStore } from '@/stores/player'
import { useDongfuStore } from '@/stores/dongfu'
import { useResourcesStore } from '@/stores/resources'
import { useQuestsStore } from '@/stores/quests'
import { buildingDef } from '@/data/buildings'

/** 聚灵阵:costBase 60 / 玄铁 6 / 上限 20 / 炼气即开 */
const ARRAY = buildingDef('array')!

function fund(stone: number, ore = 0): void {
  const r = useResourcesStore()
  r.spiritStone = gn(stone)
  r.ore = ore
}

function seat(major: number, mansion: number): void {
  usePlayerStore().major = major
  useDongfuStore().levels = { ...useDongfuStore().levels, mansion }
}

/** 与 service 同式:第 lv 级的单次成本(吃 formulas.buildingCost,不另抄公式) */
function costOf(lv: number): { stone: ReturnType<typeof buildingCost>; ore: number } {
  return { stone: buildingCost(ARRAY.costBase, lv), ore: ARRAY.costOre * (lv + 1) }
}

/** 从第 from 级起共 n 级的花费累计 */
function sumUpTo(from: number, n: number): { stone: ReturnType<typeof buildingCost>; ore: number } {
  let stone = gn(0)
  let ore = 0
  for (let i = from; i < from + n; i += 1) {
    stone = add(stone, costOf(i).stone)
    ore += costOf(i).ore
  }
  return { stone, ore }
}

describe('建筑连升 · 批量账', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    seat(1, 0) // 炼气、洞府 0 级 → 其余建筑辖限 = (0+1)*5 = 5
    fund(1e12, 1e9)
  })

  it('计划只算不动手:到辖限停(洞府 0 级时聚灵阵只能到 5),花费=各级之和、资源分文未动', () => {
    const before = useResourcesStore().spiritStone
    const plan = buildingBatchPlan('array')
    expect(plan.levels).toBe(5) // min(品类 20, 辖限 5)
    const tot = sumUpTo(0, 5)
    expect(plan.stone).toEqual(tot.stone)
    expect(plan.ore).toBe(tot.ore)
    expect(useResourcesStore().spiritStone).toEqual(before)
  })

  it('洞府自身不受辖限:是它抬别人的档,自己只顶到品类满级 4', () => {
    const plan = buildingBatchPlan('mansion')
    expect(plan.levels).toBe(buildingDef('mansion')!.maxLevel)
    expect(plan.atMax).toBe(true)
  })

  it('洞府抬档:1 级时辖限=10,聚灵阵最多连升到 10;3 级时辖限=20 摸品类上限', () => {
    seat(1, 1)
    expect(buildingBatchPlan('array').levels).toBe(10)
    seat(1, 3)
    const plan = buildingBatchPlan('array')
    expect(plan.levels).toBe(20)
    expect(plan.atMax).toBe(true)
  })

  it('玄铁封顶:只够三层的铁就只升三层,差一块则只升两层(余额限制,不到辖限)', () => {
    const t3 = sumUpTo(0, 3)
    fund(1e12, t3.ore)
    expect(buildingBatchPlan('array').levels).toBe(3)
    fund(1e12, t3.ore - 1)
    expect(buildingBatchPlan('array').levels).toBe(2)
  })

  it('境界闸:未至对应境(0 级连升)带拒因,一升不动', () => {
    seat(0, 0) // 锻器需要筑基
    const plan = buildingBatchPlan('forge')
    expect(plan.levels).toBe(0)
    expect(plan.blocked).toContain('筑基')
  })

  it('至品类满级:0 级计划带圆满拒因', () => {
    useDongfuStore().setLevel('array', 20)
    const plan = buildingBatchPlan('array')
    expect(plan.levels).toBe(0)
    expect(plan.blocked).toContain('层巅')
    expect(plan.atMax).toBe(true)
  })

  it('连升按计划一次到位:等级升到计划数、扣费与计划一致、报实际级', () => {
    // 预热:先前置状态里可自动达成的一次性成就/主线/日课会在「首次 track」时
    // 一起涌入账目(今次实测 +454.86 灵石),把「期初」记在它们落定之后,
    // 连升这一笔才只对得上它自己的总账。
    track('buildingUpgrades', 500) // 一次把建筑系计数带过全部阈值,a_bd10/a_bd40 与成就全发
    const before = useResourcesStore().spiritStone
    const plan = buildingBatchPlan('array')
    const n = upgradeBuildingBatch('array')
    expect(n).toBe(plan.levels)
    expect(useDongfuStore().levels.array).toBe(plan.levels)
    // 账上看少掉的整笔 = 计划总账。用「期初减期末」重建会沾上 ~1e-4 石的浮点尾差
    // (两个 ~1e12 端点相减的 ULP 级抖动,实测 1.1e-4),远小于 1 石的显示粒度:
    // 断言「到显示粒度分毫不差」即可,别去跟 add 的尾数逐比特对齐。
    expect(toNum(sub(before, useResourcesStore().spiritStone))).toBeCloseTo(toNum(plan.stone), 2)
    expect(useResourcesStore().ore).toBe(1e9 - plan.ore)
  })

  it('连升一次计 N 次营建:成就/主线的「累计升级建筑」按实际级数记账,不按批数', () => {
    track('buildingUpgrades', 100) // 先把一次性阈值发走,后面这句才数得准
    const plan = buildingBatchPlan('array')
    upgradeBuildingBatch('array')
    expect(useQuestsStore().counter('buildingUpgrades')).toBe(100 + plan.levels)
  })

  it('一升都升不动(境界闸)时:返回 0,分文不扣、等级不动', () => {
    seat(0, 0)
    const n = upgradeBuildingBatch('forge')
    expect(n).toBe(0)
    expect(useDongfuStore().levels.forge).toBe(0)
    expect(useResourcesStore().ore).toBe(1e9)
  })
})
