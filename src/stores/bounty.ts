/**
 * 坊市悬赏板状态 —— 当前一版订单与刷新时刻(持久化,须带 sanitize;见 storeResilience.spec)
 *
 * 订单按墙钟走,到期换新;每张交货一次即盖「已交」。交货即验货扣存货/交装,价由
 * bountyService 现算,这里只管入账翻身。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { QualityId } from '@/types'
import { persistConfig } from '@/utils/storage'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { qualityDef } from '@/data/qualities'
import { BOUNTY_REFRESH_SECONDS, type BountyKind, type BountySlot } from '@/data/bounty'
import { MAX_MAJOR } from '@/data/realms'
import { pillDef } from '@/data/pills'
import { equipBountyReward, generateBounty, herbBountyReward } from '@/core/bountyService'
import { HERB_GRADES, type HerbGrade } from '@/data/herbGrades'
import { asArray, asFiniteNumber, asNonNegInt, asPrice } from '@/utils/saveShape'

/** 募草交货挑品:自**低品**起挑一档「够 target 交得动」的,交掉它(保高阶给方子) */
function pickHerbDeliverGrade(resources: { herbOf(g: HerbGrade): number }, target: number): HerbGrade | null {
  for (const g of HERB_GRADES) {
    if (resources.herbOf(g) >= target) return g
  }
  return null
}

export type BountyClaimResult = 'ok' | 'claimed' | 'insufficient' | 'nobag' | 'missing'

function isKind(v: unknown): v is BountyKind {
  return v === 'herb' || v === 'ore' || v === 'pill' || v === 'equip'
}

/** 交一柄兵刃入账:现算灵石器尘(按所交之品的品质);贡器四路共用,价随实交 */
function deliverEquip(eq: { uid: string; tier: number; quality: QualityId }): void {
  const r = equipBountyReward(eq.tier, qualityDef(eq.quality).rank)
  useInventoryStore().removeEquipment(eq.uid)
  const resources = useResourcesStore()
  resources.addStone(r.stone)
  if (r.dust > 0) resources.addSmall('dust', r.dust)
}

