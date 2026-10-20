/**
 * 坊市状态 —— 货架与刷新时刻(持久化,须带 sanitize;见 storeResilience.spec)
 *
 * 只存「这架货与几点上架」两件事实,装备实例不落库存:每格装备只存
 * (tier, 品质下限),要预览/购买时由 marketService 按 (stockedAt, idx) 确定性再生,
 * 预览与购买同源同一物,坏档也只需在货架格这一层修形。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { persistConfig } from '@/utils/storage'
import { rng } from '@/utils/random'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { useLoreStore } from '@/stores/lore'
import { collect } from '@/core/progress'
import { pillDef } from '@/data/pills'
import { equipmentTemplate } from '@/data/equipment'
import { qualityDef } from '@/data/qualities'
import {
  MARKET_REFRESH_SECONDS,
  MARKET_CONSIGN_SLOTS,
  MARKET_CONSIGN_SECONDS,
  MARKET_MAT_COUNT,
  type ConsignPost,
  type MarketSlot
} from '@/data/market'
import { consignPrice, generateMarketStock, herbSellBatch, marketEquipInstance, materialSellPrice, pillSellPrice } from '@/core/marketService'
import type { HerbGrade } from '@/data/herbGrades'
import { herbGradeOfMajor, isHerbGrade } from '@/data/herbGrades'
import { asArray, asFiniteNumber, asPrice } from '@/utils/saveShape'

export type MarketBuyResult = 'ok' | 'sold' | 'poor' | 'bagfull' | 'missing'

export const useMarketStore = defineStore(
  'market',
  () => {
    const stock = ref<MarketSlot[]>([])
    const stockedAt = ref(0)
    const consign = ref<ConsignPost[]>([])

    /**
     * 存档修复:货架逐格修形,烂格整格丢弃(少一件货好过白屏);时刻夹回非负。
     *
     * 格号(idx)缺失或重复的格子整格丢弃。两件事都得这么做:
     * - 重复:购买按 idx 认格,两格同号时 `buy(idx)` 只命中先出现的那一格,
     *   后一格永远买不到(点了没反应),玩家还以为买到的是它;
     * - 缺失/重编号:装备品质由 (stockedAt, idx) 确定性再生,**改号会让标价与
     *   实得品质分叉**,而缺号时又无法确认原号 —— 丢一格好过卖出一件对不上账的货。
     * 先完整校验、再按序认号:坏格不会抢走后面好货的号。
     */
    function sanitize(): void {
      stockedAt.value = Math.max(0, asFiniteNumber(stockedAt.value, 0))
      const clean: MarketSlot[] = []
      const usedIdx = new Set<number>()
      for (const raw of asArray<unknown>(stock.value)) {
        if (!raw || typeof raw !== 'object' || !('kind' in raw)) continue
        const kind = raw.kind
        if (kind !== 'pill' && kind !== 'material' && kind !== 'equipment') continue
        const sold = 'sold' in raw && raw.sold === true
        const rawIdx = 'idx' in raw ? raw.idx : undefined
        if (typeof rawIdx !== 'number' || !Number.isFinite(rawIdx)) continue
        const idx = Math.max(0, Math.floor(rawIdx))
        // 已在校验 kind 之后才认号:坏格不会占掉后面好货的号
        if (usedIdx.has(idx)) continue

        if (kind === 'pill') {
          if (!('pillId' in raw) || typeof raw.pillId !== 'string' || !pillDef(raw.pillId)) continue
          clean.push({
            kind,
            idx,
            pillId: raw.pillId,
            count: Math.max(1, Math.floor(Number('count' in raw ? raw.count : 1) || 1)),
            price: asPrice('price' in raw ? raw.price : undefined),
            sold
          })
        } else if (kind === 'material') {
          const matId = 'matId' in raw ? raw.matId : undefined
          if (matId !== 'herb' && matId !== 'ore') continue
          // 上货时钉死的灵草品阶要跨读档保留 —— 否则每次读档都掉回无级,
          // 「标价/入账/显示同源」约定失效,还可靠出入档白赚品阶差
          const g = 'grade' in raw ? raw.grade : undefined
          clean.push({
            kind,
            idx,
            matId,
            grade: isHerbGrade(g) ? g : undefined,
            count: Math.max(1, Math.floor(Number('count' in raw ? raw.count : 1) || 1)),
            price: asPrice('price' in raw ? raw.price : undefined),
            sold
          })
        } else {
          clean.push({
            kind,
            idx,
            tier: Math.max(0, Math.floor(Number('tier' in raw ? raw.tier : 0) || 0)),
            minQualityRank: Math.max(0, Math.floor(Number('minQualityRank' in raw ? raw.minQualityRank : 0) || 0)),
            price: asPrice('price' in raw ? raw.price : undefined),
            sold
          })
        }
        usedIdx.add(idx)
      }
      stock.value = clean

      const posts: ConsignPost[] = []
      for (const raw of asArray<unknown>(consign.value)) {
        if (!raw || typeof raw !== 'object' || !('finishAt' in raw)) continue
        const finishAt = Number.isFinite(raw.finishAt) ? Math.max(0, Math.floor(raw.finishAt as number)) : -1
        if (finishAt < 0) continue
        posts.push({
          slot: Math.max(0, Math.floor(Number('slot' in raw ? raw.slot : posts.length) || 0)),
          tier: Math.max(0, Math.floor(Number('tier' in raw ? raw.tier : 0) || 0)),
          qualityRank: Math.max(0, Math.floor(Number('qualityRank' in raw ? raw.qualityRank : 0) || 0)),
          price: asPrice('price' in raw ? raw.price : undefined),
          finishAt,
          name: 'name' in raw && typeof raw.name === 'string' ? raw.name : ''
        })
      }
      consign.value = posts
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
        // 灵草按上货那一刻的品阶入账(与标价同源)。旧档货架无 grade 字段 → 按当下品兜底
        if (slot.matId === 'herb') {
          resources.addHerb(slot.grade ?? herbGradeOfMajor(usePlayerStore().major), slot.count)
        } else {
          resources.addSmall('ore', slot.count)
        }
      } else {
        const inst = marketEquipInstance(slot, stockedAt.value)
        inventory.addEquipment(inst)
        // 买来的也计入见闻与收藏:否则图鉴(经装备触发/装备走一遍就有了)收录了、
        // 收藏页却缺这一件,两处对不上。见闻深度与掉落同口径
        const q = qualityDef(inst.quality)
        useLoreStore().noteEquipSeen(inst.templateId, q.rank, inst.tier)
        collect('equip', inst.templateId)
      }
      slot.sold = true
      return 'ok'
    }

    /** 寄卖一件背包装备;离包即定,一到时辰自售入账,不可撤回 */
    function consignEquip(uid: string, now: number): 'ok' | 'full' | 'missing' {
      if (consign.value.length >= MARKET_CONSIGN_SLOTS) return 'full'
      const inventory = useInventoryStore()
      const eq = inventory.bagItems.find(it => it.uid === uid)
      if (!eq) return 'missing'
      const name = equipmentTemplate(eq.templateId)?.name ?? '一件兵刃'
      const slot = consign.value.reduce((max, p) => Math.max(max, p.slot + 1), 0)
      consign.value.push({
        slot: Math.min(slot, MARKET_CONSIGN_SLOTS - 1),
        tier: eq.tier,
        qualityRank: qualityDef(eq.quality).rank,
        price: consignPrice(eq.tier, qualityDef(eq.quality).rank),
        finishAt: now + MARKET_CONSIGN_SECONDS * 1000,
        name
      })
      inventory.removeEquipment(uid)
      return 'ok'
    }

    /** 收割已售出的寄卖:入账灵石,清掉到期的格子,回售出名 */
    function collectConsign(now: number): string[] {
      const credits: string[] = []
      let keep = consign.value.filter(p => p.finishAt > now)
      const resources = useResourcesStore()
      for (const p of consign.value) {
        if (p.finishAt <= now) {
          resources.addStone(p.price)
          if (p.name) credits.push(p.name)
        }
      }
      // 荡平已售出,把余下格子的 slot 规整回 0..n-1
      keep = keep
        .sort((a, b) => a.slot - b.slot)
        .map((p, i) => ({ ...p, slot: i }))
      consign.value = keep
      return credits
    }

    /** 即时售一枚丹药(仅限可炼丹;无丹方的事件丹无价,不当白给) */
    function sellPill(pillId: string): boolean {
      const def = pillDef(pillId)
      const inventory = useInventoryStore()
      if (!def?.recipe?.stoneBase || (inventory.pills[pillId] ?? 0) < 1) return false
      inventory.spendPill(pillId, 1)
      useResourcesStore().addStone(pillSellPrice(pillId))
      return true
    }

    /** 即时售一批**玄铁**(与货架购入同单位数);灵草走 sellHerb(按品) */
    function sellMaterial(major: number): boolean {
      const resources = useResourcesStore()
      if (resources.ore < MARKET_MAT_COUNT) return false
      resources.spendSmall('ore', MARKET_MAT_COUNT)
      resources.addStone(materialSellPrice(major))
      return true
    }

    /** 即时售一批**任意品阶**灵草(按该品计价;凡/灵品旧草也有出口,不留死货) */
    function sellHerb(grade: HerbGrade): boolean {
      const resources = useResourcesStore()
      if (resources.herbOf(grade) < MARKET_MAT_COUNT) return false
      resources.spendHerb(grade, MARKET_MAT_COUNT)
      resources.addStone(herbSellBatch(grade, usePlayerStore().major))
      return true
    }

    return { stock, stockedAt, consign, sanitize, sync, buy, consignEquip, collectConsign, sellPill, sellMaterial, sellHerb }
  },
  { persist: persistConfig('market') }
)
