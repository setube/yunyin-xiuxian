import { describe, expect, it } from 'vitest'
import { mulberry32, RandomService } from '@/utils/random'
import { QUALITIES, qualityDef } from '@/data/qualities'
import { AFFIX_RARITY_RANK, affixDef } from '@/data/affixes'
import { equipmentTemplate } from '@/data/equipment'
import { EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { isZero, toNum } from '@/utils/gnum'
import { generateEquipment, resolveEquipStats, rollQuality, qualityWeightAt, sortAffixLines } from './equipGen'
import type { EquipmentInstance, QualityId } from '@/types'

const seeded = (seed = 42): RandomService => new RandomService(mulberry32(seed))

describe('装备生成', () => {
  it('品质下限约束生效', () => {
    const rng = seeded(1)
    for (let i = 0; i < 50; i += 1) {
      const q = rollQuality(3, rng, { minQualityRank: 3 })
      expect(q.rank).toBeGreaterThanOrEqual(3)
    }
  })

  it('高层级更容易出高品质(统计性)', () => {
    const low = seeded(7)
    const high = seeded(7)
    let lowSum = 0
    let highSum = 0
    for (let i = 0; i < 400; i += 1) {
      lowSum += rollQuality(1, low).rank
      highSum += rollQuality(18, high).rank
    }
    expect(highSum).toBeGreaterThan(lowSum)
  })

  it('词条数量符合品质区间且不重复', () => {
    const rng = seeded(99)
    for (let i = 0; i < 60; i += 1) {
      const inst = generateEquipment(8, rng)
      const q = qualityDef(inst.quality)
      expect(inst.affixes.length).toBeGreaterThanOrEqual(0)
      expect(inst.affixes.length).toBeLessThanOrEqual(q.affixes[1])
      const ids = inst.affixes.map(a => a.id)
      expect(new Set(ids).size).toBe(ids.length)
      // 词条槽位与品质门槛合法
      for (const a of inst.affixes) {
        const def = affixDef(a.id)!
        const tpl = equipmentTemplate(inst.templateId)!
        if (def.slots) expect(def.slots).toContain(tpl.slot)
        if (def.minRank !== undefined) expect(q.rank).toBeGreaterThanOrEqual(def.minRank)
      }
    }
  })

  /**
   * 手枪判据(Phase 37):品质是**强度阶梯**,不是标签。
   *
   * 一个五阶神品该打得过一个七阶地品 —— 就像拿手枪的现代人打得过古代名将。
   * 难度由获取概率承担(见「神品不在 24 阶前现世」),不是由削弱强度承担。
   * 实测:5 阶神品 ÷ 7 阶 = 凡 14.0 / 灵 4.5 / 玄 2.6 / 地 1.67 / 天 0.98。
   */
  it('品质是强度阶梯:五阶神品压得过七阶玄品、地品', () => {
    // 判据落在**平铺**上(品质阶梯就是它);条数那一层由上一条用例守着。
    // 直接按模板构造实例,不经随机:这一条要问的是「阶梯有多陡」,不是「掷得准不准」
    const at = (tier: number, quality: QualityId): number => {
      const tpl = EQUIPMENT_TEMPLATES.find(t => t.slot === 'weapon' && t.tier === tier)!
      return toNum(resolveEquipStats({ uid: 'x', templateId: tpl.id, quality, tier, level: 0, affixes: [] }).flats.attack)
    }
    expect(at(5, 'divine')).toBeGreaterThan(at(7, 'profound'))
    expect(at(5, 'divine')).toBeGreaterThan(at(7, 'earth'))
    // 五阶神品仍打不过七阶天品:再往上就是品质完全主导(每档 ×1.9),故停在 ×1.8
    expect(at(7, 'heaven')).toBeGreaterThan(at(5, 'divine'))
  })

  /**
   * 品质对话:词条**上限**必须一档比一档高。
   *
   * 从前精品 [2,2]、地品 [4,4]、神品 [6,6] 各自把上下限锁死在同一档,
   * 于是玄品 [3,4] 与地品 [4,4] 的上限都是 4 —— 玩家一路穿到中后期,
   * 看到的「条数上限」都卡在四条,品质再高也不多给一条。
   * 判据钉住两件事:上限严格递增(= rank + 1),下限不回落(不让任何一档的保底变差)。
   */
  it('品质越高,词条上限越高(严格递增,下限不回落)', () => {
    expect(QUALITIES.map(q => q.affixes[1])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    for (let i = 0; i < QUALITIES.length; i += 1) {
      const q = QUALITIES[i]!
      expect(q.affixes[1], `${q.name} 的上限应是 rank + 1`).toBe(q.rank + 1)
      expect(q.affixes[0], `${q.name} 的下限不该超过上限`).toBeLessThanOrEqual(q.affixes[1])
      if (i > 0) {
        const prev = QUALITIES[i - 1]!
        expect(q.affixes[0], `${q.name} 的下限不该低于 ${prev.name}`).toBeGreaterThanOrEqual(prev.affixes[0])
      }
    }
  })

  it('指定槽位生成', () => {
    const rng = seeded(5)
    for (let i = 0; i < 20; i += 1) {
      const inst = generateEquipment(4, rng, { slot: 'weapon' })
      expect(equipmentTemplate(inst.templateId)?.slot).toBe('weapon')
    }
  })

  it('数值解析:强化提升基础属性', () => {
    const rng = seeded(11)
    const inst = generateEquipment(3, rng, { slot: 'weapon' })
    const before = resolveEquipStats(inst)
    const after = resolveEquipStats({ ...inst, level: 5 })
    expect(isZero(before.flats.attack)).toBe(false)
    expect(after.flats.attack.m * Math.pow(10, after.flats.attack.e - before.flats.attack.e)).toBeGreaterThan(before.flats.attack.m)
    expect(after.affixLines.length).toBe(inst.affixes.length)
  })

  /**
   * 词条展示序 —— 掷出的顺序是随机的,照着印等于把「哪条要紧」交给运气。
   * 判据:先稀有的(传世→常见),同稀有度先看掷得满的;一条不丢、一条不重。
   */
  it('词条按稀有度与成色排序,而不是掷出的先后', () => {
    const inst: EquipmentInstance = {
      uid: 'u-sort',
      templateId: 'w_xuantie',
      quality: 'heaven',
      tier: 6,
      level: 0,
      // 故意把常见词条放在最前、传世词条放在最后,且常见那条掷得更满
      affixes: [
        { id: 'pen1', roll: 1 }, // 稀有
        { id: 'atk2', roll: 0.2 }, // 稀有,掷得不满
        { id: 'pen3', roll: 0 } // 传世
      ]
    }
    const lines = resolveEquipStats(inst).affixLines
    expect(lines.map(l => l.id)).toEqual(['pen3', 'pen1', 'atk2'])
    for (const l of lines) expect(l.rarity).toBe(affixDef(l.id)!.rarity)
  })

  it('排序不丢不重,且稀有度确实单调不升', () => {
    const rng = seeded(2026)
    for (let i = 0; i < 60; i += 1) {
      const inst = generateEquipment(4 + (i % 12), rng, { minQualityRank: 4 })
      const lines = resolveEquipStats(inst).affixLines
      expect(new Set(lines.map(l => l.id)), '排序不该改变词条集合').toEqual(new Set(inst.affixes.map(a => a.id)))
      for (let k = 1; k < lines.length; k += 1) {
        const prev = AFFIX_RARITY_RANK[lines[k - 1]!.rarity]
        const cur = AFFIX_RARITY_RANK[lines[k]!.rarity]
        expect(prev, `第 ${k} 条比前一条更稀有,排序没生效`).toBeGreaterThanOrEqual(cur)
      }
    }
  })

  it('同稀有度按成色降序,而 sortAffixLines 不改动入参', () => {
    const rolls = [
      { id: 'atk2', roll: 0.2 },
      { id: 'def2', roll: 0.9 }
    ]
    expect(sortAffixLines(rolls).map(r => r.id)).toEqual(['def2', 'atk2'])
    expect(rolls.map(r => r.id), '排序函数不该就地改数组').toEqual(['atk2', 'def2'])
  })
})

describe('掉落品质 · luck 边界(负幸运不崩、不产 NaN)', () => {
  it('luck=0 基线:每一档品质的权重都有限且为正', () => {
    for (const q of QUALITIES) {
      const w = qualityWeightAt(q, 1, {})
      expect(Number.isFinite(w), `${q.id} 权重 NaN/∞`).toBe(true)
      expect(w, `${q.id} 权重应>0`).toBeGreaterThan(0)
    }
  })

  it('负幸运(谨慎灵兽这种 dropLuck=-0.02 向下放大):凡品权重仍>0,稀有权重有限(允许≤0,但绝不 NaN/∞)', () => {
    for (const q of QUALITIES) {
      const w = qualityWeightAt(q, 1, { luck: -0.1 })
      expect(Number.isFinite(w), `${q.id} 负幸运权重 NaN/∞`).toBe(true)
      if (q.rank === 0) expect(w, '凡品不吃 luck,恒为正').toBeGreaterThan(0)
    }
  })

  it('强烈负幸运:稀有全部摊成 0 → rollQuality 仍稳稳掷回凡品(不崩、无 NaN)', () => {
    // luck=-10 让 1+luck*(0.5/1.5) << 0,稀有权重被 weighted 钳到 0,只剩凡品可掷
    const q = rollQuality(1, seeded(7), { luck: -10 })
    expect(q).toBeDefined()
    expect(Number.isFinite(q.id.length)).toBe(true)
    expect(qualityDef(q.id)).toBeDefined()
    expect(q.rank, '强负幸运应稳定给凡品(common 恒可掷)').toBe(0)
  })
})
