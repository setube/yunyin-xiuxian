/* eslint-disable no-console -- 成本表是给人看的 */
/**
 * 重铸与封存 —— 成本只看「阶数」与「封存数」,重铸连条数一起重掷
 *
 * 旧口径是「品质倍率 × 1.5^次数,上限 10 次」。两处都换掉了:
 *   一 **不限次数**:能不能继续炼,不该由一个与装备无关的计数器决定;
 *   二 **成本只随两件事走**:它有多高阶(与强化/封存同一条 stoneByTier 经济)、
 *      你封存了几个词条(封存是保护,保护得越多,重掷剩下部分越贵)。
 * 而「重铸」的动作也换了:旧版只**换掉一条**词条、条数不动;现在把未封存的
 * 词条推倒重来 —— **条数按品质区间重掷**(至少给一条新的),数值全部重掷。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { reforgeCost, reforgeEquipment, reforgeableAffixIds, sealCapacity, sealCost, sealAffix, unsealAffix } from './reforge'
import { REFORGE_DUST_BASE, REFORGE_SEAL_LOAD, REFORGE_STONE_BASE } from '@/data/constants'
import { qualityDef } from '@/data/qualities'
import { rng } from '@/utils/random'
import { useInventoryStore } from '@/stores/inventory'
import { useResourcesStore } from '@/stores/resources'
import { gn } from '@/utils/gnum'
import type { EquipmentInstance } from '@/types'

const stoneOf = (g: { m: number; e: number }): number => g.m * Math.pow(10, g.e)

const base: EquipmentInstance = {
  uid: 'u1',
  templateId: 'w_zhuqing',
  quality: 'excellent',
  tier: 3,
  level: 0,
  affixes: [
    { id: 'atk1', roll: 0.5 },
    { id: 'def1', roll: 0.5 }
  ],
  reforgeCount: 0
}

describe('重铸成本 · 只看阶数与封存数', () => {
  it('不限次数:洗到第两百次仍可重铸,且价格与第一次相同', () => {
    const first = reforgeCost({ ...base, reforgeCount: 0 })!
    const late = reforgeCost({ ...base, reforgeCount: 200 })!
    expect(late, '不该再有次数上限').not.toBeNull()
    expect(stoneOf(late.stone), '次数不进公式').toBeCloseTo(stoneOf(first.stone), 6)
    expect(late.dust).toBe(first.dust)
  })

  it('品质不进公式:凡品与神品洗一次同价(贵贱由阶数与封存数说)', () => {
    const mortal = reforgeCost({ ...base, quality: 'mortal' })!
    const divine = reforgeCost({ ...base, quality: 'divine' })!
    expect(stoneOf(divine.stone)).toBeCloseTo(stoneOf(mortal.stone), 6)
  })

  it('阶数定价:灵石 = stoneByTier(阶) × 基础,与强化同一条经济', () => {
    const t3 = reforgeCost({ ...base, tier: 3 })!
    const t10 = reforgeCost({ ...base, tier: 10 })!
    console.log(`\n  重铸灵石:3 阶 ${stoneOf(t3.stone).toExponential(2)} → 10 阶 ${stoneOf(t10.stone).toExponential(2)}`)
    expect(stoneOf(t10.stone)).toBeGreaterThan(stoneOf(t3.stone) * 5)
    // 未封存时正好是「基础 × 阶数倍率」
    const t3NoSeal = reforgeCost({ ...base, tier: 3 })!
    expect(t3NoSeal.dust).toBe(REFORGE_DUST_BASE)
    expect(REFORGE_STONE_BASE).toBeGreaterThan(0)
  })

  it('封存溢价:每封一条,灵石与器灵尘各上浮 REFORGE_SEAL_LOAD', () => {
    const three = { ...base, affixes: [...base.affixes, { id: 'hp1', roll: 0.5 }] }
    const one = reforgeCost({ ...three, sealedAffixIds: ['atk1'] })!
    const two = reforgeCost({ ...three, sealedAffixIds: ['atk1', 'def1'] })!
    expect(stoneOf(two.stone) / stoneOf(one.stone)).toBeCloseTo((1 + 2 * REFORGE_SEAL_LOAD) / (1 + REFORGE_SEAL_LOAD), 6)
    expect(two.dust).toBe(Math.round(REFORGE_DUST_BASE * (1 + 2 * REFORGE_SEAL_LOAD)))
  })

  it('全部封存就没得重铸了 —— 这是唯一一种"不能再炼"', () => {
    expect(reforgeCost({ ...base, sealedAffixIds: ['atk1', 'def1'] })).toBeNull()
    expect(sealCapacity(base), '封存上限 = 词条数 − 1(至少留一个可重掷位)').toBe(1)
    expect(sealCost({ ...base, sealedAffixIds: ['atk1'] })).toBeNull()
  })
})

describe('重铸动作 · 条数与数值一起重掷', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.restoreAllMocks())

  /** 摆一件装备与足够的资源(重铸要真扣账) */
  function setup(inst: EquipmentInstance): void {
    useInventoryStore().items = [inst]
    const res = useResourcesStore()
    res.addStone(gn(1e30))
    res.addSmall('dust', 100_000)
  }

  it('模板缺失(坏档)不洗:没有价、不扣账 —— 抽取池要按部位过滤,不知部位就不洗', () => {
    const broken: EquipmentInstance = { ...base, uid: 'broken', templateId: 'no_such_template' }
    expect(reforgeCost(broken)).toBeNull()
    setup(broken)
    const res = useResourcesStore()
    const dustBefore = res.dust
    expect(reforgeEquipment('broken', true)).toBe(false)
    expect(res.dust).toBe(dustBefore)
    expect(useInventoryStore().findItem('broken')!.affixes).toEqual(broken.affixes)
  })

  it('条数按品质区间重掷:上限拉满时,词条数真的变多', () => {
    const inst: EquipmentInstance = {
      ...base,
      uid: 'count-up',
      quality: 'profound', // 玄品:3~4 条
      affixes: [{ id: 'atk1', roll: 0.5 }]
    }
    setup(inst)
    // 让条数掷到上限、且新词条挑得出
    vi.spyOn(rng, 'int').mockReturnValue(qualityDef('profound').affixes[1])
    expect(reforgeEquipment('count-up')).toBe(true)
    const after = useInventoryStore().findItem('count-up')!
    expect(after.affixes.length).toBe(qualityDef('profound').affixes[1])
    expect(after.affixes.length).toBeGreaterThan(inst.affixes.length)
    expect(after.reforgeCount, '次数仍记着(只是不进公式)').toBe(1)
  })

  it('封存的原样保留,其余词条全部重掷(掷点重来)', () => {
    const inst: EquipmentInstance = {
      ...base,
      uid: 'sealed-keep',
      quality: 'profound',
      affixes: [
        { id: 'atk1', roll: 0.1 },
        { id: 'def1', roll: 0.2 },
        { id: 'hp1', roll: 0.3 }
      ],
      sealedAffixIds: ['atk1']
    }
    setup(inst)
    // 把新掷点钉成一个一眼可辨的值:未封存的那几条若还带着从前的 0.2/0.3,就说明没重掷
    vi.spyOn(rng, 'weighted').mockImplementation(((items: readonly unknown[]) => items[0]) as never)
    vi.spyOn(rng, 'next').mockReturnValue(0.99)
    expect(reforgeEquipment('sealed-keep')).toBe(true)
    const after = useInventoryStore().findItem('sealed-keep')!
    const kept = after.affixes.find(a => a.id === 'atk1')
    expect(kept, '封存的那条必须还在').toBeDefined()
    expect(kept!.roll, '封存的掷点不动').toBe(0.1)
    for (const a of after.affixes.filter(x => x.id !== 'atk1')) {
      expect(a.roll, `${a.id} 还是旧掷点,说明没重掷`).toBe(0.99)
    }
    const [min, max] = qualityDef('profound').affixes
    expect(after.affixes.length).toBeGreaterThanOrEqual(min)
    expect(after.affixes.length).toBeLessThanOrEqual(max)
    expect(new Set(after.affixes.map(a => a.id)).size, '同一件里不该有重复词条').toBe(after.affixes.length)
  })

  it('每次重铸至少给一条新的:封存到只剩一个位时也不会空转', () => {
    const inst: EquipmentInstance = {
      ...base,
      uid: 'one-slot',
      quality: 'excellent', // 精品 2~3 条
      affixes: [
        { id: 'atk1', roll: 0.5 },
        { id: 'def1', roll: 0.5 }
      ],
      sealedAffixIds: ['atk1']
    }
    setup(inst)
    expect(reforgeEquipment('one-slot')).toBe(true)
    const after = useInventoryStore().findItem('one-slot')!
    const [min, max] = qualityDef('excellent').affixes
    // 条数按品质区间重掷(精品 2~3),但封存的那条一定还在、且至少补一条新的
    expect(after.affixes.length).toBeGreaterThanOrEqual(min)
    expect(after.affixes.length).toBeLessThanOrEqual(max)
    expect(after.affixes.some(a => a.id === 'atk1')).toBe(true)
    expect(after.affixes.some(a => a.id !== 'atk1'), '至少要有一条新的').toBe(true)
  })

  it('不止一条可洗:一掷定一份词条构成,而不是只换一条', () => {
    const inst: EquipmentInstance = {
      ...base,
      uid: 'multi',
      quality: 'heaven', // 4~5 条
      affixes: [
        { id: 'atk1', roll: 0.5 },
        { id: 'def1', roll: 0.5 },
        { id: 'hp1', roll: 0.5 },
        { id: 'crit1', roll: 0.5 }
      ]
    }
    setup(inst)
    vi.spyOn(rng, 'int').mockReturnValue(qualityDef('heaven').affixes[1])
    reforgeEquipment('multi')
    const after = useInventoryStore().findItem('multi')!
    expect(after.affixes.length).toBe(qualityDef('heaven').affixes[1])
    expect(new Set(after.affixes.map(a => a.id)).size, '同一件里不该有重复词条').toBe(after.affixes.length)
  })

  it('资源不足时不动装备、不记账', () => {
    const inst: EquipmentInstance = { ...base, uid: 'poor' }
    useInventoryStore().items = [inst]
    expect(reforgeEquipment('poor')).toBe(false)
    expect(useInventoryStore().findItem('poor')!.reforgeCount).toBe(0)
  })

  it('封存要付费,且封满之后不再可封', () => {
    const inst: EquipmentInstance = { ...base, uid: 'seal' }
    useInventoryStore().items = [inst]
    const res = useResourcesStore()
    res.addStone(gn(1e30))
    expect(sealAffix('seal', 'atk1')).toBe(true)
    expect(useInventoryStore().findItem('seal')!.sealedAffixIds).toEqual(['atk1'])
    expect(sealAffix('seal', 'def1'), '只剩一条可重掷位,封不了').toBe(false)
  })
})

