/** 坊市 store —— 购买路径与坏档韧性 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { MARKET_MAT_COUNT, MARKET_CONSIGN_SLOTS, MARKET_REFRESH_SECONDS, type MarketSlot } from '@/data/market'
import { pillSellPrice } from '@/core/marketService'
import { gn, toNum } from '@/utils/gnum'
import { BAG_CAPACITY } from '@/data/constants'
import { consignPrice, focusHerbSlot, marketRemainingSec, herbSellBatch, materialSellPrice } from '@/core/marketService'
import { MAX_EQUIP_TIER } from '@/data/equipment'
import { qualityDef } from '@/data/qualities'
import { useMarketStore } from '@/stores/market'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import { useQuestsStore } from '@/stores/quests'

/** 远期上货时刻:sync 不重上货 */
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

  it('灵草按上货那一刻的品阶入账,不随当下境界飘(转世不再错品)', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    const player = usePlayerStore()
    player.major = 0 // 当下是 1 品
    // 货架草 3 品(高境上货、转世后未刷新)
    seedStock([{ kind: 'material', idx: 0, matId: 'herb', grade: 3, count: 12, price: { m: 5, e: 0 }, sold: false }])
    resources.spiritStone = gn(100)

    expect(market.buy(0)).toBe('ok')
    expect(resources.herbOf(3), '应按货架钉死的 3 品入账').toBe(12)
    expect(resources.herbOf(1), '不该按当下 1 品入账').toBe(0)
    // 旧档货架无 grade:兜底按当下品
    seedStock([{ kind: 'material', idx: 0, matId: 'herb', count: 6, price: { m: 1, e: 0 }, sold: false }])
    expect(market.buy(0)).toBe('ok')
    expect(resources.herbOf(1)).toBe(6)
  })

  it('买装备计入收藏与见闻:collection 与图鉴不再分叉', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    const inventory = useInventoryStore()
    const quests = useQuestsStore()
    seedStock([{ kind: 'equipment', idx: 0, tier: 3, minQualityRank: 0, price: { m: 100, e: 0 }, sold: false }])
    resources.spiritStone = gn(1e9)

    expect(market.buy(0)).toBe('ok')
    expect(inventory.items).toHaveLength(1)
    const tpl = inventory.items[0]!.templateId
    expect(quests.collections.equip, '买来的装备应计入收藏').toContain(tpl)
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

  it('跨过换货窗口时买下:不成交、不扣灵石、不入袋', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    const inventory = useInventoryStore()
    seedStock([pillSlot(0)])
    market.stockedAt = 0 // 屏幕仍是旧架,但已过窗口
    resources.spiritStone = gn(100)
    const oldShelf = market.stock

    expect(market.buy(0)).toBe('expired')
    expect(market.stock, '已整架换新').not.toBe(oldShelf)
    expect(oldShelf[0]!.sold, '旧架那格不动').toBe(false)
    expect(toNum(resources.spiritStone), '灵石一枚不扣').toBe(100)
    expect(inventory.pills['p_jvqisan'] ?? 0, '也不入袋').toBe(0)
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

  /** 坏价经 asPrice 归零,buy 会把零价当成付得起 */
  it('sanitize:零价货格丢弃,丹/材数量按上货口径归一,不能零元购或超量到货', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    const inventory = useInventoryStore()
    market.$patch({
      stock: [
        { kind: 'pill', idx: 0, pillId: 'p_jvqisan', count: 9999, price: { m: 0, e: 0 }, sold: false },
        { kind: 'material', idx: 1, matId: 'herb', grade: 1, count: 9999, price: { m: 0, e: 0 }, sold: false },
        { kind: 'pill', idx: 2, pillId: 'p_jvqisan', count: 9999, price: { m: 20, e: 0 }, sold: false },
        { kind: 'material', idx: 3, matId: 'ore', count: 9999, price: { m: 20, e: 0 }, sold: false }
      ] as MarketSlot[],
      stockedAt: FAR
    })
    resources.spiritStone = gn(100)

    market.sanitize()
    expect(market.stock.map(s => s.idx), '零价格不许留下').toEqual([2, 3])
    const pill = market.stock[0]!
    const ore = market.stock[1]!
    expect(pill.kind === 'pill' && pill.count).toBe(1)
    expect(ore.kind === 'material' && ore.count).toBe(MARKET_MAT_COUNT)

    expect(market.buy(2)).toBe('ok')
    expect(market.buy(3)).toBe('ok')
    expect(inventory.pills['p_jvqisan']).toBe(1)
    expect(resources.ore).toBe(MARKET_MAT_COUNT)
    expect(toNum(resources.spiritStone), '两格都按各自标价扣款').toBe(60)
  })

  it('未来起钟不解死锁,但起钟(装备种子)一位不动', () => {
    /*
     * 货架起钟同时是**装备实例的确定性种子**(`marketEquipInstance` 用 `(stockedAt, idx)` 再生)。
     * 夹到此刻或归零都会让同一格变成另一件:预览 A、买到 B。
     * 修法是在 `sync` 里用一个局部「窗口起点」,持久化字段一律不动。
     */
    const market = useMarketStore()
    const future = Date.now() + 365 * 24 * 3600_000
    market.$patch({ stockedAt: future } as never)
    market.sanitize()
    expect(market.stockedAt, 'sanitize 改了装备种子 —— 同格会变成另一件').toBe(future)
  })

  it('sanitize:装备层级与品质下限夹回合法域,越界坏格买下也不崩', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    const inventory = useInventoryStore()
    market.$patch({
      stock: [
        {
          kind: 'equipment',
          idx: 0,
          tier: 999,
          minQualityRank: 999,
          price: { m: 100, e: 0 },
          sold: false
        }
      ] as MarketSlot[],
      stockedAt: FAR
    })
    resources.spiritStone = gn(1000)

    market.sanitize()
    const slot = market.stock[0]!
    expect(slot.kind === 'equipment' && slot.tier).toBe(MAX_EQUIP_TIER)
    expect(slot.kind === 'equipment' && slot.minQualityRank).toBe(qualityDef('divine').rank)
    expect(market.buy(0)).toBe('ok')
    expect(inventory.items).toHaveLength(1)
    expect(inventory.items[0]!.tier).toBe(MAX_EQUIP_TIER)
    expect(qualityDef(inventory.items[0]!.quality).rank).toBe(qualityDef('divine').rank)
  })

  it('sanitize:合法灵草货架的品阶跨读档保留,坏品阶落回无级', () => {
    const market = useMarketStore()
    market.$patch({
      stock: [
        { kind: 'material', idx: 0, matId: 'herb', grade: 3, count: 12, price: { m: 5, e: 0 }, sold: false },
        { kind: 'material', idx: 1, matId: 'herb', grade: 99, count: 12, price: { m: 5, e: 0 }, sold: false }
      ] as unknown as MarketSlot[]
    })
    market.sanitize()
    // 先断言是 material 格,免得守卫空转
    const s0 = market.stock[0]
    expect(s0?.kind, '合法货架格应保留').toBe('material')
    if (s0?.kind === 'material') expect(s0.grade, '合法 3 品应跨读档保留').toBe(3)
    const s1 = market.stock[1]
    expect(s1?.kind, '坏品阶格仍应保留为 material').toBe('material')
    if (s1?.kind === 'material') expect(s1.grade, '99 不是合法品阶,应落回无级兜底').toBeUndefined()
  })

  /** 丹/料货格不靠格号再生:重复号重排到最小空闲号,货与价原样保留 */
  it('sanitize:重复 idx 的丹料格重排保货,两格都可买', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    const inventory = useInventoryStore()
    market.$patch({
      stock: [
        { kind: 'material', idx: 3, matId: 'herb', grade: 1, count: 12, price: { m: 5, e: 0 }, sold: false },
        { kind: 'material', idx: 3, matId: 'ore', count: 12, price: { m: 6, e: 0 }, sold: false }
      ] as MarketSlot[],
      stockedAt: Date.now()
    })
    resources.spiritStone = gn(1000)
    market.sanitize()
    expect(market.stock, '两格丹料货都要留下').toHaveLength(2)
    expect(market.stock.map(s => s.idx), '重排成互异格号').toEqual([3, 4])
    expect(market.stock[0]!.kind === 'material' && market.stock[0]!.matId).toBe('herb')
    expect(market.stock[1]!.kind === 'material' && market.stock[1]!.matId).toBe('ore')

    expect(market.buy(3)).toBe('ok')
    expect(market.buy(4)).toBe('ok')
    expect(resources.herbOf(1)).toBe(12)
    expect(resources.ore).toBe(12)
    expect(inventory.pills).toEqual({})
  })

  /** 装备品质由 (stockedAt, idx) 确定性再生:重复号不能改号,只留先出现那格 */
  it('sanitize:重复 idx 的装备仍只留首格,绝不改号再生另一件', () => {
    const market = useMarketStore()
    market.$patch({
      stock: [
        { kind: 'equipment', idx: 2, tier: 3, minQualityRank: 0, price: { m: 5, e: 0 }, sold: false },
        { kind: 'equipment', idx: 2, tier: 9, minQualityRank: 3, price: { m: 6, e: 0 }, sold: false }
      ] as MarketSlot[]
    })
    market.sanitize()
    expect(market.stock, '重复装备只留首格').toHaveLength(1)
    const kept = market.stock[0]!
    expect(kept.idx).toBe(2)
    expect(kept.kind === 'equipment' && kept.tier).toBe(3)
  })

  it('sanitize:丹料与装备同号时先保装备原号,丹料顺延', () => {
    const market = useMarketStore()
    market.$patch({
      stock: [
        { kind: 'material', idx: 2, matId: 'herb', grade: 1, count: 12, price: { m: 5, e: 0 }, sold: false },
        { kind: 'equipment', idx: 2, tier: 3, minQualityRank: 0, price: { m: 6, e: 0 }, sold: false }
      ] as MarketSlot[]
    })
    market.sanitize()
    const equipment = market.stock.find(s => s.kind === 'equipment')
    const material = market.stock.find(s => s.kind === 'material')
    expect(equipment?.idx, '装备必须守 (stockedAt, idx) 原号').toBe(2)
    expect(material?.idx, '丹料顺延到下一个空号').toBe(3)
  })

  /** 缺格号无法确认原号(补号会让装备标价与实得品质分叉):丢掉,但不许顶掉已有的货 */
  it('sanitize:缺 idx 的格子丢掉,已有的那格原样留下', () => {
    const market = useMarketStore()
    market.$patch({
      stock: [
        { kind: 'material', idx: 1, matId: 'herb', grade: 1, count: 12, price: { m: 5, e: 0 }, sold: false },
        // 第 2 格缺号 → 丢弃
        { kind: 'material', matId: 'ore', count: 12, price: { m: 6, e: 0 }, sold: false }
      ] as unknown as MarketSlot[]
    })
    market.sanitize()
    expect(market.stock).toHaveLength(1)
    expect(market.stock[0]!.idx).toBe(1)
    const kept = market.stock[0]!
    expect(kept.kind === 'material' && kept.matId, '已有的草格不该被缺号格覆盖').toBe('herb')
  })

  it('sanitize:烂格先出现也不许占掉后面好货的格号', () => {
    const market = useMarketStore()
    market.$patch({
      stock: [
        // 同号的坏丹方在前
        { kind: 'pill', idx: 2, pillId: 'p_nope', count: 1, price: { m: 1, e: 0 }, sold: false },
        { kind: 'material', idx: 2, matId: 'herb', grade: 1, count: 12, price: { m: 5, e: 0 }, sold: false }
      ] as unknown as MarketSlot[]
    })
    market.sanitize()
    expect(market.stock, '烂格不该把好货的号占掉').toHaveLength(1)
    const kept = market.stock[0]!
    expect(kept.kind === 'material' && kept.matId).toBe('herb')
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

  it('售尽某味丹药:一枚不剩,且所得与逐枚卖同一把尺', () => {
    const market = useMarketStore()
    const inventory = useInventoryStore()
    const resources = useResourcesStore()
    inventory.$patch({ pills: { p_jvqisan: 7 } })
    resources.spiritStone = gn(0)
    const unit = pillSellPrice('p_jvqisan')
    const r = market.sellPillAll('p_jvqisan')
    expect(r.count).toBe(7)
    expect(inventory.pills['p_jvqisan'], '售尽后仍有剩').toBeUndefined()
    // 总量 = 单价 × 枚数:与逐枚卖同一把尺
    expect(toNum(r.stone)).toBeCloseTo(toNum(unit) * 7, 3)
    expect(toNum(resources.spiritStone)).toBeCloseTo(toNum(unit) * 7, 3)
    // 再售一次:已无货
    expect(market.sellPillAll('p_jvqisan').count).toBe(0)
  })

  it('售尽玄铁:按整摞整除,不足一摞的零头留下', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    resources.ore = MARKET_MAT_COUNT * 5 + 3
    const lots = market.sellOreAll(14)
    expect(lots, '可售摞数与整除口径不符').toBe(5)
    expect(resources.ore, '零头不该被卖掉').toBe(3)
    expect(market.sellOreAll(14), '不足一摞时应一枚也不卖').toBe(0)
  })

  it('售尽灵草:同一品的整摞口径,别品不动', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    resources.herbByGrade[1] = MARKET_MAT_COUNT * 2
    resources.herbByGrade[2] = MARKET_MAT_COUNT * 3
    expect(market.sellHerbAll(1)).toBe(2)
    expect(resources.herbOf(1)).toBe(0)
    expect(resources.herbOf(2), '卖一品不该动别品').toBe(MARKET_MAT_COUNT * 3)
  })

  it('即时售材:玄铁走一批扣库存入账;灵草按品(低品不够不售、高品够则按该品售)', () => {
    const market = useMarketStore()
    const resources = useResourcesStore()
    resources.herbByGrade[1] = 10 // 凡品不足一批 12
    resources.herbByGrade[5] = 20 // 道品够一批
    resources.ore = 20
    resources.spiritStone = gn(0)
    expect(market.sellHerb(1), '不够一批不售').toBe(false)
    expect(market.sellHerb(5), '高品够则售').toBe(true)
    expect(resources.herbByGrade[5]).toBe(20 - MARKET_MAT_COUNT)
    expect(resources.herbByGrade[1], '低品分毫未动').toBe(10)
    expect(market.sellMaterial(0)).toBe(true)
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

  it('sanitize:寄卖坏价按层级与品质重算,玩家交出的货不会到期零元入账', () => {
    const market = useMarketStore()
    const now = Date.now()
    market.$patch({
      consign: [
        { slot: 0, tier: 3, qualityRank: 1, price: { m: 0, e: 0 }, finishAt: now + 1000, name: '贝甲' },
        { slot: 1, tier: 999, qualityRank: 999, price: { m: 0, e: 0 }, finishAt: now + 2000, name: '坏层' }
      ]
    })

    market.sanitize()
    expect(toNum(market.consign[0]!.price), '正常寄卖价按同一公式重建').toBeCloseTo(
      toNum(consignPrice(3, 1)),
      5
    )
    expect(market.consign[1]!.tier).toBe(MAX_EQUIP_TIER)
    expect(market.consign[1]!.qualityRank).toBe(qualityDef('divine').rank)
    expect(toNum(market.consign[1]!.price), '越界坏层也按合法上界重建,不吞成零').toBeCloseTo(
      toNum(consignPrice(MAX_EQUIP_TIER, qualityDef('divine').rank)),
      5
    )
  })

  /*
   * 坏档里的负 finishAt 必须整条丢掉,不能被夹成 0 留下来。
   *
   * 原文是 `Math.max(0, Math.floor(raw.finishAt))`,紧跟着 `if (finishAt < 0) continue`
   * ——夹到 0 之后那个 continue 永远不会触发。而 finishAt=0 意味着「已在过去到期」,
   * 玩家一进游戏就被迫结算一笔本不该有的寄卖,钱和货都凭空产生。
   *
   * 变异扫描把这一处的 Math.max 报成「改坏了不会红」,因为既有用例只喂过正常时间戳。
   */
  it('sanitize:负 finishAt 的寄卖整条丢弃,不夹成「立即到期」', () => {
    const market = useMarketStore()
    const now = Date.now()
    market.$patch({
      consign: [
        { slot: 0, tier: 3, qualityRank: 1, price: { m: 5, e: 0 }, finishAt: -1, name: '坏' },
        { slot: 1, tier: 3, qualityRank: 1, price: { m: 5, e: 0 }, finishAt: -1e12, name: '坏' },
        { slot: 2, tier: 3, qualityRank: 1, price: { m: 5, e: 0 }, finishAt: now + 60_000, name: '好' }
      ] as never
    })
    market.sanitize()
    expect(market.consign, '两条坏的该丢掉,只留一条好的').toHaveLength(1)
    expect(market.consign[0]!.name).toBe('好')
    expect(market.consign.every(p => p.finishAt > 0), '留下来的都得是未来时刻').toBe(true)
  })

  it('sanitize:寄卖格号重复只理顺号,一件都不丢、各自内容不串', () => {
    const market = useMarketStore()
    const now = Date.now()
    market.$patch({
      consign: [
        { slot: 0, tier: 3, qualityRank: 1, price: { m: 5, e: 0 }, finishAt: now + 1000, name: '甲' },
        { slot: 0, tier: 4, qualityRank: 2, price: { m: 6, e: 0 }, finishAt: now + 2000, name: '乙' }
      ]
    })
    market.sanitize()
    expect(market.consign, '两件都是玩家的东西,一条都不许丢').toHaveLength(2)
    expect(market.consign.map(p => p.slot).sort()).toEqual([0, 1])
    // 先到期的在前
    expect(market.consign[0]!.name).toBe('甲')
    // 逐项比内容:只数条数会放过拿第一件副本顶替第二件
    expect(market.consign.map(p => p.name).sort(), '两件各自的名字都得在').toEqual(['乙', '甲'])
    expect(market.consign.map(p => p.tier).sort(), '层级不串').toEqual([3, 4])
    expect(market.consign.map(p => toNum(p.price)).sort(), '合法寄卖价原样保留,不串').toEqual([5, 6])
  })

  it('sanitize:寄卖多于格子上限也不丢,照样入账', () => {
    const market = useMarketStore()
    const now = Date.now()
    const many = Array.from({ length: MARKET_CONSIGN_SLOTS + 2 }, (_, i) => ({
      slot: i,
      tier: 3,
      qualityRank: 1,
      price: { m: 5, e: 0 },
      finishAt: now + 1000 + i,
      name: `件${i}`
    }))
    market.$patch({ consign: many })
    market.sanitize()
    expect(market.consign.length, '超出上限的也是玩家已交出去的货,不能悄悄吞掉').toBe(MARKET_CONSIGN_SLOTS + 2)
  })
})

