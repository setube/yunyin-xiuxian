/**
 * 灵草五品 —— 品阶换算口 / 购价阶梯 / 配方品阶一致性 / 「低阶草炼高阶丹」红线 / 旧档迁移
 */
import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  HERB_GRADES,
  HERB_GRADE_BANDS,
  HERB_GRADE_NAMES,
  HERB_GRADE_SHORT,
  HERB_GROUND_PRICE,
  HERB_RARITY_GROWTH,
  herbBuyPrice,
  herbGradeBandLabel,
  herbGradeOfMajor,
  isHerbGrade
} from './herbGrades'
import { MAX_MAJOR, REALMS } from './realms'
import { PILLS } from './pills'
import { pillCraftCost } from '@/core/pillService'
import { useResourcesStore } from '@/stores/resources'
import { migrateHerbSlice } from '@/utils/storage'

describe('灵草 · 品阶与境界的换算口', () => {
  it('五品齐全,各品都有全名与短名', () => {
    expect(HERB_GRADES).toEqual([1, 2, 3, 4, 5])
    for (const g of HERB_GRADES) {
      expect(HERB_GRADE_NAMES[g], `${g} 缺全名`).toBeTruthy()
      expect(HERB_GRADE_SHORT[g], `${g} 缺短名`).toBeTruthy()
    }
  })

  it('换算口随大境界单调不降,五档各安其界', () => {
    // 人间界前中两品、仙界仙品、神界神品、混沌海道品
    expect(herbGradeOfMajor(0)).toBe(1)
    expect(herbGradeOfMajor(4)).toBe(1)
    expect(herbGradeOfMajor(5)).toBe(2)
    expect(herbGradeOfMajor(8)).toBe(2)
    expect(herbGradeOfMajor(9)).toBe(3)
    expect(herbGradeOfMajor(13)).toBe(3)
    expect(herbGradeOfMajor(14)).toBe(4)
    expect(herbGradeOfMajor(17)).toBe(4)
    expect(herbGradeOfMajor(18)).toBe(5)
    expect(herbGradeOfMajor(MAX_MAJOR)).toBe(5)
    // 越界夹回
    expect(herbGradeOfMajor(-5)).toBe(1)
    expect(herbGradeOfMajor(999)).toBe(5)
    // 单调:逐境不应回落
    let prev = 0
    for (let m = 0; m <= MAX_MAJOR; m += 1) {
      const g = herbGradeOfMajor(m)
      expect(g, `第 ${m} 境品阶不应低于前一境`).toBeGreaterThanOrEqual(prev)
      expect(HERB_GRADES).toContain(g)
      prev = g
    }
  })

  it('五档覆盖全部大境界,无空隙无重叠', () => {
    const covered: number[] = []
    for (const [from, to, grade] of HERB_GRADE_BANDS) {
      expect(isHerbGrade(grade)).toBe(true)
      expect(to).toBeGreaterThanOrEqual(from)
      for (let m = from; m <= to; m += 1) covered.push(m)
    }
    const uniq = new Set(covered)
    const majors = new Set(Array.from({ length: MAX_MAJOR + 1 }, (_, i) => i))
    for (const m of majors) expect(uniq.has(m), `第 ${m} 境不在任何品档内`).toBe(true)
    for (const m of uniq) expect(majors.has(m), `品档含非法大境界 ${m}`).toBe(true)
  })

  it('品档标签由同一张表反查,不新起第二张分档表', () => {
    const [from, to, grade] = HERB_GRADE_BANDS[0]!
    const label = herbGradeBandLabel(grade)
    expect(label).toContain(REALMS[from]!.name)
    expect(label).toContain(REALMS[to]!.name)
  })
})

