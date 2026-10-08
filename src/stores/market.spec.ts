/**
 * 坊市 store —— 购买路径与坏档韧性
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { MARKET_MAT_COUNT, MARKET_CONSIGN_SLOTS, type MarketSlot } from '@/data/market'
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

describe('坊市 · 买卖', () => {
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

  it('寄卖:背包一件离包上架,记价/记层/记时刻,行囊随之腾空', () => {
    const market = useMarketStore()
    const inventory = useInventoryStore()
    inventory.$patch({ items: [{ uid: 'e1', templateId: 'x', quality: 'fine', tier: 3, level: 0, affixes: [] }] })
    expect(market.consignEquip('e1', 1000)).toBe('ok')
    expect(inventory.items).toHaveLength(0)
    expect(market.consign).toHaveLength(1)
    const p = market.consign[0]!
    expect(p.tier).toBe(3)
    expect(p.finishAt).toBeGreaterThan(1000)
    expect(toNum(p.price)).toBeGreaterThan(0)
  })

  it('寄卖:格满则拒;找不到的件也拒', () => {
    const market = useMarketStore()
    const inventory = useInventoryStore()
    inventory.$patch({
      items: [{ uid: 'e1', templateId: 'x', quality: 'fine', tier: 3, level: 0, affixes: [] }, { uid: 'e2', templateId: 'x', quality: 'fine', tier: 3, level: 0, affixes: [] }]
    })
    market.consignEquip('e1', 0)
    market.consignEquip('e2', 0)
    expect(market.consign).toHaveLength(MARKET_CONSIGN_SLOTS)
    expect(market.consignEquip('e1', 0), '格满').toBe('full')
    market.$patch({ consign: [] })
    expect(market.consignEquip('nope', 0), '不在行囊').toBe('missing')
  })

  it('寄卖:到时自售入账、腾格;未到期的分文不动', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    const inventory = useInventoryStore()
    inventory.$patch({ items: [{ uid: 'e1', templateId: 'x', quality: 'fine', tier: 3, level: 0, affixes: [] }] })
    market.consignEquip('e1', 0)
    const price = market.consign[0]!.price
    resources.spiritStone = gn(0)

    const none = market.collectConsign(0) // 未到期
    expect(none).toEqual([])
    expect(toNum(resources.spiritStone)).toBe(0)

    market.consign[0]!.finishAt = 1
    const sold = market.collectConsign(9999)
    expect(sold.length).toBe(1)
    expect(toNum(resources.spiritStone)).toBeCloseTo(toNum(price), 5)
    expect(market.consign).toHaveLength(0)
  })

  it('即时售丹:扣一枚、入账灵石;无丹方与没存货都不成', () => {
    const market = useMarketStore()
    const inventory = useInventoryStore()
    const resources = useResourcesStore()
    inventory.$patch({ pills: { p_jvqisan: 3 } })
    resources.spiritStone = gn(0)
    expect(market.sellPill('p_jvqisan')).toBe(true)
    expect(inventory.pills['p_jvqisan']).toBe(2)
    expect(toNum(resources.spiritStone)).toBeGreaterThan(0)
    expect(market.sellPill('p_nope'), '无此丹').toBe(false)
    expect(market.sellPill('p_jvqisan'), '还有货可再卖').toBe(true)
  })

  it('即时售材:走一批扣库存、入账灵石;不够一批则不成', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    resources.herbByGrade[1] = 10 // 不到一批 12
    resources.ore = 20
    resources.spiritStone = gn(0)
    expect(market.sellMaterial('herb', 0), '不够一批不售').toBe(false)
    expect(market.sellMaterial('ore', 0)).toBe(true)
    expect(resources.ore).toBe(20 - MARKET_MAT_COUNT)
    expect(toNum(resources.spiritStone)).toBeGreaterThan(0)
  })

  it('sanitize:寄卖排塞垃圾逐条修形,烂条丢弃、到期倒欠的丢弃', () => {
    const market = useMarketStore()
    market.$patch({
      consign: [
        null,
        0,
        {},
        { slot: 0, tier: 3, qualityRank: 1, price: { m: 5, e: 0 }, finishAt: 'x', name: 'x' },
        { slot: 1, tier: 3, qualityRank: 1, price: { m: 5, e: 0 }, finishAt: 99999, name: '贝甲' }
      ] as unknown as never
    })
    market.sanitize()
    expect(market.consign).toHaveLength(1)
    expect(market.consign[0]!.name).toBe('贝甲')
  })
})