describe('封存 ↔ 解封 · 循环可逆', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('封了能解:unsealAffix 移除 id、重铸恢复可替,且免费不扣账', () => {
    const inst: EquipmentInstance = { ...base, uid: 'roundtrip', sealedAffixIds: ['atk1'] }
    useInventoryStore().items = [inst]
    expect(unsealAffix('roundtrip', 'atk1')).toBe(true)
    const after = useInventoryStore().findItem('roundtrip')!
    expect(after.sealedAffixIds, '解封后该条不在封存表里').toEqual([])
    expect(reforgeableAffixIds(after), '解封恢复了它的可重铸性').toContain('atk1')
  })

  it('未封存 / 词条不在 / 件不在,解封一律返回 false 且不动装备', () => {
    const inst: EquipmentInstance = { ...base, uid: 'nos', sealedAffixIds: [] }
    useInventoryStore().items = [inst]
    expect(unsealAffix('nos', 'def1'), '没封过').toBe(false)
    expect(unsealAffix('nos', 'ghost'), '词条根本不在').toBe(false)
    expect(unsealAffix('unknown-uid', 'atk1'), '件不在').toBe(false)
    expect(useInventoryStore().findItem('nos')!.sealedAffixIds).toEqual([])
  })

  it('解封后位子随即空出,可再封', () => {
    const inst: EquipmentInstance = {
      ...base,
      uid: 'reseal',
      quality: 'profound',
      affixes: [
        { id: 'atk1', roll: 0.5 },
        { id: 'def1', roll: 0.5 },
        { id: 'hp1', roll: 0.5 }
      ],
      sealedAffixIds: ['atk1']
    }
    useInventoryStore().items = [inst]
    const res = useResourcesStore()
    res.addStone(gn(1e30))
    expect(sealCapacity(inst)).toBe(2)
    expect(sealCost(inst), '已封一条、还有位可再封').not.toBeNull()
    expect(unsealAffix('reseal', 'atk1')).toBe(true)
    expect(useInventoryStore().findItem('reseal')!.sealedAffixIds).toEqual([])
    expect(sealAffix('reseal', 'atk1'), '解封后可再封').toBe(true)
    expect(useInventoryStore().findItem('reseal')!.sealedAffixIds).toEqual(['atk1'])
  })
})

describe('界面与判定同源 · 条数上限不写死', () => {
  const dialog = readFileSync(resolve(__dirname, '../components/equipment/EquipmentDetailDialog.vue'), 'utf8')

  it('词条条数上限取自品质表,不在模板里写死数字', () => {
    expect(dialog, '上限应读 qualityDef(...).affixes[1]').toContain('qualityDef(inst.value.quality).affixes[1]')
    expect(dialog, '封存上限应读 sealCapacity(与判定同一处)').toContain('sealCapacity(')
    expect(dialog, '不该再出现「重铸次数 x/10」这类写死的分母').not.toMatch(/重铸次数\s*\{\{/)
  })
})
