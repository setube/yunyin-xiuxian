/**
 * 坊市悬赏板状态 —— 当前一版订单与刷新时刻(持久化,须带 sanitize;见 storeResilience.spec)
 *
 * 订单按墙钟走,到期换新;每张交货一次即盖「已交」。交货即验货扣存货/交装,价由
 * bountyService 现算,这里只管入账翻身。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { GNum } from '@/types'
import { gn, gnZero } from '@/utils/gnum'
import { persistConfig } from '@/utils/storage'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { qualityDef } from '@/data/qualities'
import { BOUNTY_REFRESH_SECONDS, type BountyKind, type BountySlot } from '@/data/bounty'
import { equipBountyReward, generateBounty } from '@/core/bountyService'
import { asArray, asFiniteNumber } from '@/utils/saveShape'

export type BountyClaimResult = 'ok' | 'claimed' | 'insufficient' | 'nobag' | 'missing'

function gprice(v: unknown): GNum {
  if (v && typeof v === 'object' && 'm' in v && 'e' in v) {
    const m = v.m as number
    const e = v.e as number
    if (Number.isFinite(m) && Number.isFinite(e)) return gn({ m, e })
  }
  return gnZero()
}

function isKind(v: unknown): v is BountyKind {
  return v === 'herb' || v === 'ore' || v === 'pill' || v === 'equip'
}

function nonNeg(v: unknown, fallback: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.floor(v as number)) : fallback
}

export const useBountyStore = defineStore(
  'bounty',
  () => {
    const orders = ref<BountySlot[]>([])
    const bountyAt = ref(0)

    /** 存档修复:订单逐纸修形,烂纸丢弃;时刻夹回非负(归零会即时换新) */
    function sanitize(): void {
      bountyAt.value = Math.max(0, asFiniteNumber(bountyAt.value, 0))
      const clean: BountySlot[] = []
      for (const raw of asArray<unknown>(orders.value)) {
        if (!raw || typeof raw !== 'object' || !('kind' in raw) || !isKind(raw.kind)) continue
        clean.push({
          idx: nonNeg('idx' in raw ? raw.idx : clean.length, clean.length),
          kind: raw.kind,
          kindId: 'kindId' in raw && typeof raw.kindId === 'string' ? raw.kindId : '',
          target: Math.max(1, nonNeg('target' in raw ? raw.target : 1, 1)),
          tier: nonNeg('tier' in raw ? raw.tier : 0, 0),
          reward: gprice('reward' in raw ? raw.reward : undefined),
          extra: Math.max(0, nonNeg('extra' in raw ? raw.extra : 0, 0)),
          claimed: 'claimed' in raw && raw.claimed === true
        })
      }
      orders.value = clean
    }

    /** 订单空、或已过刷新窗口则换新一版(此刻的订单不动,交货中的不打断) */
    function sync(now: number): void {
      if (orders.value.length > 0 && now < bountyAt.value + BOUNTY_REFRESH_SECONDS * 1000) return
      const player = usePlayerStore()
      orders.value = generateBounty(player.major, now)
      bountyAt.value = now
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
        const matId = slot.kindId === 'ore' ? 'ore' : 'herb'
        if (!resources.hasSmall(matId, slot.target)) return 'insufficient'
        resources.spendSmall(matId, slot.target)
        resources.addStone(slot.reward)
      } else if (slot.kind === 'pill') {
        if ((inventory.pills[slot.kindId] ?? 0) < slot.target) return 'insufficient'
        inventory.spendPill(slot.kindId, slot.target)
        resources.addStone(slot.reward)
        if (slot.extra > 0) resources.addSmall('wudao', slot.extra)
      } else {
        const eq = inventory.bagItems.find(e => e.tier >= slot.tier)
        if (!eq) return 'nobag'
        const r = equipBountyReward(eq.tier, qualityDef(eq.quality).rank)
        inventory.removeEquipment(eq.uid)
        resources.addStone(r.stone)
        if (r.dust > 0) resources.addSmall('dust', r.dust)
      }
      slot.claimed = true
      return 'ok'
    }

    return { orders, bountyAt, sanitize, sync, claim }
  },
  { persist: persistConfig('bounty') }
)
