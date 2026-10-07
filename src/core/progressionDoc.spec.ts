/**
 * 数值体系说明与真实公式同源(防「文案说谎」)
 *
 * 界面里的「每境 ×N」必须就是公式里的 N。这条不看文档写了什么,
 * 而是拿公式真算一遍比值,再与文档字段对照 —— 改常数忘了改文案,这里立刻红。
 */
import { describe, expect, it } from 'vitest'
import {
  COST_CURVES,
  LIFESPAN_CURVES,
  PROGRESSION_AXES,
  PROGRESSION_NOTES,
  MORTAL_TIME_PER_MAJOR,
  OUTER_TIME_PER_MAJOR,
  SORCERY_LAYERS,
  SORCERY_SUMMARY
} from '@/data/progressionDoc'
import { CHANGING_TIERS, DIVINATION_COST } from './divination'
import { MANSION_EVENT_LUCK } from '@/data/constants'
import { GATES } from '@/data/qimen'
import { MANSIONS, IMAGES } from '@/data/xiangxiu'
import { PALACES, STARS } from '@/data/ziwei'
import { HEXAGRAMS, TRIGRAMS } from '@/data/yijing'
import { baseCultPerSec, buildingCost, expRequirement, gongfaUpCost, qiCap, realmScale, stoneByTier, upgradeCost } from './formulas'
import { MAX_MAJOR, WORLD_BREAK_MAJOR } from '@/data/realms'
import { toNum } from '@/utils/gnum'
import { LIFESPAN_WORLDS, REALMS, lifespanOf } from '@/data/realms'

const axis = (id: string) => PROGRESSION_AXES.find(a => a.id === id)!

describe('数值体系说明 · 与公式同源', () => {
  it('人间界各轴:文档倍率 = 公式实际环比', () => {
    // 0→1 大境界(第一境无小层差)
    const exp = toNum(expRequirement(1, 0)) / toNum(expRequirement(0, 0))
    const qi = qiCap(1, 0) / qiCap(0, 0)
    const atk = toNum(realmScale(1, 0)) / toNum(realmScale(0, 0))
    expect(exp).toBeCloseTo(axis('exp').mortal, 5)
    expect(qi).toBeCloseTo(axis('qiCap').mortal, 5)
    expect(atk).toBeCloseTo(axis('attack').mortal, 5)
  })

  it('界外各轴:文档倍率 = 公式实际环比', () => {
    for (let m = WORLD_BREAK_MAJOR + 1; m <= MAX_MAJOR; m += 1) {
      const exp = toNum(expRequirement(m, 0)) / toNum(expRequirement(m - 1, 0))
      const qi = qiCap(m, 0) / qiCap(m - 1, 0)
      const atk = toNum(realmScale(m, 0)) / toNum(realmScale(m - 1, 0))
      const speed = baseCultPerSec(m, 0) / baseCultPerSec(m - 1, 0)
      expect(exp, `m=${m} 修为环比与文档不符`).toBeCloseTo(axis('exp').outer, 5)
      expect(qi, `m=${m} 灵气容量环比与文档不符`).toBeCloseTo(axis('qiCap').outer, 4)
      expect(atk, `m=${m} 战力环比与文档不符`).toBeCloseTo(axis('attack').outer, 5)
      expect(speed, `m=${m} 修速环比与文档不符`).toBeCloseTo(axis('qiRegen').outer, 5)
    }
  })

  it('净耗时倍率 = 修为需求 / 修速(文档口径成立)', () => {
    const outer = toNum(expRequirement(MAX_MAJOR, 0)) / toNum(expRequirement(MAX_MAJOR - 1, 0))
    const speed = baseCultPerSec(MAX_MAJOR, 0) / baseCultPerSec(MAX_MAJOR - 1, 0)
    expect(OUTER_TIME_PER_MAJOR).toBeCloseTo(outer / speed, 5)
    expect(MORTAL_TIME_PER_MAJOR).toBeGreaterThan(1)
    // 界外的「数值」按指数堆叠,「耗时」明显更缓 —— 这正是设计的分工
    expect(axis('exp').outer).toBeGreaterThan(OUTER_TIME_PER_MAJOR * 2)
  })

  it('说明里的固定口径指向真实常量(仙界门槛 / 天劫封顶)', () => {
    expect(PROGRESSION_NOTES.worldBreakMajor).toBe(WORLD_BREAK_MAJOR)
    expect(PROGRESSION_NOTES.tribulationCapMajor).toBeGreaterThan(0)
    expect(PROGRESSION_NOTES.banking.length).toBeGreaterThanOrEqual(3)
    expect(PROGRESSION_NOTES.basis.length).toBe(4)
    expect(PROGRESSION_NOTES.breakthrough.length).toBeGreaterThanOrEqual(3)
    // 天劫口径里点名的封顶境界,必须就是 constants 里那一个
    expect(PROGRESSION_NOTES.breakthrough[1]).toContain(REALMS[PROGRESSION_NOTES.tribulationCapMajor]!.name)
  })

  it('花费曲线同样是复利,且文档倍率 = 公式实际环比', () => {
    const curve = (id: string) => COST_CURVES.find(c => c.id === id)!

    // 洞府建筑:每级灵石 ×BUILDING_COST_GROWTH
    const b = toNum(buildingCost(100, 5)) / toNum(buildingCost(100, 4))
    expect(b).toBeCloseTo(curve('building').growth, 5)

    // 功法参悟:每层悟道点 ×GONGFA_UP_GROWTH(取整,故给 2% 相对容差)
    const g = gongfaUpCost(4, 5) / gongfaUpCost(4, 4)
    expect(Math.abs(g - curve('gongfa').growth) / curve('gongfa').growth).toBeLessThan(0.02)

    // 装备强化:每级器灵尘 ×UPGRADE_DUST_GROWTH(品质系数同级相消;取整,给 2% 容差)
    const u = upgradeCost(5, 10, 3, 0).dust / upgradeCost(4, 10, 3, 0).dust
    expect(Math.abs(u - curve('equipLevel').growth) / curve('equipLevel').growth).toBeLessThan(0.02)

    // 灵石掉落:每层 ×STONE_TIER_GROWTH
    const s = toNum(stoneByTier(11, 10)) / toNum(stoneByTier(10, 10))
    expect(s).toBeCloseTo(curve('stoneTier').growth, 5)
  })

  it('寿元曲线与 realms 数据同源,且每境至少翻倍', () => {
    // 说明里的每条曲线都对应真实界域配置
    expect(LIFESPAN_CURVES.length).toBe(4)
    for (const c of LIFESPAN_CURVES) {
      const w = Object.values(LIFESPAN_WORLDS).find(x => x.growth === c.growth && x.base === c.base)
      expect(w, `${c.world} 的寿元配置在 LIFESPAN_WORLDS 中找不到`).toBeDefined()
    }
    for (let m = 0; m < REALMS.length; m += 1) {
      expect(REALMS[m]!.lifespanYears, `${REALMS[m]!.name} 寿元与公式不符`).toBe(lifespanOf(m))
      if (m > 0) {
        expect(REALMS[m]!.lifespanYears).toBeGreaterThanOrEqual(REALMS[m - 1]!.lifespanYears * 2)
      }
    }
  })
})

