/**
 * 坊市状态 —— 货架与刷新时刻(持久化,须带 sanitize;见 storeResilience.spec)
 *
 * 只存「这架货与几点上架」两件事实,装备实例不落库存:每格装备只存
 * (tier, 品质下限),要预览/购买时由 marketService 按 (stockedAt, idx) 确定性再生,
 * 预览与购买同源同一物,坏档也只需在货架格这一层修形。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { GNum } from '@/types'
import { gn, gnZero } from '@/utils/gnum'
import { persistConfig } from '@/utils/storage'
import { rng } from '@/utils/random'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { pillDef } from '@/data/pills'
import { MARKET_REFRESH_SECONDS, type MarketSlot } from '@/data/market'
import { generateMarketStock, marketEquipInstance } from '@/core/marketService'
import { asArray, asFiniteNumber } from '@/utils/saveShape'

export type MarketBuyResult = 'ok' | 'sold' | 'poor' | 'bagfull' | 'missing'

/** 货架里的价格坏了就归零(归零意味着「买得起」;上货会重填,故不会真以零成交) */
function gprice(v: unknown): GNum {
  if (v && typeof v === 'object' && 'm' in v && 'e' in v) {
    const m = v.m as number
    const e = v.e as number
    if (Number.isFinite(m) && Number.isFinite(e)) return gn({ m, e })
  }
  return gnZero()
}

function safeIdx(v: unknown, fallback: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.floor(v as number)) : fallback
}

export const useMarketStore = defineStore(
  'market',
  () => {
    const stock = ref<MarketSlot[]>([])
    const stockedAt = ref(0)

    /** 存档修复:货架逐格修形,烂格整格丢弃(少一件货好过白屏);时刻夹回非负 */
    function sanitize(): void {
      stockedAt.value = Math.max(0, asFiniteNumber(stockedAt.value, 0))
      const clean: MarketSlot[] = []
      for (const raw of asArray<unknown>(stock.value)) {
        if (!raw || typeof raw !== 'object' || !('kind' in raw)) continue
        const kind = raw.kind
        if (kind !== 'pill' && kind !== 'material' && kind !== 'equipment') continue
        const sold = 'sold' in raw && raw.sold === true
        const idx = safeIdx('idx' in raw ? raw.idx : undefined, clean.length)

        if (kind === 'pill') {
          if (!('pillId' in raw) || typeof raw.pillId !== 'string' || !pillDef(raw.pillId)) continue
          clean.push({
            kind,
            idx,
            pillId: raw.pillId,
            count: Math.max(1, Math.floor(Number('count' in raw ? raw.count : 1) || 1)),
            price: gprice('price' in raw ? raw.price : undefined),
            sold
          })
        } else if (kind === 'material') {
          const matId = 'matId' in raw ? raw.matId : undefined
          if (matId !== 'herb' && matId !== 'ore') continue
          clean.push({
            kind,
            idx,
            matId,
            count: Math.max(1, Math.floor(Number('count' in raw ? raw.count : 1) || 1)),
            price: gprice('price' in raw ? raw.price : undefined),
            sold
          })
        } else {
          clean.push({
            kind,
            idx,
            tier: Math.max(0, Math.floor(Number('tier' in raw ? raw.tier : 0) || 0)),
            minQualityRank: Math.max(0, Math.floor(Number('minQualityRank' in raw ? raw.minQualityRank : 0) || 0)),
            price: gprice('price' in raw ? raw.price : undefined),
            sold
          })
        }
      }
      stock.value = clean
    }

    /** 货架空、或已过刷新窗口则重上一架;此刻的架内货不动 */
    function sync(now: number): void {
      if (stock.value.length > 0 && now < stockedAt.value + MARKET_REFRESH_SECONDS * 1000) return
      const player = usePlayerStore()
      const gen = generateMarketStock(player.major, rng, now)
      stock.value = gen.goods
      stockedAt.value = gen.stockedAt
    }

    /** 买下第 idx 格;装备先验行囊满否、再扣灵石,次序错了会「花了钱没拿到货」 */
    function buy(idx: number): MarketBuyResult {
      const now = Date.now()
      sync(now)
      const slot = stock.value.find(s => s.idx === idx)
      if (!slot) return 'missing'
      if (slot.sold) return 'sold'
      const inventory = useInventoryStore()
      if (slot.kind === 'equipment' && inventory.bagFull) return 'bagfull'
      const resources = useResourcesStore()
      if (!resources.spendStone(slot.price)) return 'poor'
      if (slot.kind === 'pill') {
        inventory.addPill(slot.pillId, slot.count)
      } else if (slot.kind === 'material') {
        resources.addSmall(slot.matId, slot.count)
      } else {
        inventory.addEquipment(marketEquipInstance(slot, stockedAt.value))
      }
      slot.sold = true
      return 'ok'
    }

    return { stock, stockedAt, sanitize, sync, buy }
  },
  { persist: persistConfig('market') }
)