describe('坊市 · 刷新窗口时序(sync 与到期)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('货还新鲜、未到刷新窗:sync 原样保架,不重上货、时刻不动', () => {
    const m = useMarketStore()
    const now = 1_000_000_000_000
    m.$patch({ stock: [pillSlot(0)], stockedAt: now - 1000 })
    m.sync(now)
    expect(m.stock).toEqual([pillSlot(0)])
    expect(m.stockedAt).toBe(now - 1000)
  })

  it('一过刷新窗(sync 时 now ≥ stockedAt+REFRESH):重上一架,时刻推进到 now', () => {
    const m = useMarketStore()
    const now = 1_000_000_000_000
    m.$patch({ stock: [pillSlot(0)], stockedAt: now - MARKET_REFRESH_SECONDS * 1000 - 1 })
    m.sync(now)
    expect(m.stockedAt).toBe(now) // 锚到本次调用,不会立刻复刷
  })

  it('marketRemainingSec:恰好到期=0、临近为正、已过被夹回 0(绝不回负)', () => {
    const x = 1_000_000_000_000
    const windowMs = MARKET_REFRESH_SECONDS * 1000
    expect(marketRemainingSec(x, x + windowMs)).toBe(0)
    expect(marketRemainingSec(x, x + windowMs - 5000)).toBe(5)
    expect(marketRemainingSec(x, x + windowMs + 5000)).toBe(0)
  })
})

