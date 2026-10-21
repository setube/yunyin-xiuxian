import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { BountySlot } from '@/data/bounty'
import { gn } from '@/utils/gnum'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { renderBounty } from './useBountyRows'

function slot(overrides: Partial<BountySlot>): BountySlot {
  return {
    idx: 0,
    kind: 'herb',
    kindId: 'herb',
    target: 30,
    tier: 0,
    reward: gn(1),
    extra: 0,
    claimed: false,
    ...overrides
  }
}

describe('悬赏板 · 不足时写出实际差量', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('募草按最高可用一档报尚差株数,交得齐时不报缺口', () => {
    const res = useResourcesStore()
    res.herbByGrade[1] = 20
    res.herbByGrade[2] = 7
    const row = renderBounty(slot({}))
    expect(row.ready).toBe(false)
    expect(row.shortText).toBe('尚差 10 株')

    res.herbByGrade[2] = 30
    expect(renderBounty(slot({})).shortText).toBeNull()
  })

  it('募矿与募丹分别报块数与枚数', () => {
    const res = useResourcesStore()
    res.ore = 7
    expect(renderBounty(slot({ kind: 'ore', kindId: 'ore' })).shortText).toBe('尚差 23 块玄铁')

    useInventoryStore().pills = { 'qi_pill': 1 }
    expect(
      renderBounty(slot({ kind: 'pill', kindId: 'qi_pill', target: 3 })).shortText
    ).toBe('尚差 2 枚')
  })

  it('贡器没有够格兵刃时点名门槛,不写笼统暂不足', () => {
    const row = renderBounty(slot({ kind: 'equip', kindId: '', target: 1, tier: 5 }))
    expect(row.ready).toBe(false)
    expect(row.shortText).toBe('无 5 阶以上兵刃')
  })
})
