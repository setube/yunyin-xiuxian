/**
 * 坊市 store —— 购买路径与坏档韧性
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { MarketSlot } from '@/data/market'
import { gn, toNum } from '@/utils/gnum'
import { BAG_CAPACITY } from '@/data/constants'
import { useMarketStore } from '@/stores/market'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'

/** 一份远在将来的货架,让 sync 不重上货(测的是「买」,不是「刷新」) */
const FAR = 4_102_444_800_000 // 2099-12-31

function pillSlot(idx: number): MarketSlot {
  return { kind: 'pill', idx, pillId: 'p_jvqisan', count: 1, price: { m: 20, e: 0 }, sold: false }
}

function seedStock(slots: MarketSlot[]): void {
  const m = useMarketStore()
  m.$patch({ stock: slots, stockedAt: FAR })
}

describe('坊市 · 购买', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('买丹:扣灵石、入背包、标已售;售罄再买不成交', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    const inventory = useInventoryStore()
    seedStock([pillSlot(0)])
    resources.spiritStone = gn(100)

    expect(market.buy(0)).toBe('ok')
    expect(inventory.pills['p_jvqisan']).toBe(1)
    expect(toNum(resources.spiritStone)).toBe(80)
    expect(market.stock[0]!.sold).toBe(true)

    expect(market.buy(0)).toBe('sold')
    expect(inventory.pills['p_jvqisan'], '售罄不该二次入账').toBe(1)
  })

  it('买材:入 herb/ore 小资源,按格价扣灵石', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    seedStock([{ kind: 'material', idx: 0, matId: 'herb', count: 12, price: { m: 5, e: 0 }, sold: false }])
    resources.spiritStone = gn(100)

    expect(market.buy(0)).toBe('ok')
    expect(resources.herb).toBe(12)
    expect(resources.ore).toBe(0)
    expect(toNum(resources.spiritStone)).toBeCloseTo(95, 5)
  })

  it('灵石不足:不成交、不扣钱、不标已售', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    seedStock([pillSlot(0)])
    resources.spiritStone = gn(10) // 买不起 20

    expect(market.buy(0)).toBe('poor')
    expect(toNum(resources.spiritStone)).toBe(10)
    expect(market.stock[0]!.sold).toBe(false)
  })

  it('行囊满:装不下兵刃就不收钱(先验满、再扣款)', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    const inventory = useInventoryStore()
    seedStock([{ kind: 'equipment', idx: 0, tier: 0, minQualityRank: 0, price: { m: 50, e: 0 }, sold: false }])
    resources.spiritStone = gn(100)
    inventory.$patch({
      items: Array.from({ length: BAG_CAPACITY }, (_, i) => ({
        uid: `dummy${i}`,
        templateId: 'x',
        quality: 'mortal',
        tier: 0,
        level: 0,
        affixes: []
      }))
    })

    expect(market.buy(0)).toBe('bagfull')
    expect(toNum(resources.spiritStone), '装不下就不该扣灵石').toBe(100)
    expect(market.stock[0]!.sold).toBe(false)
  })

  it('sanitize:货架塞满垃圾逐格修形,整格丢弃;时刻夹回非负', () => {
    const market = useMarketStore()
    market.$patch({
      stock: [
        null,
        { uid: null },
        0,
        'x',
        {},
        { a: null },
        pillSlot(0),
        { kind: 'blah', idx: 1, price: { m: 1, e: 0 }, sold: false },
        { kind: 'pill', idx: 2, pillId: 'p_nope', price: { m: 1, e: 0 }, sold: false }
      ] as unknown as MarketSlot[],
      stockedAt: -5 as unknown as number
    })
    market.sanitize()
    expect(market.stock).toHaveLength(1)
    expect(market.stock[0]!.kind).toBe('pill')
    expect(market.stock[0]!.idx).toBe(0)
    expect(market.stockedAt).toBe(0)
  })

  it('sanitize:非法时刻与残缺价都不该炸,仍可序列化', () => {
    const market = useMarketStore()
    market.$patch({ stock: [pillSlot(0)], stockedAt: NaN as unknown as number })
    market.sanitize()
    expect(market.stockedAt).toBe(0)
    expect(() => JSON.stringify(market.$state)).not.toThrow()
  })
})