/** collectConsign 逐件按 finishAt<=now 入账,余格 sort+reindex 回 0..n-1 */
describe('寄卖 · 多格部分回款与槽位归整', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function seatTwo(): { market: ReturnType<typeof useMarketStore>; res: ReturnType<typeof useResourcesStore> } {
    const market = useMarketStore()
    const res = useResourcesStore()
    const inv = useInventoryStore()
    inv.$patch({
      items: [
        { uid: 'A', templateId: 'xa', quality: 'mortal', tier: 2, level: 0, affixes: [] },
        { uid: 'B', templateId: 'xb', quality: 'fine', tier: 8, level: 0, affixes: [] }
      ]
    })
    expect(market.consignEquip('A', 1000)).toBe('ok')
    expect(market.consignEquip('B', 1000)).toBe('ok')
    expect(market.consign).toHaveLength(MARKET_CONSIGN_SLOTS)
    return { market, res }
  }

  it('两格一售一候:只售出那份到账、候件分文不动、余槽归整到 0(无洞)', () => {
    const { market, res } = seatTwo()
    const sold = market.consign[0]!
    const pending = market.consign[1]!
    expect(toNum(sold.price)).not.toBe(toNum(pending.price)) // 两件价不同
    sold.finishAt = 0 // 售出
    pending.finishAt = 99999 // 仍候
    expect(res.spiritStone).toEqual(gn(0))
    const credits = market.collectConsign(5000)
    expect(toNum(res.spiritStone)).toBeCloseTo(toNum(sold.price), 5)
    expect(credits, '只报售出的名字').toEqual([sold.name])
    expect(market.consign).toHaveLength(1)
    const keep = market.consign[0]!
    expect(keep.slot).toBe(0)
    expect(toNum(keep.price)).toBeCloseTo(toNum(pending.price), 5)
  })

  it('第二次收割:候件也到期 -> 两笔全额到账、腾空', () => {
    const { market, res } = seatTwo()
    const p0 = toNum(market.consign[0]!.price)
    const p1 = toNum(market.consign[1]!.price)
    market.consign[0]!.finishAt = 0
    market.consign[1]!.finishAt = 0
    const credits = market.collectConsign(5000)
    expect(credits).toHaveLength(2)
    expect(toNum(res.spiritStone)).toBeCloseTo(p0 + p1, 5)
    expect(market.consign).toHaveLength(0)
  })
})

