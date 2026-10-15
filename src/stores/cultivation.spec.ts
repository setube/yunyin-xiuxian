/**
 * 状态(buff)时长叠加 —— 同一状态重复施加时,新时长加到已有剩余时长上。
 *
 * 旧实现 `Math.max(旧 endsAt, now + dur)` 实为「刷新」:聚灵还剩 20 分钟时再服一颗同类丹,
 * 那 20 分钟直接作废,玩家连服丹药等于白丢药力。本文件锁住叠加语义与三条边界:
 *  1. 尚在生效 → 剩余时长相加(**丹药增益封顶在单颗两倍**,见 core/buffCap;非丹药状态不限);
 *  2. 已过期实例 → 以 now 为基准,不把历史负剩余叠进来;
 *  3. 不同状态各自计时、未注册 id 静默忽略(不因叠加改动变成脏数据源)。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCultivationStore } from './cultivation'
import { useDongfuStore } from './dongfu'
import { usePlayerStore } from './player'
import { modOf } from '@/core/statsCalc'
import { buffDef } from '@/data/buffs'
import { gongfaDef, gongfaMaxLevel } from '@/data/gongfa'

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

  it('连服 N 次 → 攒不过上限:丹药增益封顶在单颗两倍,到顶即停', () => {
    const cultivation = useCultivationStore()
    const t0 = 5_000_000
    for (let i = 0; i < 5; i++) cultivation.addBuff('buff_juling', t0)

    expect(cultivation.buffs).toHaveLength(1)
    const remainSec = (cultivation.buffs[0]!.endsAt - t0) / SEC
    // 封顶(见 core/buffCap):最长 = 单颗时长 × 2,连服再多也攒不上去了
    expect(remainSec).toBe(juling!.durationSec * 2)
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

/**
 * 修炼速度 buff 叠加与单方到期撤除。
 *
 * buff_juling(聚灵, +50% 修速,丹药有 2× 上限)与 retreat(闭关, +150% 修速,无上限)
 * 是**两种不同状态但共用一个 cultivationSpeed 键**。时长叠加(cultivation/addBuff 与
 * buffCap)管的是同一状态多久,这里管的是**不同状态按合并求和**(不是覆盖):
 * 0.5 + 1.5 = 2.0(cultivationSpeed 不在递减/软阈值集里,天然线性),且一方到期
 * 只撤它自己的那一份、不殃及另一份。
 */
describe('修炼速度 buff 叠加与单方到期撤除(buffMods)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('聚灵 + 闭关同时:修速按合并求和 = 2.0(不是后者覆盖前者)', () => {
    const cul = useCultivationStore()
    const t0 = 1_000_000
    cul.addBuff('buff_juling', t0) // cultivationSpeed +0.5
    cul.addBuff('retreat', t0) // cultivationSpeed +1.5
    expect(cul.buffs).toHaveLength(2)
    expect(cul.buffMods.cultivationSpeed).toBe(2.0)
  })

  it('闭关先到期(pruneBuffs):只撤闭关那份,聚灵仍在 → 0.5', () => {
    const cul = useCultivationStore()
    const t0 = 1_000_000
    cul.addBuff('buff_juling', t0) // endsAt = t0 + 1800s
    cul.addBuff('retreat', t0) // endsAt = t0 + 300s
    const retreatEnd = t0 + buffDef('retreat')!.durationSec * SEC
    const afterRetreat = retreatEnd + 1
    expect(cul.buffMods.cultivationSpeed).toBe(2.0)
    expect(cul.pruneBuffs(afterRetreat)).toBe(true) // 撤掉了什么
    expect(cul.buffs.map(b => b.defId)).toEqual(['buff_juling'])
    expect(cul.buffMods.cultivationSpeed).toBe(0.5) // 聚灵那份还留着
  })

  it('各方全到期后:该键归零(键消失)', () => {
    const cul = useCultivationStore()
    const t0 = 2_000_000
    cul.addBuff('buff_juling', t0) // endsAt = t0 + 1800s
    cul.addBuff('retreat', t0) // endsAt = t0 + 300s
    const julingEnd = t0 + buffDef('buff_juling')!.durationSec * SEC
    cul.pruneBuffs(julingEnd + 1)
    expect(cul.buffs).toHaveLength(0)
    expect(cul.buffMods.cultivationSpeed).toBeUndefined()
  })
})

