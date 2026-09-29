/**
 * 状态(buff)时长叠加 —— 同一状态重复施加时,新时长加到已有剩余时长上。
 *
 * 旧实现 `Math.max(旧 endsAt, now + dur)` 实为「刷新」:聚灵还剩 20 分钟时再服一颗同类丹,
 * 那 20 分钟直接作废,玩家连服丹药等于白丢药力。本文件锁住叠加语义与三条边界:
 *  1. 尚在生效 → 剩余时长相加;
 *  2. 已过期实例 → 以 now 为基准,不把历史负剩余叠进来;
 *  3. 不同状态各自计时、未注册 id 静默忽略(不因叠加改动变成脏数据源)。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCultivationStore } from './cultivation'
import { buffDef } from '@/data/buffs'

const SEC = 1000
// 用 `!` 断言会掩盖写错 id(addBuff 对未注册 id 静默 return,测试会以「buffs 为空」失败而非说明原因)
const juling = buffDef('buff_juling')
const ningshen = buffDef('buff_ningshen')

describe('测试前置:本文件引用的 buff id 都真实注册', () => {
  it('buff_juling / buff_ningshen / injury 都有定义', () => {
    expect(juling, 'buff_juling 未注册(写错 id 会让叠加断言以「buffs 为空」这种误导性方式失败)').toBeDefined()
    expect(ningshen).toBeDefined()
    expect(buffDef('injury')).toBeDefined()
  })
})

describe('状态时长叠加(addBuff)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('首次施加:endsAt = now + 定义时长', () => {
    const cultivation = useCultivationStore()
    cultivation.addBuff('buff_juling', 1_000_000)
    expect(cultivation.buffs).toHaveLength(1)
    expect(cultivation.buffs[0]!.endsAt).toBe(1_000_000 + juling!.durationSec * SEC)
  })

  it('尚在生效时重复施加:剩余时长与新时长相加(不是刷新)', () => {
    const cultivation = useCultivationStore()
    const t0 = 1_000_000
    cultivation.addBuff('buff_juling', t0)
    // 过期前 600 秒(10 分钟)再服一颗:旧行为会把它压回 now+1800,白丢这 600 秒
    const t1 = t0 + (juling!.durationSec - 600) * SEC
    cultivation.addBuff('buff_juling', t1)

    expect(cultivation.buffs).toHaveLength(1) // 同一状态仍是一条实例,不重复挂
    const remainSec = (cultivation.buffs[0]!.endsAt - t1) / SEC
    expect(remainSec).toBe(600 + juling!.durationSec)
  })

  it('连服 N 次 → 时长恰好是 N 倍(线性可预期)', () => {
    const cultivation = useCultivationStore()
    const t0 = 5_000_000
    for (let i = 0; i < 3; i++) cultivation.addBuff('buff_juling', t0)

    expect(cultivation.buffs).toHaveLength(1)
    const remainSec = (cultivation.buffs[0]!.endsAt - t0) / SEC
    expect(remainSec).toBe(juling!.durationSec * 3)
  })

  it('同一实例随身携带 added(本命累积毫秒):首施=单份,连服 N 次=N 份', () => {
    const cultivation = useCultivationStore()
    const t0 = 5_000_000
    cultivation.addBuff('buff_juling', t0)
    expect(cultivation.buffs[0]!.added).toBe(juling!.durationSec * 1000)
    // mid-effective 再加,added 在原值上累加,不随 now 归零
    cultivation.addBuff('buff_juling', t0 + 60_000)
    expect(cultivation.buffs[0]!.added).toBe(juling!.durationSec * 1000 * 2)
  })

  it('过期实例再施加:以 now 为基准,不吞历史负剩余', () => {
    const cultivation = useCultivationStore()
    const t0 = 1_000_000
    cultivation.addBuff('buff_juling', t0)
    // 早已过期的实例(离线/坏档可能残留,pruneBuffs 未跑)
    const stale = t0 + (juling!.durationSec + 9999) * SEC
    cultivation.addBuff('buff_juling', stale)

    expect(cultivation.buffs[0]!.endsAt).toBe(stale + juling!.durationSec * SEC)
  })

  it('不同状态各自计时,互不干扰', () => {
    const cultivation = useCultivationStore()
    const t0 = 2_000_000
    cultivation.addBuff('buff_juling', t0)
    cultivation.addBuff('buff_ningshen', t0 + 100 * SEC)
    cultivation.addBuff('buff_juling', t0 + 200 * SEC)

    expect(cultivation.buffs).toHaveLength(2)
    const byId = new Map(cultivation.buffs.map(b => [b.defId, b.endsAt]))
    expect(byId.get('buff_ningshen')).toBe(t0 + 100 * SEC + ningshen!.durationSec * SEC)
    expect(byId.get('buff_juling')).toBe(t0 + juling!.durationSec * SEC + juling!.durationSec * SEC)
  })

  it('未注册的 id 静默忽略(叠加改动不放宽这条防线)', () => {
    const cultivation = useCultivationStore()
    cultivation.addBuff('buff_not_registered', 1_000_000)
    expect(cultivation.buffs).toHaveLength(0)
  })

  it('重伤同样叠加:重复受创不会把已有时长清零', () => {
    const cultivation = useCultivationStore()
    const injury = buffDef('injury')!
    const t0 = 3_000_000
    cultivation.addBuff('injury', t0)
    const t1 = t0 + 10 * SEC
    cultivation.addBuff('injury', t1)

    expect(cultivation.buffs).toHaveLength(1)
    expect((cultivation.buffs[0]!.endsAt - t1) / SEC).toBe(injury.durationSec * 2 - 10)
  })
})
