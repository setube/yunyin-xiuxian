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
import { MAX_EQUIP_TIER, equipmentTemplate } from '@/data/equipment'
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

/**
 * `expired` = 点下去的这一瞬正好跨过换货窗口:货架已整架换新,`idx` 指的是另一格货。
 *
 * 单靠 idx 认货的话,这时会**买下玩家没看过的那件**:灵石照扣,装备品质还按新的
 * `(stockedAt, idx)` 再生 —— 与屏幕上那格的标价、品相全对不上。宁可不成交。
 */
export type MarketBuyResult = 'ok' | 'sold' | 'poor' | 'bagfull' | 'missing' | 'expired'

export const useMarketStore = defineStore(
  'market',
  () => {
    const stock = ref<MarketSlot[]>([])
    const stockedAt = ref(0)
    const consign = ref<ConsignPost[]>([])

    /**
     * 存档修复:货架逐格修形,烂格整格丢弃(少一件货好过白屏);时刻夹回非负。
     *
     * 格号(idx)缺失的格子整格丢弃:无从确认原号,补号会让装备标价与实得品质分叉。
     *
     * 重复号则分两类收口:
     * - 装备:品质由 (stockedAt, idx) 确定性再生,**改号会让标价与实得品质分叉**,
     *   故仍只留先出现的那格;
     * - 丹/料:货与价都直接存着,不依赖格号再生,重排到最小空闲号即可保货。
     *   旧实现一律丢弃,坏档里两格同号就静默少一件货 —— 这不是玩家该付的代价。
     * 先完整校验、再按序认号:坏格不会抢走后面好货的号。
     */
    function sanitize(): void {
      stockedAt.value = Math.max(0, asFiniteNumber(stockedAt.value, 0))
      const validated: MarketSlot[] = []
      const usedIdx = new Set<number>()
      for (const raw of asArray<unknown>(stock.value)) {
        if (!raw || typeof raw !== 'object' || !('kind' in raw)) continue
        const kind = raw.kind
        if (kind !== 'pill' && kind !== 'material' && kind !== 'equipment') continue
        const sold = 'sold' in raw && raw.sold === true
        const rawIdx = 'idx' in raw ? raw.idx : undefined
        if (typeof rawIdx !== 'number' || !Number.isFinite(rawIdx)) continue
        const idx = Math.max(0, Math.floor(rawIdx))

        if (kind === 'pill') {
          if (!('pillId' in raw) || typeof raw.pillId !== 'string' || !pillDef(raw.pillId)) continue
          const price = asPrice('price' in raw ? raw.price : undefined)
          if (price.m <= 0) continue
          validated.push({
            kind,
            idx,
            pillId: raw.pillId,
            count: 1,
            price,
            sold
          })
        } else if (kind === 'material') {
          const matId = 'matId' in raw ? raw.matId : undefined
          if (matId !== 'herb' && matId !== 'ore') continue
          const price = asPrice('price' in raw ? raw.price : undefined)
          if (price.m <= 0) continue
          // 上货时钉死的灵草品阶要跨读档保留 —— 否则每次读档都掉回无级,
          // 「标价/入账/显示同源」约定失效,还可靠出入档白赚品阶差
          const g = 'grade' in raw ? raw.grade : undefined
          validated.push({
            kind,
            idx,
            matId,
            grade: isHerbGrade(g) ? g : undefined,
            count: MARKET_MAT_COUNT,
            price,
            sold
          })
        } else {
          const price = asPrice('price' in raw ? raw.price : undefined)
          if (price.m <= 0) continue
          validated.push({
            kind,
            idx,
            tier: Math.min(MAX_EQUIP_TIER, Math.max(1, Math.floor(Number('tier' in raw ? raw.tier : 1) || 1))),
            minQualityRank: Math.min(
              qualityDef('divine').rank,
              Math.max(0, Math.floor(Number('minQualityRank' in raw ? raw.minQualityRank : 0) || 0))
            ),
            price,
            sold
          })
        }
      }
      /*
       * 两阶段认号:先让装备占住原号,再给丹/料补空位。
       * 若按原顺序边扫边补,前面一个重复丹格可能先改号,反而把后面某件
       * 装备的原号占掉 —— 装备一旦改号就卖出另一件品相,代价比丹料大得多。
       */
      const equipmentIdx = new Set<number>()
      for (const slot of validated) {
        if (slot.kind !== 'equipment') continue
        if (equipmentIdx.has(slot.idx)) continue
        equipmentIdx.add(slot.idx)
      }
      // 装备先占号:后出现的丹/料不能把已上架装备的原号挤走
      for (const idx of equipmentIdx) usedIdx.add(idx)
      const clean: MarketSlot[] = []
      const placedEquipment = new Set<number>()
      for (const slot of validated) {
        if (slot.kind === 'equipment') {
          if (placedEquipment.has(slot.idx)) continue
          placedEquipment.add(slot.idx)
          clean.push(slot)
          continue
        }
        let idx = slot.idx
        while (usedIdx.has(idx)) idx += 1
        usedIdx.add(idx)
        clean.push(idx === slot.idx ? slot : { ...slot, idx })
      }
      stock.value = clean

      const posts: ConsignPost[] = []
      for (const raw of asArray<unknown>(consign.value)) {
        if (!raw || typeof raw !== 'object' || !('finishAt' in raw)) continue
        const finishAt = Number.isFinite(raw.finishAt) ? Math.max(0, Math.floor(raw.finishAt as number)) : -1
        if (finishAt < 0) continue
        const rawTier = Number('tier' in raw ? raw.tier : 1)
        const rawQualityRank = Number('qualityRank' in raw ? raw.qualityRank : 0)
        const tier = Math.min(MAX_EQUIP_TIER, Math.max(1, Math.floor(rawTier || 1)))
        const qualityRank = Math.min(
          qualityDef('divine').rank,
          Math.max(0, Math.floor(rawQualityRank || 0))
        )
        const price = asPrice('price' in raw ? raw.price : undefined)
        const badTier = !Number.isFinite(rawTier) || rawTier < 1 || rawTier > MAX_EQUIP_TIER
        const badQualityRank =
          !Number.isFinite(rawQualityRank) || rawQualityRank < 0 || rawQualityRank > qualityDef('divine').rank
        posts.push({
          slot: Math.max(0, Math.floor(Number('slot' in raw ? raw.slot : posts.length) || 0)),
          tier,
          qualityRank,
          // 寄卖价是玩家交货时定下的契约;只有价格或层级/品质坏掉时才按同一公式重建。
          price: price.m > 0 && !badTier && !badQualityRank ? price : consignPrice(tier, qualityRank),
          finishAt,
          name: 'name' in raw && typeof raw.name === 'string' ? raw.name : ''
        })
      }
      /*
       * 寄卖格号重排成唯一的 0..n-1:界面按格号铺格子,坏档里两条寄卖写同一个号时,
       * 后一条会被前一条盖住 —— 玩家只看见一件,到点却两笔都入账(给而不报)。
       * 这里不丢任何一条(那是玩家的东西),只把号理顺;格子数由界面按实际条数铺。
       */
      consign.value = posts
        .sort((a, b) => a.finishAt - b.finishAt || a.slot - b.slot)
        .map((p, i) => ({ ...p, slot: i }))
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
      const before = stock.value
      sync(now)
      // 换货了:idx 现在指的是另一格货,不能替玩家买下他没看过的那件
      if (before.length > 0 && stock.value !== before) return 'expired'
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
