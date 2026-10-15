/**
 * 坊市货架生成与定价 —— 数据层不变量
 */
import { describe, expect, it } from 'vitest'
import { mulberry32, RandomService } from '@/utils/random'
import { toNum } from '@/utils/gnum'
import { pillDef } from '@/data/pills'
import { MAX_MAJOR } from '@/data/realms'
import {
  MARKET_MAT_COUNT,
  MARKET_PILL_MARKUP,
  MARKET_SLOTS,
  type MarketEquipSlot
} from '@/data/market'
import { generateMarketStock, marketEquipInstance, marketTier, salePills } from '@/core/marketService'
import { pillStoneCost } from '@/core/pillService'
import { equipBountyReward } from '@/core/bountyService'
import { qualityDef } from '@/data/qualities'

function rng(seed = 0x5eed): RandomService {
  return new RandomService(mulberry32(seed))
}

describe('坊市 · 货架生成', () => {
  it('一满架六格,每格有货、有价、未售,索引 0 起不重样', () => {
    const stock = generateMarketStock(3, rng(), 1700000000000)
    expect(stock.goods).toHaveLength(MARKET_SLOTS)
    for (const [i, s] of stock.goods.entries()) {
      expect(s.idx).toBe(i)
      expect(s.sold, '新上架的货不该是售罄').toBe(false)
      expect(toNum(s.price), '每格都该标得出价').toBeGreaterThan(0)
    }
  })

  it('三个门类都可达 —— 架多了,买丹 / 续料 / 淘兵器都得遇上', () => {
    const kinds = new Set<string>()
    for (let s = 0; s < 60; s += 1) {
      for (const slot of generateMarketStock(6, rng(s + 1), 1).goods) kinds.add(slot.kind)
    }
    expect([...kinds].sort()).toEqual(['equipment', 'material', 'pill'])
  })

  it('装备货按市场标尺(层级曲线)生成 —— 不拿 major 大阶按市场层级标价', () => {
    for (let major = 3; major <= 20; major += 5) {
      for (let s = 0; s < 10; s += 1) {
        for (const slot of generateMarketStock(major, rng(major + s), 1).goods) {
          if (slot.kind !== 'equipment') continue
          // 定价骑在 1.9^市场层级 上,货也得是那个层级:major 层级的东西按市场层级标价,
          // 买来的会无端比掉落次一层(身价与货对不上)
          expect((slot as MarketEquipSlot).tier, `major ${major} 的装备货应为市场层级`).toBe(marketTier(major))
        }
      }
    }
  })

  it('丹药价 = 炼制石耗 × 倍率,绝不比自炼便宜(无套利,全境界含顶层)', () => {
    // 全境界扫:顶层是重灾区 —— 旧写死 stoneBase×2.5,道祖丹自炼 ~1.7e11 却只标 4250(4 千万倍白送)
    for (const major of [0, 3, MAX_MAJOR]) {
      const stock = generateMarketStock(major, rng(major + 0x222), 1)
      for (const s of stock.goods) {
        if (s.kind !== 'pill') continue
        const def = pillDef(s.pillId)!
        // 基准是「实际炼制石耗」= layer 曲线上的 pillStoneCost(不是写死 stoneBase)
        const craft = pillStoneCost(def)
        expect(toNum(s.price), `${def.name} 坊价不该低于实际自炼石耗`).toBeGreaterThanOrEqual(toNum(craft))
        expect(toNum(s.price) / toNum(craft), `${def.name} 倍率应恰是 2.5`).toBeCloseTo(MARKET_PILL_MARKUP, 5)
      }
    }
  })

  it('材料一摞固定单位数;零境也有丹可售,任何境界都开得出满架', () => {
    for (const s of generateMarketStock(3, rng(), 1).goods) {
      if (s.kind === 'material') expect(s.count).toBe(MARKET_MAT_COUNT)
    }
    expect(salePills(0).length, '零境也该有拿得到的丹卖').toBeGreaterThan(0)
    expect(generateMarketStock(0, rng(9), 1).goods).toHaveLength(MARKET_SLOTS)
  })

  it('装备按货架时刻确定性再生 —— 预览与购买同源同一物', () => {
    const slot: MarketEquipSlot = { kind: 'equipment', idx: 0, tier: 3, minQualityRank: 1, price: { m: 100, e: 0 }, sold: false }
    const stockedAt = 1700000000000
    const a = marketEquipInstance(slot, stockedAt)
    const b = marketEquipInstance(slot, stockedAt)
    expect(b.templateId).toBe(a.templateId)
    expect(b.quality).toBe(a.quality)
    expect(b.affixes.map(f => f.id)).toEqual(a.affixes.map(f => f.id))
    expect(b.uid, '仅行囊身份标识不同,谁买了就是谁的').not.toBe(a.uid)
  })
})

describe('坊市 · 购入 vs 悬赏贡器 无套利', () => {
  it('同一件装备的坊价必高于贡器所得 —— 买回来交悬赏亏本,不成环', () => {
    // 修过 run-off:原件按「预览同一件」的真实品质档标价,而非品质下限标价
    for (let s = 0; s < 60; s += 1) {
      const stock = generateMarketStock(6, rng(s + 1), 1)
      for (const slot of stock.goods) {
        if (slot.kind !== 'equipment') continue
        const inst = marketEquipInstance(slot, stock.stockedAt)
        const reward = equipBountyReward(inst.tier, qualityDef(inst.quality).rank)
        expect(toNum(slot.price), '坊价须高于贡器所得(同件)').toBeGreaterThan(toNum(reward.stone))
      }
    }
  })
})
