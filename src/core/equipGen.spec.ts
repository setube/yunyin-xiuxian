import { describe, expect, it } from 'vitest'
import { mulberry32, RandomService } from '@/utils/random'
import { QUALITIES, qualityDef } from '@/data/qualities'
import { AFFIX_RARITY_RANK, AFFIXES, affixDef, affixFitBlock } from '@/data/affixes'
import { equipmentTemplate } from '@/data/equipment'
import { EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { maxTierForMajor } from '@/data/regions'
import { MAX_MAJOR } from '@/data/realms'
import { isZero, toNum } from '@/utils/gnum'
import { generateEquipment, resolveEquipStats, rollQuality, qualityWeightAt, sortAffixLines } from './equipGen'
import { budgetOfMods } from './ruleBudget'
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
      for (const a of inst.affixes) {
        const def = affixDef(a.id)!
        const tpl = equipmentTemplate(inst.templateId)!
        if (def.slots) expect(def.slots).toContain(tpl.slot)
        if (def.minRank !== undefined) expect(q.rank).toBeGreaterThanOrEqual(def.minRank)
      }
    }
  })

  /** 品质是强度阶梯,难度由获取概率承担;实测 5 阶神品 ÷ 7 阶:玄 2.40 / 地 1.45 / 天 0.85 */
  it('品质是强度阶梯:五阶神品压得过七阶玄品、地品', () => {
    // 只看平铺、不经随机;词条数另有用例守
    const at = (tier: number, quality: QualityId): number => {
      const tpl = EQUIPMENT_TEMPLATES.find(t => t.slot === 'weapon' && t.tier === tier)!
      return toNum(resolveEquipStats({ uid: 'x', templateId: tpl.id, quality, tier, level: 0, affixes: [] }).flats.attack)
    }
    expect(at(5, 'divine')).toBeGreaterThan(at(7, 'profound'))
    expect(at(5, 'divine')).toBeGreaterThan(at(7, 'earth'))
    // 五阶神品仍不及七阶天品:每档陡到 ×1.94 即反超,故停在 ×1.8
    expect(at(7, 'heaven')).toBeGreaterThan(at(5, 'divine'))
  })

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

  it('词条按稀有度与成色排序,而不是掷出的先后', () => {
    const inst: EquipmentInstance = {
      uid: 'u-sort',
      templateId: 'w_xuantie',
      quality: 'heaven',
      tier: 6,
      level: 0,
      affixes: [
        { id: 'pen1', roll: 1 }, // 稀有
        { id: 'atk2', roll: 0.2 }, // 稀有
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
    // luck=-10 时稀有权重为负,被 weighted 钳到 0,只剩凡品
    const q = rollQuality(1, seeded(7), { luck: -10 })
    expect(q).toBeDefined()
    expect(Number.isFinite(q.id.length)).toBe(true)
    expect(qualityDef(q.id)).toBeDefined()
    expect(q.rank, '强负幸运应稳定给凡品(common 恒可掷)').toBe(0)
  })
})

describe('装备生成 · 词条值有限性(跨阶/幸运清扫:生成永不产 NaN·越界 roll)', () => {
  it('遍历阶×品质×幸运:每个词条 roll∈[0,1] 且有限,mods 全有限,词条预算有限非负', () => {
    const tiers = [1, 6, 12, 20, 30, 40]
    const ranks = [0, 3] as const
    const lucks = [-0.1, 0, 0.5] as const
    for (const tier of tiers) {
      for (const rank of ranks) {
        for (const luck of lucks) {
          const inst = generateEquipment(tier, seeded(tier * 100 + rank * 10 + (luck < 0 ? 1 : luck === 0 ? 2 : 3)), {
            minQualityRank: rank,
            luck
          })
          for (const aff of inst.affixes) {
            expect(Number.isFinite(aff.roll), `tier=${tier} rank=${rank} luck=${luck} roll NaN/∞`).toBe(true)
            expect(aff.roll >= 0 && aff.roll <= 1, `tier=${tier} rank=${rank} luck=${luck} roll=${aff.roll} 越界`).toBe(true)
          }
          const res = resolveEquipStats(inst)
          for (const [k, v] of Object.entries(res.mods)) {
            expect(Number.isFinite(v as number), `tier=${tier} mod ${k}=${v} NaN/∞`).toBe(true)
          }
          const budget = budgetOfMods(res.mods)
          expect(Number.isFinite(budget) && budget >= 0, `tier=${tier} budget=${budget}`).toBe(true)
        }
      }
    }
  })
})

