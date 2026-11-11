/**
 * 坊市状态 —— 货架与刷新时刻(持久化,须带 sanitize;见 storeResilience.spec)
 * 装备实例不落库存:每格只存 (tier, 品质下限),预览/购买时由 marketService 按 (stockedAt, idx) 确定性再生,预览与购买同源同一物
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
import { asArray, asPrice, asTimestamp } from '@/utils/saveShape'
import { gnZero, mulN } from '@/utils/gnum'
import type { GNum } from '@/types'

/** `expired` = 点下去的这一瞬正好跨过换货窗口:货架已整架换新,`idx` 指的是另一格货;宁可不成交 */
export type MarketBuyResult = 'ok' | 'sold' | 'poor' | 'bagfull' | 'missing' | 'expired'

export const useMarketStore = defineStore(
  'market',
  () => {
    const stock = ref<MarketSlot[]>([])
    const stockedAt = ref(0)
    const consign = ref<ConsignPost[]>([])

    /**
     * 存档修复:货架逐格修形,烂格与格号(idx)缺失的格子整格丢弃;时刻夹回非负。
     * 重复号:装备只留先出现的那格(改号会让标价与实得品质分叉);丹/料重排到最小空闲号保货。
     * 先完整校验、再按序认号:坏格不会抢走后面好货的号。
     */
    function sanitize(): void {
      /*
       * 货架起钟要**夹到此刻**,不能只保底。
       *
       * `sync()` 的判据是 `now < stockedAt + MARKET_REFRESH_SECONDS * 1000` ——
       * 起钟落在未来时该条件恒真,**货架永不刷新**(坏档/时钟调快)。
       * `asTimestamp` 只挡「超出 Date 可表示范围」,不挡方向,故这里补 `Math.min`。
       * 与 `player.suppressedSince`(第 76 轮)、洞府巡游 `lastCaveEventDay`(第 54 轮)同一处理。
       */
      stockedAt.value = Math.min(Math.max(0, asTimestamp(stockedAt.value, 0)), Date.now())
      // idxClean:该行的 idx 原本就是合法非负整数(没被坏档修正过)
      const validated: (MarketSlot & { idxClean: boolean })[] = []
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
            idxClean: typeof rawIdx === 'number' && Number.isFinite(rawIdx) && rawIdx >= 0,
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
          // 上货时钉死的灵草品阶要跨读档保留:否则读档掉回无级,「标价/入账/显示同源」约定失效
          const g = 'grade' in raw ? raw.grade : undefined
          validated.push({
            kind,
            idx,
            idxClean: typeof rawIdx === 'number' && Number.isFinite(rawIdx) && rawIdx >= 0,
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
            idxClean: typeof rawIdx === 'number' && Number.isFinite(rawIdx) && rawIdx >= 0,
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
      // 两阶段认号:先让装备占住原号,再给丹/料补空位;边扫边补时重复丹格会占掉后面装备的原号
      /*
       * 同号冲突时,原号本来就合法的那行优先 —— 坏档里 idx 写成 -3 的行会被夹到 0,
       * 若它排在前面就会把真正的 0 号装备挤掉,玩家看到装备凭空少一件。
       */
      const equipOrder = validated
        .filter(v => v.kind === 'equipment')
        .sort((a, b) => Number(b.idxClean) - Number(a.idxClean))
      const equipmentIdx = new Set<number>()
      for (const slot of equipOrder) {
        if (equipmentIdx.has(slot.idx)) continue
        equipmentIdx.add(slot.idx)
      }
      for (const idx of equipmentIdx) usedIdx.add(idx)
      const clean: MarketSlot[] = []
      const placedEquipment = new Set<number>()
      const orderedValidated = [
        ...validated.filter(v => v.kind === 'equipment').sort((a, b) => Number(b.idxClean) - Number(a.idxClean)),
        ...validated.filter(v => v.kind !== 'equipment')
      ]
      for (const slot of orderedValidated) {
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
        /*
         * 坏档里的负 finishAt 整条丢弃,不夹成 0。
         *
         * 原先是 `Math.max(0, Math.floor(raw.finishAt))`,紧跟着 `if (finishAt < 0) continue`
         * ——夹到 0 之后那个 continue 永远不会触发。而 finishAt=0 意味着「已在过去到期」,
         * 玩家一进游戏就被迫结算一笔本不该有的寄卖,钱和货凭空产生。
         */
        const rawFinishAt = Math.floor(Number(raw.finishAt))
        if (!Number.isFinite(rawFinishAt) || rawFinishAt <= 0) continue
        const finishAt = rawFinishAt
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
          // 寄卖价是交货时定下的契约;只有价格或层级/品质坏掉时才按同一公式重建
          price: price.m > 0 && !badTier && !badQualityRank ? price : consignPrice(tier, qualityRank),
          finishAt,
          name: 'name' in raw && typeof raw.name === 'string' ? raw.name : ''
        })
      }
      // 寄卖格号重排成唯一的 0..n-1,不丢任何一条:界面按格号铺格子,
      // 同号时只看见一件,到点却两笔都入账
      consign.value = posts
        .sort((a, b) => a.finishAt - b.finishAt || a.slot - b.slot)
        .map((p, i) => ({ ...p, slot: i }))
    }

    /** 货架空、或已过刷新窗口则重上一架 */
    function sync(now: number): void {
      if (stock.value.length > 0 && now < stockedAt.value + MARKET_REFRESH_SECONDS * 1000) return
      const player = usePlayerStore()
      const gen = generateMarketStock(player.major, rng, now)
      stock.value = gen.goods
      stockedAt.value = gen.stockedAt
    }

    /** 买下第 idx 格;装备须先验行囊满否再扣灵石,反序会花钱不得货 */
    function buy(idx: number): MarketBuyResult {
      const now = Date.now()
      const before = stock.value
      sync(now)
      // 换货了
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
        // 灵草按上货那一刻的品阶入账(与标价同源);旧档无 grade 按当下品兜底
        if (slot.matId === 'herb') {
          resources.addHerb(slot.grade ?? herbGradeOfMajor(usePlayerStore().major), slot.count)
        } else {
          resources.addSmall('ore', slot.count)
        }
      } else {
        const inst = marketEquipInstance(slot, stockedAt.value)
        inventory.addEquipment(inst)
        // 买来的也计入见闻与收藏,见闻深度与掉落同口径;否则图鉴收录了、收藏页却缺这一件
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
      // 余下格子的 slot 规整回 0..n-1
      keep = keep
        .sort((a, b) => a.slot - b.slot)
        .map((p, i) => ({ ...p, slot: i }))
      consign.value = keep
      return credits
    }

    /** 即时售一枚丹药(仅限可炼丹;无丹方的事件丹无价) */
    function sellPill(pillId: string): boolean {
      const def = pillDef(pillId)
      const inventory = useInventoryStore()
      if (!def?.recipe?.stoneBase || (inventory.pills[pillId] ?? 0) < 1) return false
      inventory.spendPill(pillId, 1)
      useResourcesStore().addStone(pillSellPrice(pillId))
      return true
    }

    /** 即时售一批玄铁(与货架购入同单位数);灵草走 sellHerb */
    function sellMaterial(major: number): boolean {
      const resources = useResourcesStore()
      if (resources.ore < MARKET_MAT_COUNT) return false
      resources.spendSmall('ore', MARKET_MAT_COUNT)
      resources.addStone(materialSellPrice(major))
      return true
    }

    /** 即时售一批任意品阶灵草(按该品计价) */
    function sellHerb(grade: HerbGrade): boolean {
      const resources = useResourcesStore()
      if (resources.herbOf(grade) < MARKET_MAT_COUNT) return false
      resources.spendHerb(grade, MARKET_MAT_COUNT)
      resources.addStone(herbSellBatch(grade, usePlayerStore().major))
      return true
    }

    /**
     * 售尽某一味的全部存货:逐枚走同一个 sellPill,判据与计价都不分叉。
     * 后期丹匣常堆几十枚,一枚一枚点没有意义。
     * @returns 实售枚数与总所得;一枚也没卖出时枚数为 0
     */
    function sellPillAll(pillId: string): { count: number; stone: GNum } {
      const inventory = useInventoryStore()
      const before = inventory.pills[pillId] ?? 0
      let n = 0
      while (n < before && sellPill(pillId)) n += 1
      return { count: n, stone: n > 0 ? mulN(pillSellPrice(pillId), n) : gnZero() }
    }

    /**
     * 售尽某品灵草 / 玄铁:整摞计价,不足一摞即一枚也卖不出。
     * @returns 实售摞数
     */
    function sellHerbAll(grade: HerbGrade): number {
      const resources = useResourcesStore()
      const lots = Math.floor(resources.herbOf(grade) / MARKET_MAT_COUNT)
      let n = 0
      while (n < lots && sellHerb(grade)) n += 1
      return n
    }

    function sellOreAll(major: number): number {
      const resources = useResourcesStore()
      const lots = Math.floor(resources.ore / MARKET_MAT_COUNT)
      let n = 0
      while (n < lots && sellMaterial(major)) n += 1
      return n
    }

    return {
      stock,
      stockedAt,
      consign,
      sanitize,
      sync,
      buy,
      consignEquip,
      collectConsign,
      sellPill,
      sellMaterial,
      sellHerb,
      sellPillAll,
      sellHerbAll,
      sellOreAll
    }
  },
  { persist: persistConfig('market') }
)