/** sellHerb/sellMaterial 扣一批(MARKET_MAT_COUNT),按批价入账(herbSellBatch / materialSellPrice) */
describe('即时售材/售草结算精额守恒', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('sellHerb:扣恰 N×MARKET_MAT_COUNT、连售 N 批恰入 N×herbSellBatch(无漂移)', () => {
    const market = useMarketStore()
    const res = useResourcesStore()
    const N = 3
    const g = 3
    usePlayerStore().major = 10 // 非零境:sellHerb 若恒按 0 定价,此断言红
    res.herbByGrade[g] = N * MARKET_MAT_COUNT
    res.spiritStone = gn(0)
    const batch = herbSellBatch(g, 10) // 售草以当前境界 10 折算
    for (let i = 0; i < N; i += 1) expect(market.sellHerb(g)).toBe(true)
    expect(res.herbByGrade[g]).toBe(0)
    expect(toNum(res.spiritStone)).toBeCloseTo(toNum(batch) * N, 6)
  })

  it('sellHerb 单批恰入 herbSellBatch(批价,不是单株价)', () => {
    const market = useMarketStore()
    const res = useResourcesStore()
    usePlayerStore().major = 10
    res.herbByGrade[1] = MARKET_MAT_COUNT
    res.spiritStone = gn(0)
    expect(market.sellHerb(1)).toBe(true)
    expect(toNum(res.spiritStone)).toBeCloseTo(toNum(herbSellBatch(1, 10)), 6)
  })

  it('sellMaterial:按 materialSellPrice 入账、扣恰 MARKER_MAT_COUNT ore', () => {
    const market = useMarketStore()
    const res = useResourcesStore()
    res.ore = MARKET_MAT_COUNT * 2
    res.spiritStone = gn(0)
    expect(market.sellMaterial(0)).toBe(true)
    expect(res.ore).toBe(MARKET_MAT_COUNT)
    expect(toNum(res.spiritStone)).toBeCloseTo(toNum(materialSellPrice(0)), 6)
  })

  /** 议题 #130:「去坊市续草」指方子要的那一品,不是有草就行 */
  describe('focusHerbSlot —— 续草该指哪一格', () => {
    const herb = (idx: number, grade: number | undefined, sold = false): MarketSlot =>
      ({ kind: 'material', idx, matId: 'herb', ...(grade === undefined ? {} : { grade }), count: 12, price: { m: 5, e: 0 }, sold }) as MarketSlot
    const ore = (idx: number): MarketSlot =>
      ({ kind: 'material', idx, matId: 'ore', count: 12, price: { m: 5, e: 0 }, sold: false }) as MarketSlot

    it('两品草同时在架:挑方子要的那一品,不挑先出现的那格', () => {
      const stock = [herb(0, 1), ore(1), herb(2, 2)]
      const { slot, soldOut } = focusHerbSlot(stock, 2, 1)
      expect(slot?.idx, '要灵品草就该指灵品格').toBe(2)
      expect(soldOut).toBe(false)
    })

    it('要的那一品已售罄:报 soldOut,而不是「压根没这品」', () => {
      const stock = [herb(0, 2, true), herb(1, 1)]
      const r = focusHerbSlot(stock, 2, 1)
      expect(r.slot, '卖光的格不能当落点').toBeNull()
      expect(r.soldOut, '有货但售罄与没进货是两种处境').toBe(true)
    })

    it('这架没进这一品草:落到 none —— 不拿别品的草冒充,也不去指玄铁格', () => {
      const stock = [herb(0, 1), ore(1)]
      const r = focusHerbSlot(stock, 2, 1)
      expect(r.slot).toBeNull()
      expect(r.soldOut).toBe(false)
    })

    it('旧档草格没有 grade:按显示兜底品认,与买下后入账同源', () => {
      const stock = [herb(0, undefined)]
      expect(focusHerbSlot(stock, 1, 1).slot?.idx, '兜底品就是显示品,该认得出').toBe(0)
      expect(focusHerbSlot(stock, 2, 1).slot, '兜底品是凡品,不该冒充灵品').toBeNull()
    })
  })
})

