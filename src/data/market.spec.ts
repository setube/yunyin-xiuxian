/** 坊市货架生成与定价:数据层不变量 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mulberry32, RandomService } from '@/utils/random'
import { toNum } from '@/utils/gnum'
import { pillDef } from '@/data/pills'
import { MAX_MAJOR } from '@/data/realms'
import {
  MARKET_MAT_COUNT,
  MARKET_CONSIGN_RENDER_MAX,
  MARKET_CONSIGN_SLOTS,
  MARKET_PILL_MARKUP,
  MARKET_SLOTS,
  type MarketEquipSlot
} from '@/data/market'
import { generateMarketStock, marketEquipInstance, marketTier, salePills } from '@/core/marketService'
import { pillStoneCost } from '@/core/pillService'
import { equipBountyReward } from '@/core/bountyService'
import { qualityDef } from '@/data/qualities'
import { rollQuality } from '@/core/equipGen'

const ROOT = resolve(__dirname, '../..')

function rng(seed = 0x5eed): RandomService {
  return new RandomService(mulberry32(seed))
}

describe('坊市 · 货架生成', () => {
  /** 寄卖两个上限:SLOTS 是能挂几件(玩法),RENDER_MAX 是铺几格(渲染护栏;坏档/导入档可塞成千上万条) */
  it('寄卖渲染上限存在且不低于正常格数,也不至于铺出长列表', () => {
    expect(MARKET_CONSIGN_RENDER_MAX).toBeGreaterThanOrEqual(MARKET_CONSIGN_SLOTS)
    expect(MARKET_CONSIGN_RENDER_MAX).toBeLessThanOrEqual(10)
  })

  /**
   * 货层与定价必须同层。
   *
   * 原先生成单格时 `marketTier(major)` 被调四次(材料价、品质下限、装备生成、货层与装备价),
   * 而 maxTierForMajor 要扫一遍全部地界 —— 一架子六格就是二十四遍全表扫。
   * 现算一次提出去。本条钉住两件事:装备的 tier 与它按哪个层级定价是同一次算出来的,
   * 且跨 major 逐档扫下来没有哪一档分叉。
   */
  it('装备的货层与定价同层(同一个市场层级只算一次)', () => {
    for (let major = 0; major <= MAX_MAJOR; major += 1) {
      const tier = marketTier(major)
      for (const slot of generateMarketStock(major, rng(major + 7), 1700000000000).goods) {
        if (slot.kind !== 'equipment') continue
        expect(slot.tier, `major ${major} 的装备货层不是市场层级`).toBe(tier)
      }
    }
  })

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

  /**
   * 品质下限同样是层级尺:rollQuality 的 tier 语义是区域层级(品质窗口与 tierBoost 都按它算),
   * 喂 major(0~20)会让高价货架兑现低品质 —— 混沌道祖处均价买到的比同层掉落差两档多。
   * 统计口径:同一批货架的下限均值须贴近「按层级掷」,而非「按 major 掷」。
   * 故障注入:改回 rollQuality(major, …) → 本条红。
   */
  it('装备货的品质下限也骑市场层级 —— 不拿 major 大阶当 tier 掷', () => {
    const meanStockFloor = (major: number): number => {
      let sum = 0
      let n = 0
      for (let s = 0; s < 120; s += 1) {
        for (const slot of generateMarketStock(major, rng(major * 1000 + s), 1).goods) {
          if (slot.kind !== 'equipment') continue
          sum += (slot as MarketEquipSlot).minQualityRank
          n += 1
        }
      }
      return sum / n
    }
    const meanRollFloor = (tier: number): number => {
      let sum = 0
      for (let i = 0; i < 400; i += 1) sum += rollQuality(tier, rng(tier * 7919 + i)).rank
      return sum / 400
    }
    for (const major of [8, 14, 20]) {
      const tier = marketTier(major)
      const byTier = meanRollFloor(tier)
      const byMajor = meanRollFloor(major)
      const stock = meanStockFloor(major)
      // 两把尺在高境差得开(层级 32 vs 境界 20),货架须站到层级那一侧
      expect(byTier - byMajor, `major ${major}:两把尺没拉开差距,这条判据失去意义`).toBeGreaterThan(1.5)
      expect(stock, `major ${major}:货架品质下限贴着 major 尺(${byMajor.toFixed(2)}),应为层级尺(${byTier.toFixed(2)})`).toBeGreaterThan(
        (byTier + byMajor) / 2
      )
    }
  })

  it('装备货按市场标尺(层级曲线)生成 —— 不拿 major 大阶按市场层级标价', () => {
    for (let major = 3; major <= 20; major += 5) {
      for (let s = 0; s < 10; s += 1) {
        for (const slot of generateMarketStock(major, rng(major + s), 1).goods) {
          if (slot.kind !== 'equipment') continue
          // 定价骑在 1.9^市场层级 上;货按 major 层级生成则买来的比掉落次一层
          expect((slot as MarketEquipSlot).tier, `major ${major} 的装备货应为市场层级`).toBe(marketTier(major))
        }
      }
    }
  })

  it('丹药价 = 炼制石耗 × 倍率,绝不比自炼便宜(无套利,全境界含顶层)', () => {
    // 须含顶层:基准是 layer 曲线上的 pillStoneCost;写死 stoneBase×2.5 时道祖丹低标约 4 千万倍
    for (const major of [0, 3, MAX_MAJOR]) {
      const stock = generateMarketStock(major, rng(major + 0x222), 1)
      for (const s of stock.goods) {
        if (s.kind !== 'pill') continue
        const def = pillDef(s.pillId)!
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
    // 坊价按「预览同一件」的真实品质档标价,不按品质下限
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

/**
 * 市场层级只能算一次。
 *
 * `marketTier(major)` 走 `maxTierForMajor`,那是把全部地界扫一遍。
 * 单格生成原先调四次(材料价 / 品质下限 / 装备生成 / 货层与装备价),
 * 一架子六格二十四遍 —— 而结果只由 major 决定,算一次就够。
 *
 * 判据读源码:生成函数里 `marketTier(major)` 只许出现一次(提出来的那一处),
 * 且确实提成了 `const tier`。故障注入:把任何一处改回 `marketTier(major)`,本条红。
 */
describe('坊市 · 市场层级只算一次', () => {
  const SERVICE = readFileSync(resolve(ROOT, 'src/core/marketService.ts'), 'utf-8')
  /** 单格生成函数的正文;按函数名切,不按行号 */
  const SLOT_FN = (() => {
    const start = SERVICE.indexOf('function buildSlot')
    expect(start, '找不到单格生成函数 —— 判据要跟着改名').toBeGreaterThan(-1)
    const next = SERVICE.indexOf('\nfunction ', start + 1)
    return SERVICE.slice(start, next > 0 ? next : undefined)
  })()

  it('生成函数里 marketTier(major) 只出现一次,且提成了常量', () => {
    const calls = SLOT_FN.match(/marketTier\(major\)/g) ?? []
    expect(calls.length, `单格生成里调了 ${calls.length} 次 marketTier(major)`).toBe(1)
    expect(SLOT_FN, '该提成 const tier').toMatch(/const tier = marketTier\(major\)/)
  })

  it('提出来之后各处读同一份 tier,不另算', () => {
    expect(SLOT_FN, '材料价该读 tier').toContain('stoneByTier(tier, MARKET_MAT_STONE_UNITS)')
    expect(SLOT_FN, '品质下限该读 tier').toContain('rollQuality(tier, rng)')
    expect(SLOT_FN, '装备生成该读 tier').toContain('generateEquipment(tier,')
    expect(SLOT_FN, '装备价该读 tier').toContain('stoneByTier(tier, MARKET_EQUIP_STONE_BASE')
  })
})