describe('sanitize:功法等级与悟道分支加固', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('超限功法等级钳到满级;不属于该功法/不存在的悟道分支被清', () => {
    const c = useCultivationStore()
    c.$patch({
      learned: { m_taixuan: 99 },
      gongfaBranch: { m_taixuan: 'b_not_real', x_other: 'b_some' }
    } as never)
    c.sanitize()
    // level 99 钳到 m_taixuan 满级(9),否则 perLevel 无限放大修速且无降级路径
    expect(c.learned['m_taixuan']).toBe(gongfaMaxLevel(gongfaDef('m_taixuan')!))
    // 分支 id 认不出 / 不是该功法已满级的条目 —— 一律清空(白送词条的注入洞)
    expect(Object.keys(c.gongfaBranch)).toHaveLength(0)
  })

  it('转世落回 1 层,分支仍按契约保留(不因「未满级」被读档/离线抹掉)', () => {
    const c = useCultivationStore()
    c.$patch({
      // 转世把功法落回 1 层(reincarnation.carryGongfa 只留一部满级),但分支是「转世不失」的永久被动
      learned: { m_taixuan: 1 },
      gongfaBranch: { m_taixuan: 'b_taixuan_sha' }
    } as never)
    c.sanitize()
    // 归属正确的分支在已习得功法上保留 —— 满级才选分支是「可悟道」闸,不是读档判据
    expect(c.gongfaBranch['m_taixuan']).toBe('b_taixuan_sha')
  })

  it('仍拦注入:未习得功法上的分支被清(不白送词条)', () => {
    const c = useCultivationStore()
    c.$patch({
      learned: {}, // m_taixuan 根本没学到
      gongfaBranch: { m_taixuan: 'b_taixuan_sha' }
    } as never)
    c.sanitize()
    expect(Object.keys(c.gongfaBranch), '未习得功法的分支仍应被清').toHaveLength(0)
  })
})

describe('辅修槽位约束:超出预算的伴生功法不白给(gongfaMods 与装配页同口径)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('藏书楼缩水、槽位变少后,超槽辅修词条不再生效(选中列表保留,槽位恢复自动回来)', () => {
    const player = usePlayerStore()
    const cul = useCultivationStore()
    const dongfu = useDongfuStore()

    // 藏书楼 3 级 → 辅修槽位 2(1 + floor(3/3))
    dongfu.setLevel('library', 3)
    expect(dongfu.subGongfaSlots).toBe(2)

    // 学两门词条不同的辅修,按加装顺序占满 2 槽
    cul.learn('s_tuna') // cultivationSpeed
    cul.learn('s_lianti') // maxHpPct
    expect(cul.toggleSub('s_tuna', 2)).toBe(true)
    const hpBeforeLianti = modOf(player.finalStats.mods, 'maxHpPct') // s_lianti 加入前的基准
    expect(cul.toggleSub('s_lianti', 2)).toBe(true)
    expect(cul.subGongfa).toEqual(['s_tuna', 's_lianti'])

    const speedFull = modOf(player.finalStats.mods, 'cultivationSpeed')
    const hpFull = modOf(player.finalStats.mods, 'maxHpPct')
    expect(speedFull, '满槽时两门都该生效').toBeGreaterThan(0)
    expect(hpFull, '满槽时两门都该生效').toBeGreaterThan(hpBeforeLianti)

    // 藏书楼跌回 0 级(转世后 levels 重算)→ 槽位 1,玩家选中的数组原样保留
    dongfu.setLevel('library', 0)
    expect(dongfu.subGongfaSlots).toBe(1)
    expect(cul.subGongfa, '槽位缩水不抹掉玩家的选择').toHaveLength(2)

    // 只有先装的 s_tuna 生效;s_lianti 的 maxHpPct 掉回基准 —— 不再免费白给
    expect(modOf(player.finalStats.mods, 'cultivationSpeed'), '槽内首门仍生效').toBeGreaterThan(0)
    expect(modOf(player.finalStats.mods, 'maxHpPct'), '超槽辅修不得再白给词条').toBeCloseTo(hpBeforeLianti, 6)
  })
})
