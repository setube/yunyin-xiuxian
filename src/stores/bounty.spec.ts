/** 坊市悬赏板 store —— 交货四路与坏档韧性 */
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
    usePlayerStore().major = 10 // 非零境:claim 若恒按 0 定价,此断言红
    res.herbByGrade[1] = 10 // 不足 30
    res.spiritStone = { m: 0, e: 0 }
    expect(b.claim(0)).toBe('insufficient')
    expect(res.herb).toBe(10)
    expect(b.orders[0]!.claimed).toBe(false)

    // 凡品 + 道品都够:自低品起挑,按凡品计价
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

  /*
   * 矿石那条分支单独测:它走 hasSmall('ore') 而不是草药的多品挑选。
   * 变异扫描报那处 `if (!resources.hasSmall('ore', slot.target)) return` 改坏不红 ——
   * 因为 spendSmall 不足时**返回 false 但不扣费**,而调用点没接返回值,
   * 故此检查一旦没了,就会「没交矿石也照样发灵石」。
   */
  it('募矿:矿石不足则不成,不扣费也不发奖', () => {
    const b = useBountyStore()
    const res = useResourcesStore()
    seedSlots([mat('ore')])
    res.ore = 29 // target 是 30
    res.spiritStone = { m: 0, e: 0 }
    expect(b.claim(0), '少一块也不成').toBe('insufficient')
    expect(res.ore, '不足时不扣').toBe(29)
    expect(toNum(res.spiritStone), '不足时不发奖').toBe(0)
    expect(b.orders[0]!.claimed).toBe(false)

    res.ore = 30
    expect(b.claim(0)).toBe('ok')
    expect(res.ore).toBe(0)
    expect(toNum(res.spiritStone)).toBeGreaterThan(0)
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

  /*
   * 点选的 uid 不在行囊里 —— 界面上的行可能来自过期快照(另一页把装备卖了/分解了)。
   * 变异扫描报 `if (!eq) return 'missing'` 改坏不红:去掉它 deliverEquip(undefined)
   * 会去读 eq.tier 直接抛 TypeError,而这份 spec 原先只测「在行囊但阶不够」。
   */
  it('贡器点选:uid 不在行囊里则拒绝,不扣不交也不抛', () => {
    const b = useBountyStore()
    const inv = useInventoryStore()
    seedSlots([{ idx: 0, kind: 'equip', kindId: '', target: 1, tier: 3, reward: { m: 0, e: 0 }, extra: 0, claimed: false }])
    inv.$patch({ items: [{ uid: 'only', templateId: 'x', quality: 'fine', tier: 4, level: 0, affixes: [] }] })
    expect(() => b.claimEquip(0, 'ghost'), '过期快照点交不该抛').not.toThrow()
    expect(b.claimEquip(0, 'ghost')).toBe('missing')
    expect(inv.items, '别人的装备不动').toHaveLength(1)
    expect(b.orders[0]!.claimed, '没交成不盖已交').toBe(false)
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

  it('sanitize:重复单号重排成唯一号,两张单都交得了', () => {
    const b = useBountyStore()
    const res = useResourcesStore()
    b.$patch({
      orders: [
        { kind: 'herb', kindId: 'herb', idx: 0, target: 1, tier: 0, reward: { m: 5, e: 0 }, extra: 0, claimed: false },
        { kind: 'herb', kindId: 'herb', idx: 0, target: 1, tier: 0, reward: { m: 6, e: 0 }, extra: 0, claimed: false }
      ] as unknown as never,
      // 不让 sync 换版
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
    const secondReward = toNum(res.spiritStone) - afterFirst
    expect(secondReward, '第二张单该按自己的赏格(herbBountyReward)入账').toBeCloseTo(
      toNum(herbBountyReward(1, usePlayerStore().major, 1)),
      5
    )
    expect(b.orders[1]!.reward, '修形不许改单子上的赏格').toEqual({ m: 6, e: 0 })
  })

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
    /*
     * 断言的是「单据没被整版换掉」,故比内容不比时间戳。
     * `bountyAt` 是刷新起钟,`sanitize` 会把**未来**值夹到此刻(否则 `sync` 的
     * `now < bountyAt + 刷新间隔` 恒真、悬赏永不换版)—— 那是起钟的修形,与单据无关。
     */
    expect(b.orders[0]!.target, '好单不该被重挂').toBe(3)
  })

  it('sanitize:未来的起钟夹到此刻,悬赏不会永不换版', () => {
    /*
     * `sync()` 判 `now < bountyAt + BOUNTY_REFRESH_SECONDS * 1000` ——
     * 起钟落在未来时该条件恒真,**悬赏永不换版**。
     * `asTimestamp` 只挡「超出 Date 可表示范围」,不挡方向,故补 `Math.min`。
     * 与 `market.stockedAt`、`player.suppressedSince` 同一条。
     */
    const b = useBountyStore()
    b.$patch({ orders: [], bountyAt: FAR } as never)
    b.sanitize()
    expect(b.bountyAt, '未来的起钟没被夹住 —— 悬赏永不换版').toBeLessThanOrEqual(Date.now())
  })

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
    // 起钟被夹到此刻(未来值会让 `now < bountyAt + 刷新间隔` 恒真),单据本身没变
    expect(b.bountyAt, '起钟该被夹到此刻').toBeLessThanOrEqual(Date.now())

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

  it('跨过换版窗口时按下交货:不成交,也不扣货', () => {
    const b = useBountyStore()
    const res = useResourcesStore()
    seedSlots([mat('herb')])
    // 上货时刻移出窗口,屏幕上仍是旧单
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
    // 版在 major 5 生成,玩家已到 10
    b.bountyMajor = 5
    usePlayerStore().major = 10
    res.$patch({ herbByGrade: { 1: 30, 2: 0, 3: 0, 4: 0, 5: 0 }, spiritStone: { m: 0, e: 0 } })
    expect(b.claim(0)).toBe('ok')
    // 按生成时的 major 5 折算;改用当前 major 则此断言红
    expect(toNum(res.spiritStone)).toBe(toNum(herbBountyReward(1, 5, 30)))
  })
})