describe('饰品专属战斗词缀(B-1)', () => {
  const J_SLOTS = ['necklace', 'ring', 'talisman'] as const
  const NOT_J = ['weapon', 'head', 'body', 'wrist', 'belt', 'boots'] as const

  it("J 专属战斗词缀经 affixFitBlock:J 槽可落、非 J 槽一律被 'slot' 挡住", () => {
    const combat = AFFIXES.filter(a => /^dgj|^lsj/.test(a.id))
    expect(combat.length, '应有 J 专属战斗词缀线').toBeGreaterThan(0)
    for (const def of combat) {
      for (const slot of J_SLOTS) {
        expect(affixFitBlock(def, slot, 8), `${def.id} 应能上 ${slot}`).toBeNull()
      }
      for (const slot of NOT_J) {
        expect(affixFitBlock(def, slot, 8), `${def.id} 不该上 ${slot}`).toBe('slot')
      }
    }
  })

  it('饰品槽能掷出专属战斗词缀 —— 挂件不再是纯运气饰物', () => {
    const ids = new Set(AFFIXES.filter(a => /^dgj|^lsj/.test(a.id)).map(a => a.id))
    const hit = new Set<string>()
    for (const slot of J_SLOTS) {
      for (let i = 0; i < 400; i += 1) {
        const inst = generateEquipment(20, seeded(9917 + slot.length * 700 + i), { slot })
        for (const a of inst.affixes) if (ids.has(a.id)) hit.add(a.id)
      }
    }
    expect(hit.size, '高阶梯多次 J 槽掷取应碰上专属战斗词缀').toBeGreaterThan(0)
  })
})

/**
 * 每阶的每个装备槽都要有模板,否则那一阶该槽位永远刷不出装备。
 *
 * 这是数据表的完整性,不是逻辑:少一个模板不会报错,只会让玩家在某个境界
 * 卡着某个槽位空着。`artifact` 槽不在此列 —— 法宝走 `ARTIFACTS` 独立表。
 */
describe('装备模板 · 每阶槽位齐全', () => {
  it('32 阶 × 九个可掉落槽位,一个不缺', () => {
    const SLOTS = ['weapon', 'head', 'body', 'wrist', 'belt', 'boots', 'necklace', 'ring', 'talisman'] as const
    const byTier = new Map<number, Set<string>>()
    for (const t of EQUIPMENT_TEMPLATES) {
      if (!byTier.has(t.tier)) byTier.set(t.tier, new Set())
      byTier.get(t.tier)!.add(t.slot)
    }
    /*
     * 期望阶梯写死为 1..真实区域上限,不拿 `byTier.keys()` 现推:
     * 只数「有 32 个不同 tier」的话,删掉 1 阶又补个 33 阶照样过关,
     * 而 1 阶那一整列装备此后永远刷不出来。
     */
    const TIER_TOP = maxTierForMajor(MAX_MAJOR)
    expect(TIER_TOP, '区域阶梯的上限变了,下面的期望范围要跟着改').toBe(32)
    const tiers = [...byTier.keys()].sort((a, b) => a - b)
    const outOfRange = tiers.filter(t => t < 1 || t > TIER_TOP)
    expect(outOfRange, `模板里出现了 1..${TIER_TOP} 之外的阶:${outOfRange.join(',')}`).toEqual([])
    const missing: string[] = []
    for (let tier = 1; tier <= TIER_TOP; tier += 1) {
      if (!byTier.has(tier)) {
        missing.push(`${tier} 阶整阶没有模板`)
        continue
      }
      for (const s of SLOTS) if (!byTier.get(tier)!.has(s)) missing.push(`${tier} 阶缺 ${s}`)
    }
    expect(missing, `有阶缺槽位,那一阶该槽位永远刷不出装备:\n${missing.join('\n')}`).toEqual([])
  })

  it('artifact 槽不混进模板表(法宝有独立数据源)', () => {
    const artifacts = EQUIPMENT_TEMPLATES.filter(t => t.slot === 'artifact')
    expect(artifacts, `模板表里出现了法宝槽:${artifacts.map(a => a.id).join(',')}`).toEqual([])
  })
})
