/** 天道熔炉跨品扣款(spendHerbMeltable)原子性:不足则不吐、失败不得白扣,与其余 spend 同契约 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useResourcesStore } from './resources'
import { gn } from '@/utils/gnum'

describe('天道熔炉 · spendHerbMeltable 原子扣款', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('可熔总数不足:返回 false 且一枚不动(失败不白扣)', () => {
    const res = useResourcesStore()
    res.$patch({ herbByGrade: { 1: 0, 2: 0, 3: 5, 4: 0, 5: 0 } })
    expect(res.spendHerbMeltable(10)).toBe(false)
    expect(res.herbMeltable, '失败后可熔草一枚都不能少').toBe(5)
    expect(res.spendHerbMeltable(6)).toBe(false)
    expect(res.herbByGrade[3], '失败后仙品草原样保留').toBe(5)
  })

  it('可熔总数恰够:跨品实扣、自低品起扣、余数保留,返回 true', () => {
    const res = useResourcesStore()
    res.$patch({ herbByGrade: { 1: 9, 2: 9, 3: 5, 4: 3, 5: 0 } }) // 凡/灵不入炉,一律不动
    expect(res.spendHerbMeltable(7)).toBe(true)
    expect(res.herbByGrade).toEqual({ 1: 9, 2: 9, 3: 0, 4: 1, 5: 0 }) // 3→5 尽扣、再从 4 扣 2,余 1
    expect(res.herbMeltable).toBe(1)
    expect(res.spendHerbMeltable(1)).toBe(true)
    expect(res.herbMeltable).toBe(0)
  })

  it('整品恰好扣完:扣成 0 仍算成功', () => {
    const res = useResourcesStore()
    res.$patch({ herbByGrade: { 1: 0, 2: 0, 3: 5, 4: 0, 5: 0 } })
    expect(res.spendHerbMeltable(5)).toBe(true)
    expect(res.herbMeltable).toBe(0)
    expect(res.spendHerbMeltable(1)).toBe(false) // 已空,连 1 也不动
  })
})

describe('资源公共写入边界 · 非有限值与反向扣款', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('灵草入账只认有限正数:NaN / Infinity / 负数 / 0 全都不动账', () => {
    const res = useResourcesStore()
    for (const bad of [NaN, Infinity, -Infinity, -5, 0]) res.addHerb(1, bad)
    expect(res.herbByGrade[1], '坏增量不能把库存写成 NaN 或负数').toBe(0)
    res.addHerb(1, 2.9)
    expect(res.herbByGrade[1], '正常入账仍向下取整').toBe(2)
  })

  it('灵草扣款拒绝负数与非有限值,0 保持成功且不动账', () => {
    const res = useResourcesStore()
    res.addHerb(1, 5)
    expect(res.spendHerb(1, -5), '负扣款不得反向加草').toBe(false)
    expect(res.spendHerb(1, NaN), 'NaN 不得把余额扣成 NaN').toBe(false)
    expect(res.spendHerb(1, Infinity), '无限扣款必须拒绝').toBe(false)
    expect(res.spendHerb(9 as never, 1), '认不出的品阶不得写出 NaN 账').toBe(false)
    expect(res.herbByGrade[1]).toBe(5)
    expect(res.spendHerb(1, 0), '零扣款仍按成功且不动账').toBe(true)
    expect(res.herbByGrade[1]).toBe(5)
  })

  it('单标量材料同样挡住 NaN 入账与负扣款', () => {
    const res = useResourcesStore()
    res.addSmall('ore', NaN)
    res.addSmall('ore', Infinity)
    res.addSmall('ore', -5)
    expect(res.ore).toBe(0)
    res.addSmall('ore', 10)
    expect(res.spendSmall('ore', -5), '负扣款不得反向加矿').toBe(false)
    expect(res.spendSmall('ore', NaN)).toBe(false)
    expect(res.ore).toBe(10)
    expect(res.spendSmall('ore', 0)).toBe(true)
    expect(res.ore).toBe(10)
  })

  /**
   * setQi 原先漏在「资源公共写入边界」这组判据之外 —— 它不走 spendAmount,
   * 也没有自己的守卫,于是 NaN 会**永久写进 qi**:
   * Math.min(NaN, NaN) 仍是 NaN,之后每次 add 都从 NaN 出发,灵气再也不会回正。
   * 三个调用点(engine 心跳、offline 结算、breakthrough 扣费)传的都是算出来的数,
   * 而 cap 来自 player.qiCapValue —— 这里是最后一道闸。
   */
  it('灵气写入挡住非有限值:坏 v 与坏 cap 都不动账', () => {
    const res = useResourcesStore()
    res.setQi(100, 1000)
    expect(res.qi).toBe(100)
    res.setQi(Number.NaN, 1000)
    expect(res.qi, 'NaN v 不得把灵气写成 NaN').toBe(100)
    res.setQi(500, Number.NaN)
    expect(res.qi, 'NaN cap 不得把灵气写成 NaN').toBe(100)
    res.setQi(Number.POSITIVE_INFINITY, 1000)
    expect(res.qi, '无限 v 不得写进灵气').toBe(100)
    // 正常路径不变:落在 [0, cap × QI_BANK_MULT] 内
    res.setQi(200, 1000)
    expect(res.qi).toBe(200)
    res.setQi(-50, 1000)
    expect(res.qi, '负数钳到 0').toBe(0)
  })

  it('灵石入账与扣款挡住负大数与坏大数', () => {
    const res = useResourcesStore()
    res.addStone(gn(10))
    res.addStone({ m: -1, e: 0 })
    expect(res.spiritStone, '负大数不得反向扣石').toEqual(gn(10))
    expect(res.spendStone({ m: -1, e: 0 }), '负扣款不得反向加石').toBe(false)
    expect(res.spendStone({ m: NaN, e: 0 })).toBe(false)
    expect(res.spiritStone).toEqual(gn(10))
  })

  it('读档修形把负尾数灵石与无限指数归零,修后既不能白拿也不能继续透支', () => {
    const res = useResourcesStore()
    res.$patch({ spiritStone: { m: -1, e: 4 } })
    res.sanitize()
    expect(res.spiritStone, '负尾数灵石必须归零,不能留成负数余额').toEqual(gn(0))

    res.$patch({ spiritStone: { m: 1, e: Number.POSITIVE_INFINITY } })
    res.sanitize()
    expect(res.spiritStone, '无限指数不得成为无限财富').toEqual(gn(0))
    expect(res.spendStone(gn(1)), '修形后的空账不能凭空支付').toBe(false)
  })

  /**
   * 有限但离谱的指数。
   *
   * 上面那条只挡住了 Infinity,而 `{ m: 1, e: 1000000000 }` 是指数**有限**的坏档:
   * 旧写法 `gn(spiritStone.value)` 只规范化尾数、不限指数,于是原样收下,
   * 界面随即印出「1.00e1000000000」——正是 saveShape 头注释点名的那个场景。
   * 改走 asBoundedGNum 后,越界一律归零。
   */
  it('读档修形把指数有限但越界的灵石归零', () => {
    const res = useResourcesStore()
    res.$patch({ spiritStone: { m: 1, e: 1_000_000_000 } })
    res.sanitize()
    expect(res.spiritStone, '越界指数必须归零,不能原样收下').toEqual(gn(0))

    // 界内的照常保留,别把正常档一起清掉
    res.$patch({ spiritStone: { m: 1, e: 999 } })
    res.sanitize()
    expect(res.spiritStone).toEqual({ m: 1, e: 999 })
    res.$patch({ spiritStone: gn(1234) })
    res.sanitize()
    expect(res.spiritStone).toEqual(gn(1234))
  })

  it('熔炉跨品扣款遇到 NaN 不进入逐品扣料循环', () => {
    const res = useResourcesStore()
    res.$patch({ herbByGrade: { 1: 0, 2: 0, 3: 5, 4: 0, 5: 0 } })
    expect(res.spendHerbMeltable(NaN)).toBe(false)
    expect(res.herbByGrade[3], 'NaN 不得把可熔草写成 NaN').toBe(5)
  })
})