describe('坊市 · 坏档格号', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('给定负数的格号,当 sanitize,则该格被夹回 0 号而非保留负数', () => {
    /*
     * `Math.max(0, Math.floor(rawIdx))` 是真守卫:去掉后负 idx 会成为货架实际格号,
     * 而买入/寄卖都按 idx 定位格子 —— 负号会让定位落到不存在的下标上。
     */
    const m = useMarketStore()
    m.$patch({ stock: [pillSlot(-3)], stockedAt: FAR })
    m.sanitize()
    expect(m.stock.length, '负号格不该被整格丢弃(它有合法内容)').toBe(1)
    expect(m.stock[0]!.idx, '格号该夹回 0').toBe(0)
    expect(m.stock[0]!.idx).toBeGreaterThanOrEqual(0)
  })

  it('给定小数的格号,当 sanitize,则取整', () => {
    const m = useMarketStore()
    m.$patch({ stock: [pillSlot(3.7)], stockedAt: FAR })
    m.sanitize()
    expect(m.stock[0]!.idx).toBe(3)
  })
})

describe('坊市 · 坏档格号挤掉好货', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('给定坏档格号(-3)排在合法 0 号装备之前,当 sanitize,则保留原号合法的装备', () => {
    /*
     * 夹到 0 的坏行若排在前面,按「先到先得」会把真正的 0 号装备挤掉 ——
     * 玩家看到装备凭空少一件、报价也对不上。认号时须让原号本就合法的那行优先。
     */
    const m = useMarketStore()
    m.$patch({
      stock: [
        { kind: 'equipment', idx: -3, tier: 3, minQualityRank: 0, price: { m: 77, e: 0 }, sold: false },
        { kind: 'equipment', idx: 0, tier: 5, minQualityRank: 0, price: { m: 999, e: 0 }, sold: false }
      ],
      stockedAt: FAR
    })
    m.sanitize()
    const equip = (m.stock as { kind: string; idx: number; tier?: number }[]).filter(s => s.kind === 'equipment')
    expect(equip.some(e => e.tier === 5), '原号合法的 5 阶装备不该被挤掉').toBe(true)
    expect(equip.every(e => e.idx >= 0), '格号都该是非负').toBe(true)
  })

  /*
   * minQualityRank 的**下限**同样要夹 —— 上限那条已有用例(999 → divine)。
   *
   * 它决定货架上那件最低能出什么品质:负的 rank 会让 qualityDef 取到不存在的档,
   * 而 `buy` 时按它生成装备,玩家买到的是件没品质的物件。
   * 变异扫描报这处夹子「改坏了不会红」——既有用例只喂过 0 与 999,没喂过负数。
   */
  it('给定负的 minQualityRank,当 sanitize,则夹回最低品质', () => {
    const m = useMarketStore()
    m.$patch({
      stock: [
        { kind: 'equipment', idx: 0, tier: 3, minQualityRank: -7, price: { m: 50, e: 0 }, sold: false },
        { kind: 'equipment', idx: 1, tier: 3, minQualityRank: -1e9, price: { m: 50, e: 0 }, sold: false }
      ],
      stockedAt: FAR
    })
    m.sanitize()
    for (const slot of m.stock) {
      if (slot.kind !== 'equipment') continue
      expect(slot.minQualityRank, '负的 minQualityRank 该夹回 0').toBe(0)
    }
    // 夹回之后仍须买得动,且拿到的品质是合法的
    const res = useResourcesStore()
    const inventory = useInventoryStore()
    res.spiritStone = gn(1e6)
    expect(m.buy(0), '夹回后该能正常买入').toBe('ok')
    expect(inventory.items, '该入账一件').toHaveLength(1)
    expect(() => qualityDef(inventory.items[0]!.quality), '品质须是合法档').not.toThrow()
  })
})
