/**
 * 坊市悬赏板 store —— 交货四路与坏档韧性
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { BountySlot } from '@/data/bounty'
import { toNum } from '@/utils/gnum'
import { useBountyStore } from '@/stores/bounty'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { herbBountyReward } from '@/core/bountyService'

const FAR = 4_102_444_800_000 // 2099-12-31

function seedSlots(slots: BountySlot[]): void {
  useBountyStore().$patch({ orders: slots, bountyAt: FAR })
}

function mat(kind: 'herb' | 'ore', idx = 0): BountySlot {
  return { idx, kind, kindId: kind, target: 30, tier: 0, reward: { m: 5, e: 1 }, extra: 0, claimed: false }
}

describe('坊市悬赏板 · 交货', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('募草:扣足量、按所交品计价、盖已交;不足则不成(任意品可交)', () => {
    const b = useBountyStore()
    const res = useResourcesStore()
    seedSlots([mat('herb')])
    res.herbByGrade[1] = 10 // 不足 30
    res.spiritStone = { m: 0, e: 0 }
    expect(b.claim(0)).toBe('insufficient')
    expect(res.herb).toBe(10)
    expect(b.orders[0]!.claimed).toBe(false)

    // 凡品+道品都够:自低品起挑(保高阶给方子),价按凡品算
    res.$patch({ herbByGrade: { 1: 30, 2: 0, 3: 0, 4: 0, 5: 5 } })
    expect(b.claim(0)).toBe('ok')
    expect(res.herb).toBe(5)
    expect(toNum(res.spiritStone)).toBe(toNum(herbBountyReward(1, 30)))
    expect(b.orders[0]!.claimed).toBe(true)
    expect(b.claim(0), '已交不可再交').toBe('claimed')
  })

  it('募草只剩道品够:交道品即得高品价', () => {
    const b = useBountyStore()
    const res = useResourcesStore()
    seedSlots([mat('herb')])
    res.$patch({ herbByGrade: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 30 } })
    res.spiritStone = { m: 0, e: 0 }
    expect(b.claim(0)).toBe('ok')
    expect(res.herb).toBe(0)
    expect(toNum(res.spiritStone)).toBe(toNum(herbBountyReward(5, 30)))
  })

  it('募丹:扣足枚、入账灵石并附悟道', () => {
    const b = useBountyStore()
    const res = useResourcesStore()
    const inv = useInventoryStore()
    seedSlots([{ idx: 0, kind: 'pill', kindId: 'p_jvqisan', target: 3, tier: 0, reward: { m: 5, e: 0 }, extra: 2, claimed: false }])
    inv.$patch({ pills: { p_jvqisan: 3 } })
    res.wudao = 0
    expect(b.claim(0)).toBe('ok')
    expect(inv.pills['p_jvqisan'] ?? 0).toBe(0)
    expect(toNum(res.spiritStone)).toBe(5)
    expect(res.wudao).toBe(2)
  })

  it('贡器:交一柄够格兵刃、入账灵石器尘;行囊无够格则不成', () => {
    const b = useBountyStore()
    const res = useResourcesStore()
    const inv = useInventoryStore()
    seedSlots([{ idx: 0, kind: 'equip', kindId: '', target: 1, tier: 3, reward: { m: 0, e: 0 }, extra: 0, claimed: false }])
    inv.$patch({ items: [{ uid: 'poor', templateId: 'x', quality: 'fine', tier: 2, level: 0, affixes: [] }] })
    expect(b.claim(0), 'tier 2 < 门槛 3').toBe('nobag')

    inv.$patch({ items: [{ uid: 'ok', templateId: 'x', quality: 'fine', tier: 4, level: 0, affixes: [] }] })
    expect(b.claim(0)).toBe('ok')
    expect(inv.items).toHaveLength(0)
    expect(toNum(res.spiritStone)).toBeGreaterThan(0)
    expect(res.dust).toBeGreaterThan(0)
  })

  it('贡器点选:交玩家指定的那一件,其余不动;低于门槛不可交;已交不可再交', () => {
    const b = useBountyStore()
    const inv = useInventoryStore()
    seedSlots([{ idx: 0, kind: 'equip', kindId: '', target: 1, tier: 3, reward: { m: 0, e: 0 }, extra: 0, claimed: false }])
    inv.$patch({
      items: [
        { uid: 'keep', templateId: 'x', quality: 'heaven', tier: 5, level: 0, affixes: [] },
        { uid: 'give', templateId: 'y', quality: 'fine', tier: 4, level: 0, affixes: [] },
        { uid: 'junk', templateId: 'z', quality: 'mortal', tier: 2, level: 0, affixes: [] }
      ]
    })
    expect(b.claimEquip(0, 'junk'), 'tier 2 < 门槛 3,不可点交').toBe('insufficient')
    expect(inv.items).toHaveLength(3)
    expect(b.claimEquip(0, 'give')).toBe('ok')
    expect(inv.items.map(i => i.uid).sort()).toEqual(['junk', 'keep'])
    expect(b.orders[0]!.claimed).toBe(true)
    expect(b.claimEquip(0, 'keep'), '已交不可再交').toBe('claimed')
  })

  it('sanitize:烂订单逐纸修形、垃圾丢弃、时刻夹回非负', () => {
    const b = useBountyStore()
    b.$patch({
      orders: [
        null,
        0,
        { kind: 'nope', idx: 0 },
        { kind: 'herb', kindId: 'herb', target: 30, tier: 0, reward: { m: 5, e: 1 }, extra: 0, claimed: false },
        { kind: 'pill', kindId: 'p_jvqisan', target: 3, tier: 0, reward: { m: 5, e: 0 }, extra: 2, claimed: 'x' }
      ] as unknown as never,
      bountyAt: -5 as unknown as number
    })
    b.sanitize()
    expect(b.orders).toHaveLength(2)
    expect(b.orders[0]!.kind).toBe('herb')
    expect(b.orders[1]!.kind).toBe('pill')
    expect(b.orders[1]!.claimed, 'claimed 非真即假').toBe(false)
    expect(b.bountyAt).toBe(0)
  })
})