describe('灵草 · 购价阶梯(锚价 ×10 品距)', () => {
  it('凡品即锚价,每一品贵十倍,道品封顶一千万', () => {
    expect(herbBuyPrice(1)).toBe(HERB_GROUND_PRICE)
    // 阶梯恰是锚价 × 10^品距:凡品 1000 → 道品 1000 万
    for (const g of HERB_GRADES) {
      expect(herbBuyPrice(g), `第 ${g} 品 = 锚价 ×10^品距`).toBe(HERB_GROUND_PRICE * HERB_RARITY_GROWTH ** (g - 1))
    }
  })
})

describe('灵草 · isHerbGrade 守卫', () => {
  it('只收 1~5;其余一律拒', () => {
    for (const g of HERB_GRADES) expect(isHerbGrade(g)).toBe(true)
    for (const bad of [0, 6, -1, '3', null, undefined, {}, Number.NaN]) expect(isHerbGrade(bad)).toBe(false)
  })
})

describe('灵草 · 配方品阶与丹出处一致(炼丹消费口径)', () => {
  it('每张方子要的草,品阶取丹的准入境界', () => {
    setActivePinia(createPinia())
    for (const p of PILLS) {
      if (!p.recipe) continue
      const cost = pillCraftCost(p.id)!
      expect(cost.grade, `${p.name} 方子品阶应与出身境界一致`).toBe(herbGradeOfMajor(p.minRealm))
      expect(cost.herb).toBe(p.recipe.herb)
    }
  })

  it('红线:新手村的凡品草,炼不了混沌道的道品丹', () => {
    setActivePinia(createPinia())
    const resources = useResourcesStore()
    // 道祖丹出身混沌海(20 境),只认道品(5)
    const daoZhu = PILLS.find(p => p.id === 'p_daozu')!
    const daoTier = herbGradeOfMajor(daoZhu.minRealm)
    expect(daoTier).toBe(5)
    // 凡品(1)远比道品(5)低,给满凡品也填不了道品的坑
    resources.herbByGrade[1] = 1_000_000
    expect(resources.hasHerb(5, daoZhu.recipe!.herb), '低阶草不得顶替高阶草').toBe(false)
    expect(resources.hasHerb(1, daoZhu.recipe!.herb)).toBe(true)
    // 反向:道品草能喂道品丹
    resources.herbByGrade[5] = 1_000_000
    expect(resources.hasHerb(5, daoZhu.recipe!.herb)).toBe(true)
  })
})

describe('灵草 · 旧档迁移不丢草', () => {
  it('旧档单标量 herb 统一落凡品(品 1)分账,不丢草、幂等', () => {
    const hg = (res: Record<string, unknown>): Record<string, number> => res.herbByGrade as Record<string, number>
    // 混沌海(20 境)玩家:40 株旧草 → 仍落凡品账(迁移统一凡品,不随境界折算)
    const migrated = migrateHerbSlice({ herb: 40, ore: 7 }, 20)
    expect(hg(migrated)).toEqual({ 1: 40, 2: 0, 3: 0, 4: 0, 5: 0 })
    expect('herb' in migrated).toBe(false)
    // 已有分账且无残留标量:原样返回,不重复折算
    const already = migrateHerbSlice({ herbByGrade: { 1: 0, 2: 0, 3: 5, 4: 0, 5: 0 }, ore: 1 }, 20)
    expect(already).toEqual({ herbByGrade: { 1: 0, 2: 0, 3: 5, 4: 0, 5: 0 }, ore: 1 })
    // 标量 + 分账并存(迁移中断的怪档):并账不丢,标量部分并入凡品账
    const both = migrateHerbSlice({ herbByGrade: { 1: 0, 2: 0, 3: 5, 4: 0, 5: 0 }, herb: 3 }, 5)
    expect(hg(both)[1]).toBe(3) // 标量旧草并入凡品账(品 1)
    expect(hg(both)[3]).toBe(5) // 原有仙品账不动
    // 坏档非数值标量:当 0,不崩
    const junk = migrateHerbSlice({ herb: 'abc' }, 0)
    expect(hg(junk)[1]).toBe(0)
  })
})