describe('数值体系说明 · 术数四门不撒谎', () => {
  const layer = (id: string) => SORCERY_LAYERS.find(s => s.id === id)!

  it('四门齐备,且分属四种节奏(一时/一世/日更/一趟)', () => {
    expect(SORCERY_LAYERS.map(s => s.id).sort()).toEqual(['gong', 'men', 'ming', 'xiang'])
    for (const s of SORCERY_LAYERS) {
      expect(s.name.length).toBeGreaterThan(2)
      expect(s.cadence.length, `${s.name} 没说清节奏`).toBeGreaterThan(2)
      expect(s.cost.length, `${s.name} 没说清代价`).toBeGreaterThan(1)
      expect(s.note.length, `${s.name} 没说明分工`).toBeGreaterThan(6)
    }
  })

  it('问卦一栏的数字就是问卦模块的数字', () => {
    const gong = layer('gong')
    expect(gong.cost).toContain(String(DIVINATION_COST))
    expect(gong.cadence).toContain(String(CHANGING_TIERS[0]!.minutes))
    expect(gong.cadence).toContain(String(CHANGING_TIERS[CHANGING_TIERS.length - 1]!.minutes))
    expect(gong.note).toContain(String(TRIGRAMS.length))
    expect(gong.note).toContain(String(HEXAGRAMS.length))
  })

  it('命格一栏的宫星之数就是紫微模块的数字', () => {
    const ming = layer('ming')
    expect(ming.note).toContain(String(PALACES.length))
    expect(ming.note).toContain(String(STARS.length))
  })

  it('星象一栏的轮值与加成就是星象模块的数字', () => {
    const xiang = layer('xiang')
    expect(xiang.cadence).toContain(String(MANSIONS.length))
    expect(xiang.cadence).toContain(String(IMAGES.length))
    expect(xiang.note).toContain(String(Math.round(MANSION_EVENT_LUCK * 100)))
  })

  it('奇门一栏的门数就是八门之数,且说明里点明不碰道源倍数', () => {
    const men = layer('men')
    expect(men.note).toContain(String(GATES.length))
    expect(men.note).toContain('道源')
  })

  it('总纲把五层各占一层说清楚(不是一锅加成)', () => {
    for (const word of ['天时', '星象', '问卦', '命格', '择门']) {
      expect(SORCERY_SUMMARY, `总纲漏了${word}`).toContain(word)
    }
  })
})
