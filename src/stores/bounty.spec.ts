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
import { usePlayerStore } from '@/stores/player'
import { herbBountyReward } from '@/core/bountyService'
import { pillDef } from '@/data/pills'
import { BOUNTY_PILL_WUDAO } from '@/data/bounty'
import { MAX_EQUIP_TIER } from '@/data/equipment'

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
    usePlayerStore().major = 10 // 非零境:若 claim 忽略大境界、恒按 0 定价,此断言即红
    res.herbByGrade[1] = 10 // 不足 30
    res.spiritStone = { m: 0, e: 0 }
    expect(b.claim(0)).toBe('insufficient')
    expect(res.herb).toBe(10)
    expect(b.orders[0]!.claimed).toBe(false)

    // 凡品+道品都够:自低品起挑(保高阶给方子),价按凡品算
    res.$patch({ herbByGrade: { 1: 30, 2: 0, 3: 0, 4: 0, 5: 5 } })
    expect(b.claim(0)).toBe('ok')
    expect(res.herb).toBe(5)
    expect(toNum(res.spiritStone)).toBe(toNum(herbBountyReward(1, 10, 30))) // claim 以当前境界 10 折算
    expect(b.orders[0]!.claimed).toBe(true)
    expect(b.claim(0), '已交不可再交').toBe('claimed')
  })

  it('募草只剩道品够:交道品即得高品价', () => {
    const b = useBountyStore()
    const res = useResourcesStore()
    seedSlots([mat('herb')])
    usePlayerStore().major = 10
    res.$patch({ herbByGrade: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 30 } })
    res.spiritStone = { m: 0, e: 0 }
    expect(b.claim(0)).toBe('ok')
    expect(res.herb).toBe(0)
    expect(toNum(res.spiritStone)).toBe(toNum(herbBountyReward(5, 10, 30)))
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

  /**
   * 交货按 idx 认单:两张单同号时 `claim(idx)` 只命中先出现的那张,后一张
   * 永远交不了(点了没反应)。订单赏格都写在单子上(不按 idx 再生),故理顺号
   * 比丢单更合适 —— 但必须**每张单都还能交**。
   */
  it('sanitize:重复单号重排成唯一号,两张单都交得了', () => {
    const b = useBountyStore()
    const res = useResourcesStore()
    b.$patch({
      orders: [
        { kind: 'herb', kindId: 'herb', idx: 0, target: 1, tier: 0, reward: { m: 5, e: 0 }, extra: 0, claimed: false },
        { kind: 'herb', kindId: 'herb', idx: 0, target: 1, tier: 0, reward: { m: 6, e: 0 }, extra: 0, claimed: false }
      ] as unknown as never,
      // 别让 sync 换掉这版单(测的是修形后的交货,不是刷新)
      bountyAt: FAR
    })
    b.sanitize()
    expect(b.orders.map(o => o.idx).sort()).toEqual([0, 1])
    res.herbByGrade[1] = 10
    res.spiritStone = { m: 0, e: 0 }
    expect(b.claim(0)).toBe('ok')
    const afterFirst = toNum(res.spiritStone)
    expect(b.claim(1), '第二张单也该交得了').toBe('ok')
    expect(b.orders.every(o => o.claimed)).toBe(true)
    // 第二张单的赏格必须还是它自己的 6,不是第一张的 5 —— 只断言两个 ok 会放过「赏格被改」
    const secondReward = toNum(res.spiritStone) - afterFirst
    expect(secondReward, '第二张单该按自己的赏格(herbBountyReward)入账').toBeCloseTo(
      toNum(herbBountyReward(1, usePlayerStore().major, 1)),
      5
    )
    expect(b.orders[1]!.reward, '修形不许改单子上的赏格').toEqual({ m: 6, e: 0 })
  })

  /**
   * 募丹单靠 kindId 认货:野丹 id 既画不出名字、也永远凑不齐 —— 它只会
   * 挂满整个窗口反复报「存货不足」。整版重挂才是玩家能走的下一步。
   */
  it('sanitize:认不出的募丹单整版重挂,不吃掉货架上的好单', () => {
    const b = useBountyStore()
    b.$patch({
      orders: [
        { kind: 'herb', kindId: 'herb', idx: 0, target: 30, tier: 0, reward: { m: 5, e: 0 }, extra: 0, claimed: false },
        { kind: 'pill', kindId: 'p_not_real', idx: 1, target: 3, tier: 0, reward: { m: 9, e: 0 }, extra: 2, claimed: false }
      ] as unknown as never,
      bountyAt: FAR
    })
    b.sanitize()
    expect(b.orders.map(o => o.kind), '交不掉的死单不留').toEqual(['herb'])
    expect(b.bountyAt, '归零上货时刻,让下一拍整版换新').toBe(0)

    b.sync(Date.now())
    expect(b.orders, '换新后是完整一版').toHaveLength(4)
    expect(
      b.orders.filter(o => o.kind === 'pill').every(o => !!pillDef(o.kindId)),
      '新挂的募丹单必须认得出是哪味丹'
    ).toBe(true)
  })

  it('sanitize:认得出的募丹单原样保留,不白白换掉玩家的那一版', () => {
    const b = useBountyStore()
    b.$patch({
      orders: [
        { kind: 'pill', kindId: 'p_jvqisan', idx: 0, target: 3, tier: 0, reward: { m: 9, e: 0 }, extra: 2, claimed: false }
      ] as unknown as never,
      bountyAt: FAR
    })
    b.sanitize()
    expect(b.orders[0]!.kindId).toBe('p_jvqisan')
    expect(b.bountyAt, '好单不该被重挂').toBe(FAR)
  })

  /**
   * 募矿/募丹的 reward 是单子上钉死的实价;坏档把它归零后仍能交货,等于白交一批货。
   * 募草/贡器的 reward 本就是占位零,不能按同一条判据误杀。
   */
  it('sanitize:募矿/募丹零赏格视为坏单整版重挂,占位零赏的募草/贡器保留', () => {
    const b = useBountyStore()
    b.$patch({
      orders: [
        { kind: 'herb', kindId: 'herb', idx: 0, target: 30, tier: 0, reward: { m: 0, e: 0 }, extra: 0, claimed: false },
        { kind: 'equip', kindId: '', idx: 1, target: 1, tier: 3, reward: { m: 0, e: 0 }, extra: 0, claimed: false }
      ] as unknown as never,
      bountyAt: FAR
    })
    b.sanitize()
    expect(b.orders.map(o => o.kind), '占位零赏不是坏单').toEqual(['herb', 'equip'])
    expect(b.bountyAt).toBe(FAR)

    b.$patch({
      orders: [
        { kind: 'ore', kindId: 'ore', idx: 0, target: 30, tier: 0, reward: { m: 0, e: 0 }, extra: 0, claimed: false }
      ] as unknown as never,
      bountyAt: FAR
    })
    b.sanitize()
    expect(b.orders, '零赏募矿单没有可交的价').toEqual([])
    expect(b.bountyAt, '归零后下一拍整版换新').toBe(0)

    b.$patch({
      orders: [
        { kind: 'pill', kindId: 'p_jvqisan', idx: 0, target: 3, tier: 0, reward: { m: 0, e: 0 }, extra: 2, claimed: false }
      ] as unknown as never,
      bountyAt: FAR
    })
    b.sanitize()
    expect(b.orders, '零赏募丹单同样不许留').toEqual([])
    expect(b.bountyAt).toBe(0)
  })

  it('sanitize:悟道添头只归募丹并夹回上限,贡器层级夹回合法域', () => {
    const b = useBountyStore()
    b.$patch({
      orders: [
        { kind: 'pill', kindId: 'p_jvqisan', idx: 0, target: 3, tier: 0, reward: { m: 5, e: 0 }, extra: 999, claimed: false },
        { kind: 'ore', kindId: 'ore', idx: 1, target: 30, tier: 0, reward: { m: 5, e: 0 }, extra: 999, claimed: false },
        { kind: 'equip', kindId: '', idx: 2, target: 1, tier: 999, reward: { m: 0, e: 0 }, extra: 999, claimed: false }
      ] as unknown as never,
      bountyAt: FAR
    })
    b.sanitize()
    expect(b.orders.map(o => o.extra), '只有募丹配悟道添头,且不越上限').toEqual([BOUNTY_PILL_WUDAO, 0, 0])
    expect(b.orders[2]!.tier).toBe(MAX_EQUIP_TIER)
  })

  /**
   * 点下去的那一瞬正好跨过换版窗口:屏幕上是旧单,而 `sync` 会整版换新。
   * 若照旧按 idx 交货,扣的是玩家的货、成交的是**他没看过的新单**(新单收的货与
   * 赏格都可能不同)。宁可不成,让玩家按新单再点。
   */
  it('跨过换版窗口时按下交货:不成交,也不扣货', () => {
    const b = useBountyStore()
    const res = useResourcesStore()
    seedSlots([mat('herb')])
    // 上货时刻推到窗口之外(屏幕上画的还是这版旧单)
    b.bountyAt = 0
    res.herbByGrade[1] = 30
    res.spiritStone = { m: 0, e: 0 }
    const oldOrder = b.orders[0]!
    const oldList = b.orders
    expect(b.claim(0)).toBe('expired')
    expect(oldOrder.claimed, '旧单不动').toBe(false)
    expect(res.herb, '货一枚不许扣').toBe(30)
    expect(b.orders, '已整版换新').not.toBe(oldList)
    expect(b.orders.includes(oldOrder), '旧单一纸不留').toBe(false)
    expect(toNum(res.spiritStone), '也不许入账').toBe(0)
  })

  it('贡器点选跨过换版窗口:同样不成交、不扣兵刃', () => {
    const b = useBountyStore()
    const inv = useInventoryStore()
    seedSlots([{ idx: 0, kind: 'equip', kindId: '', target: 1, tier: 3, reward: { m: 0, e: 0 }, extra: 0, claimed: false }])
    inv.$patch({ items: [{ uid: 'give', templateId: 'y', quality: 'fine', tier: 4, level: 0, affixes: [] }] })
    b.bountyAt = 0
    expect(b.claimEquip(0, 'give')).toBe('expired')
    expect(inv.items.map(i => i.uid)).toEqual(['give'])
  })
})

describe('坊市悬赏板 · 募草工价上货时刻冻结', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('版生成境地之后窗口内境界上涨,募草契约价不跟着抬(与募矿/募丹同纪律)', () => {
    const b = useBountyStore()
    const res = useResourcesStore()
    seedSlots([mat('herb')])
    // 版在 major 5 生成(工价冻结于此),玩家此刻已到 major 10
    b.bountyMajor = 5
    usePlayerStore().major = 10
    res.$patch({ herbByGrade: { 1: 30, 2: 0, 3: 0, 4: 0, 5: 0 }, spiritStone: { m: 0, e: 0 } })
    expect(b.claim(0)).toBe('ok')
    // 价按生成的 major 5 折算,不是当前 10 —— 若有人把它改回 live major,此断言即红
    expect(toNum(res.spiritStone)).toBe(toNum(herbBountyReward(1, 5, 30)))
  })
})
