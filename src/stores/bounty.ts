/**
 * 坊市悬赏板状态 —— 当前一版订单与刷新时刻(持久化,须带 sanitize;见 storeResilience.spec)
 * 订单按墙钟到期换新,每张只交一次。价由 bountyService 现算,这里只入账。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { QualityId } from '@/types'
import { persistConfig } from '@/utils/storage'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { qualityDef } from '@/data/qualities'
import { BOUNTY_PILL_WUDAO, BOUNTY_REFRESH_SECONDS, type BountyKind, type BountySlot } from '@/data/bounty'
import { MAX_MAJOR } from '@/data/realms'
import { pillDef } from '@/data/pills'
import { MAX_EQUIP_TIER } from '@/data/equipment'
import { equipBountyReward, generateBounty, herbBountyReward } from '@/core/bountyService'
import { HERB_GRADES, type HerbGrade } from '@/data/herbGrades'
import { asArray, asFiniteNumber, asNonNegInt, asPrice, asTimestamp } from '@/utils/saveShape'

/** 募草交货挑品:自低品起取第一档够 target 的(高阶留给方子) */
function pickHerbDeliverGrade(resources: { herbOf(g: HerbGrade): number }, target: number): HerbGrade | null {
  for (const g of HERB_GRADES) {
    if (resources.herbOf(g) >= target) return g
  }
  return null
}

/** expired:点下时恰跨过换版窗口、整版已换新;不成交(按 idx 会交给玩家没看过的新单) */
export type BountyClaimResult = 'ok' | 'claimed' | 'insufficient' | 'nobag' | 'missing' | 'expired'

function isKind(v: unknown): v is BountyKind {
  return v === 'herb' || v === 'ore' || v === 'pill' || v === 'equip'
}

/** 交一柄兵刃入账:按所交之品现算灵石与器尘 */
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
    /** 募草计价大境界:上货时冻结(同募矿 / 募丹的 slot.reward);旧档为 null,回退当前境界 */
    const bountyMajor = ref<number | null>(null)
    /** 存档修复:订单逐纸修形,烂纸丢弃;时刻夹回非负(归零会即时换新) */
    function sanitize(): void {
      bountyAt.value = Math.max(0, asTimestamp(bountyAt.value, 0))
      const bm = asFiniteNumber(bountyMajor.value, -1)
      bountyMajor.value = bm >= 0 ? Math.min(MAX_MAJOR, Math.floor(bm)) : null
      const clean: BountySlot[] = []
      let stalePill = false
      // 单号重排成 0..n-1(交货按 idx 认单,须唯一);赏格写在单上、不按 idx 再生,改号不会让价与货分叉
      for (const raw of asArray<unknown>(orders.value)) {
        if (!raw || typeof raw !== 'object' || !('kind' in raw) || !isKind(raw.kind)) continue
        const kindId = 'kindId' in raw && typeof raw.kindId === 'string' ? raw.kindId : ''
        // 认不出丹 id 的募丹单永远交不掉:整版重挂
        if (raw.kind === 'pill' && !pillDef(kindId)) {
          stalePill = true
          continue
        }
        const reward = asPrice('reward' in raw ? raw.reward : undefined)
        // 募矿 / 募丹赏格是上货时的实价,零价即坏档;募草 / 贡器现算,零价是占位符
        if ((raw.kind === 'ore' || raw.kind === 'pill') && reward.m <= 0) {
          stalePill = true
          continue
        }
        const tier =
          raw.kind === 'equip'
            ? Math.min(MAX_EQUIP_TIER, Math.max(1, asNonNegInt('tier' in raw ? raw.tier : 1, 1)))
            : 0
        clean.push({
          idx: clean.length,
          kind: raw.kind,
          kindId,
          target: Math.max(1, asNonNegInt('target' in raw ? raw.target : 1, 1)),
          tier,
          reward,
          extra:
            raw.kind === 'pill'
              ? Math.min(BOUNTY_PILL_WUDAO, asNonNegInt('extra' in raw ? raw.extra : 0, 0))
              : 0,
          claimed: 'claimed' in raw && raw.claimed === true
        })
      }
      orders.value = clean
      // 归零上货时刻:下次 sync 整版换新
      if (stalePill) bountyAt.value = 0
    }

    /** 订单空或已过刷新窗口则换新一版 */
    function sync(now: number): void {
      if (orders.value.length > 0 && now < bountyAt.value + BOUNTY_REFRESH_SECONDS * 1000) return
      const player = usePlayerStore()
      orders.value = generateBounty(player.major, now)
      bountyAt.value = now
      bountyMajor.value = player.major
    }

    /** 交货第 idx 单 */
    function claim(idx: number): BountyClaimResult {
      const now = Date.now()
      const before = orders.value
      sync(now)
      if (before.length > 0 && orders.value !== before) return 'expired'
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

    /** 交玩家点选的那柄够格兵刃 */
    function claimEquip(idx: number, uid: string): BountyClaimResult {
      const now = Date.now()
      const before = orders.value
      sync(now)
      if (before.length > 0 && orders.value !== before) return 'expired'
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