export const useBountyStore = defineStore(
  'bounty',
  () => {
    const orders = ref<BountySlot[]>([])
    const bountyAt = ref(0)
    /**
     * 募草交货的计价大境界 —— 上货时刻冻结(与募矿/募丹的 slot.reward 同纪律):
     * 版的工价在生成那一刻定死,窗口内境界再涨也不该把契约价跟着抬
     * (旧档无此字段,null 视为回退到当前境界,见 claim 的 herb 分支)
     */
    const bountyMajor = ref<number | null>(null)
    /** 存档修复:订单逐纸修形,烂纸丢弃;时刻夹回非负(归零会即时换新) */
    function sanitize(): void {
      bountyAt.value = Math.max(0, asFiniteNumber(bountyAt.value, 0))
      const bm = asFiniteNumber(bountyMajor.value, -1)
      bountyMajor.value = bm >= 0 ? Math.min(MAX_MAJOR, Math.floor(bm)) : null
      const clean: BountySlot[] = []
      let stalePill = false
      /**
       * 单号必须唯一:交货按 idx 认单,两张单同号时 `claim(idx)` 只会命中先出现的
       * 那一张,后一张永远交不了(点了没反应),玩家还以为交的是它。
       * 这里直接重排成 0..n-1 —— 与货架不同,订单的赏格都写在单子上(不按 idx 再生),
       * 改号不会让价与货分叉,故理顺号比丢单更合适。
       */
      for (const raw of asArray<unknown>(orders.value)) {
        if (!raw || typeof raw !== 'object' || !('kind' in raw) || !isKind(raw.kind)) continue
        const kindId = 'kindId' in raw && typeof raw.kindId === 'string' ? raw.kindId : ''
        /**
         * 募丹单靠 kindId 认货:认不出的丹 id 既画不出名字、也永远凑不齐
         * (丹匣里不会有它),这张单要挂满整个窗口才换新,玩家只会反复看到
         * 「存货不足」却无货可备。整版重挂,比留一张交不掉的死单诚实。
         */
        if (raw.kind === 'pill' && !pillDef(kindId)) {
          stalePill = true
          continue
        }
        clean.push({
          idx: clean.length,
          kind: raw.kind,
          kindId,
          target: Math.max(1, asNonNegInt('target' in raw ? raw.target : 1, 1)),
          tier: asNonNegInt('tier' in raw ? raw.tier : 0, 0),
          reward: asPrice('reward' in raw ? raw.reward : undefined),
          extra: asNonNegInt('extra' in raw ? raw.extra : 0, 0),
          claimed: 'claimed' in raw && raw.claimed === true
        })
      }
      orders.value = clean
      // 归零上货时刻:下一次 sync 整版换新(含被丢掉的那张),不留下短一格的板子
      if (stalePill) bountyAt.value = 0
    }

    /** 订单空、或已过刷新窗口则换新一版(此刻的订单不动,交货中的不打断) */
    function sync(now: number): void {
      if (orders.value.length > 0 && now < bountyAt.value + BOUNTY_REFRESH_SECONDS * 1000) return
      const player = usePlayerStore()
      orders.value = generateBounty(player.major, now)
      bountyAt.value = now
      bountyMajor.value = player.major
    }

    /** 交货第 idx 单;验货→扣货→入账;贡器按所交之品的品质现算价 */
    function claim(idx: number): BountyClaimResult {
      const now = Date.now()
      sync(now)
      const slot = orders.value.find(s => s.idx === idx)
      if (!slot) return 'missing'
      if (slot.claimed) return 'claimed'
      const resources = useResourcesStore()
      const inventory = useInventoryStore()

      if (slot.kind === 'herb' || slot.kind === 'ore') {
        if (slot.kind === 'ore') {
          if (!resources.hasSmall('ore', slot.target)) return 'insufficient'
          resources.spendSmall('ore', slot.target)
          resources.addStone(slot.reward)
        } else {
          // 任意品阶可交:自低品起挑一档够 target 的交;价按所交之品的购价,但大境界
          // 取「上货时刻冻结」的那份(bountyMajor,旧档为 null 则回退当前)—— 与募矿/募丹一致
          const grade = pickHerbDeliverGrade(resources, slot.target)
          if (!grade) return 'insufficient'
          resources.spendHerb(grade, slot.target)
          const priceMajor = bountyMajor.value ?? usePlayerStore().major
          resources.addStone(herbBountyReward(grade, priceMajor, slot.target))
        }
      } else if (slot.kind === 'pill') {
        if ((inventory.pills[slot.kindId] ?? 0) < slot.target) return 'insufficient'
        inventory.spendPill(slot.kindId, slot.target)
        resources.addStone(slot.reward)
        if (slot.extra > 0) resources.addSmall('wudao', slot.extra)
      } else {
        const eq = inventory.bagItems.find(e => e.tier >= slot.tier)
        if (!eq) return 'nobag'
        deliverEquip(eq)
      }
      slot.claimed = true
      return 'ok'
    }

    /** 交货一柄玩家点选的够格兵刃(不再自动取第一件,见 C5) */
    function claimEquip(idx: number, uid: string): BountyClaimResult {
      const now = Date.now()
      sync(now)
      const slot = orders.value.find(s => s.idx === idx)
      if (!slot || slot.kind !== 'equip') return 'missing'
      if (slot.claimed) return 'claimed'
      const eq = useInventoryStore().bagItems.find(e => e.uid === uid)
      if (!eq) return 'missing'
      if (eq.tier < slot.tier) return 'insufficient'
      deliverEquip(eq)
      slot.claimed = true
      return 'ok'
    }

    return { orders, bountyAt, bountyMajor, sanitize, sync, claim, claimEquip }
  },
  { persist: persistConfig('bounty') }
)
