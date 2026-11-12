import { NAME_MAX_LENGTH } from '@/data/constants'
/**
 * 远征读档恢复守卫:endgame.sanitize() 把 worldRun(在途远征)每一域夹回安全区间。
 * 故障注入:sanitize 任一处 clamp 写坏(unknown worldId 不 void / layer 不夹 / carriedHp 不夹 / rows 不过滤),本文件红。
 * 规则来源:endgame.ts sanitize;saveShape.ts asCarriedHpPct;EXPEDITION_GUARDIAN_LAYER = EXPEDITION_ROUTE_LAYERS = 3。
 */
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEndgameStore, type WorldRunState } from './endgame'
import { EXPEDITION_GUARDIAN_LAYER, EXPEDITION_ROUTE_LAYERS, celestialWorldDef } from '@/data/endgame'
import { ARTIFACT_MAX_SLOTS } from '@/data/artifacts'
import { SOUL_SLOTS, soulGradeDef } from '@/data/souls'
import { rerollVoidWorld, VOID_REROLL_COST } from '@/core/expedition'
import { usePlayerStore } from '@/stores/player'
import type { GeneratedWorld } from '@/core/worldGen'
import { cultivatorProfile } from '@/core/identity'
import { legacyComparisons } from '@/core/compare'
import { snapFromReplay } from '@/core/endgameService'
import { gn } from '@/utils/gnum'

// h.genResult 控制 generateApprovedWorld 成败,用于断言重掷代价的扣/退
const h = vi.hoisted(() => ({ genResult: 'world' as 'world' | 'null' }))
vi.mock('@/core/worldGen', async importOriginal => {
  const mod = await importOriginal<typeof import('@/core/worldGen')>()
  // vi.mock 工厂被提升到静态 import 之前(TDZ),只能 await import
  const { celestialWorldDef } = await import('@/data/endgame')
  const stub = (): GeneratedWorld | null =>
    h.genResult === 'world'
      ? ({ world: celestialWorldDef('chiyan')!, audit: {} as never, novelty: 0.5, rejected: 3 } as unknown as GeneratedWorld)
      : null
  return {
    ...mod,
    generateApprovedWorld: stub,
    // rerollVoidWorld 走的是分块异步版,一并桩掉
    generateApprovedWorldAsync: async () => stub()
  }
})

function hostileRun(overrides: Partial<WorldRunState> = {}): WorldRunState {
  return {
    worldId: 'chiyan',
    pactId: null,
    layer: 1,
    bonus: 0,
    rows: [],
    carriedHpPct: 1,
    totalRounds: 0,
    winStacks: 0,
    ...overrides
  }
}

describe('远征读档恢复 · worldRun sanitize', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('认不得的世界直接作废:worldId 非任意天界、非 void → worldRun 清空', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ worldRun: hostileRun({ worldId: 'bogus_world' }) })
    endgame.sanitize()
    expect(endgame.worldRun).toBeNull()
  })

  it('虚界(void)远征在途保护:worldId=void 且虚界有效时不被作废', () => {
    const endgame = useEndgameStore()
    endgame.$patch({
      worldRun: hostileRun({ worldId: 'void' }),
      voidWorld: { ...celestialWorldDef('chiyan')!, id: 'void', name: '虚界·在途' }
    })
    endgame.sanitize()
    expect(endgame.worldRun?.worldId).toBe('void')
    expect(endgame.voidWorld?.id).toBe('void')
  })

  it('虚界远征缺少有效虚界时清空:不留下看不见也退不出的幽灵远征', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ worldRun: hostileRun({ worldId: 'void' }), voidWorld: null })
    endgame.sanitize()
    expect(endgame.worldRun, '没有世界就没有这一程').toBeNull()

    endgame.$patch({
      worldRun: hostileRun({ worldId: 'void' }),
      voidWorld: { ...celestialWorldDef('chiyan')!, id: 'void', routes: [] }
    })
    endgame.sanitize()
    expect(endgame.worldRun, '虚界形状坏掉时同样清空在途').toBeNull()
  })

  it('layer 越界/非数被夹回 [0, GUARDIAN_LAYER],NaN 兜底 0', () => {
    const endgame = useEndgameStore()
    const cases: [unknown, number][] = [
      [EXPEDITION_GUARDIAN_LAYER + 50, EXPEDITION_GUARDIAN_LAYER],
      [-5, 0],
      [2.9, 2],
      [NaN, 0],
      ['7' as unknown as number, 0]
    ]
    for (const [raw, expected] of cases) {
      endgame.$patch({ worldRun: hostileRun({ layer: raw as number }) })
      endgame.sanitize()
      expect(endgame.worldRun?.layer, `layer=${String(raw)}`).toBe(expected)
    }
  })

  it('carriedHpPct 夹到 [0.05, 1],非数兜底 1(不能开局就 NaN/无敌)', () => {
    const endgame = useEndgameStore()
    const cases: [unknown, number][] = [
      [2, 1],
      [0, 0.05],
      [0.4, 0.4],
      [NaN, 1],
      ['x' as unknown as number, 1]
    ]
    for (const [raw, expected] of cases) {
      endgame.$patch({ worldRun: hostileRun({ carriedHpPct: raw as number }) })
      endgame.sanitize()
      expect(endgame.worldRun?.carriedHpPct, `carriedHpPct=${String(raw)}`).toBe(expected)
    }
  })

  it('pactId/gateId 按 id 认:非串与认不出的 id 一律置 null', () => {
    const endgame = useEndgameStore()
    endgame.$patch({
      worldRun: hostileRun({ pactId: 123 as unknown as null, gateId: 5 as unknown as null })
    })
    endgame.sanitize()
    expect(endgame.worldRun?.pactId).toBeNull()
    expect(endgame.worldRun?.gateId).toBeNull()

    endgame.$patch({ worldRun: hostileRun({ pactId: 'ghost_pact', gateId: 'ghost_gate' }) })
    endgame.sanitize()
    expect(endgame.worldRun?.pactId, '认不出的契约等同未立约').toBeNull()
    expect(endgame.worldRun?.gateId, '认不出的门等同未择门').toBeNull()

    endgame.$patch({ worldRun: hostileRun({ pactId: 'xue', gateId: 'xiu' }) })
    endgame.sanitize()
    expect(endgame.worldRun?.pactId, '真契约原样保留').toBe('xue')
    expect(endgame.worldRun?.gateId, '真门原样保留').toBe('xiu')
  })

  it('sealedMods 只留目录里的有限数词条,坏整份当作没有封印', () => {
    const endgame = useEndgameStore()
    endgame.$patch({
      worldRun: hostileRun({
        sealedMods: { attackPct: -0.2, defensePct: Number.NaN, ghostStat: 9, critRate: Number.POSITIVE_INFINITY } as never
      })
    })
    endgame.sanitize()
    expect(endgame.worldRun?.sealedMods, '野键与坏值都不该进当年那一局').toEqual({ attackPct: -0.2 })

    endgame.$patch({ worldRun: hostileRun({ sealedMods: { attackPct: Number.NaN } as never }) })
    endgame.sanitize()
    expect(endgame.worldRun?.sealedMods, '一条可用的都没有,等同未封印').toBeUndefined()

    endgame.$patch({ worldRun: hostileRun({ sealedMods: 'x' as never }) })
    endgame.sanitize()
    expect(endgame.worldRun?.sealedMods, '整块形状不对同样当作没有').toBeUndefined()
  })

  it('bonus/totalRounds/winStacks 取非负整数,非数兜底 0', () => {
    const endgame = useEndgameStore()
    endgame.$patch({
      worldRun: hostileRun({
        bonus: 3.9,
        totalRounds: NaN,
        winStacks: -2
      })
    })
    endgame.sanitize()
    expect(endgame.worldRun?.bonus).toBe(3)
    expect(endgame.worldRun?.totalRounds).toBe(0)
    expect(endgame.worldRun?.winStacks).toBe(0)
  })

  it('rows 只留带有效 foeName 的对象,垃圾项被滤掉', () => {
    const endgame = useEndgameStore()
    endgame.$patch({
      worldRun: hostileRun({
        rows: [
          { foeName: '某某妖王', win: true, rounds: 3, hpLeftPct: 0.6 },
          { foo: 1 } as never,
          null as never,
          { foeName: '另有其人', win: false, rounds: 1, hpLeftPct: 0.2 },
          7 as never
        ]
      })
    })
    endgame.sanitize()
    expect(endgame.worldRun?.rows.map(r => r.foeName)).toEqual(['某某妖王', '另有其人'])
  })

  it('totalRounds 与逐行战报不一致时,以逐行回合和为准', () => {
    const endgame = useEndgameStore()
    endgame.$patch({
      worldRun: hostileRun({
        rows: [
          { foeName: '甲', win: true, rounds: 8, hpLeftPct: 0.7 },
          { foeName: '乙', win: true, rounds: 12, hpLeftPct: 0.5 },
          { foeName: '丙', win: true, rounds: 20, hpLeftPct: 0.3 },
          { foeName: '丁', win: true, rounds: 10, hpLeftPct: 0.2 },
          { foeName: '戊', win: true, rounds: 10, hpLeftPct: 0.1 }
        ],
        totalRounds: 0
      })
    })
    endgame.sanitize()
    expect(endgame.worldRun?.totalRounds, '总回合等于逐行回合和').toBe(60)
  })

  it('旧档没有 rows 时仍保留 totalRounds 原值', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ worldRun: hostileRun({ rows: undefined as never, totalRounds: 42 }) })
    endgame.sanitize()
    expect(endgame.worldRun?.rows).toEqual([])
    expect(endgame.worldRun?.totalRounds).toBe(42)
  })
})

describe('混元界重掷代价 · rerollVoidWorld 扣/退与失效分支', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    usePlayerStore().major = 9 // 达到飞升门槛,终局解锁
  })

  it('虚界远征在途时不可重摇:worldId=void 拒绝,道源分文不动', async () => {
    const endgame = useEndgameStore()
    endgame.$patch({ daoPath: 'sword', daoSource: 50 })
    endgame.$patch({ worldRun: { worldId: 'void' } as unknown as WorldRunState })
    expect(await rerollVoidWorld()).toBe(false)
    expect(endgame.daoSource).toBe(50)
    expect(endgame.voidWorld).toBeNull()
  })

  it('道源不足拒绝重摇,不扣账', async () => {
    const endgame = useEndgameStore()
    endgame.$patch({ daoPath: 'sword', daoSource: VOID_REROLL_COST - 1 })
    expect(await rerollVoidWorld()).toBe(false)
    expect(endgame.daoSource).toBe(VOID_REROLL_COST - 1)
  })

  it('重摇成功扣 VOID_REROLL_COST,虚界成形', async () => {
    h.genResult = 'world'
    const endgame = useEndgameStore()
    endgame.$patch({ daoPath: 'sword', daoSource: 50 })
    expect(await rerollVoidWorld()).toBe(true)
    expect(endgame.daoSource).toBe(50 - VOID_REROLL_COST)
    expect(endgame.voidWorld?.id).toBe('chiyan')
  })

  it('裁判否决生成失败:扣了又退,道源无损、虚界不变', async () => {
    h.genResult = 'null'
    const endgame = useEndgameStore()
    endgame.$patch({ daoPath: 'sword', daoSource: 50 })
    expect(await rerollVoidWorld()).toBe(false)
    expect(endgame.daoSource).toBe(50) // 先扣 10 又退 10
    expect(endgame.voidWorld).toBeNull()
  })
})

// 复位 h.genResult,免得串到其他用例
afterEach(() => {
  h.genResult = 'world'
})

describe('道源原始操作 · spend/addDaoSource 原子·单调·取整', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('道源不足时 spend 拒绝且分文不动(原子:false 不带副作用)', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ daoSource: 7 })
    expect(endgame.spendDaoSource(8)).toBe(false)
    expect(endgame.daoSource).toBe(7)
  })

  it('大于等于余额即扣,且余额精确为差', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ daoSource: 7 })
    expect(endgame.spendDaoSource(7)).toBe(true)
    expect(endgame.daoSource).toBe(0)
    endgame.$patch({ daoSource: 20 })
    expect(endgame.spendDaoSource(12)).toBe(true)
    expect(endgame.daoSource).toBe(8)
  })

  it('addDaoSource 非负:余额为 0 时加负数仍 0(无负额腐蚀)', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ daoSource: 0 })
    endgame.addDaoSource(-5)
    expect(endgame.daoSource).toBe(0)
  })

  it('addDaoSource 取整:小数向下取整(非四舍五入)', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ daoSource: 3 })
    endgame.addDaoSource(0.5)
    expect(endgame.daoSource).toBe(3)
    endgame.addDaoSource(1)
    expect(endgame.daoSource).toBe(4)
  })

  it('addDaoSource 单调:小数叠加逐次向下取整,不漏不四舍五入', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ daoSource: 0 })
    endgame.addDaoSource(2.2)
    expect(endgame.daoSource).toBe(2)
    endgame.addDaoSource(0.5)
    expect(endgame.daoSource).toBe(2)
    endgame.addDaoSource(1)
    expect(endgame.daoSource).toBe(3)
  })

  it('addDaoSource 挡住 NaN / Infinity:余额不被写成坏数', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ daoSource: 7 })
    endgame.addDaoSource(NaN)
    endgame.addDaoSource(Infinity)
    expect(endgame.daoSource).toBe(7)
  })

  it('addDaoSource 拒绝负数:余额不会被倒扣', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ daoSource: 7 })
    endgame.addDaoSource(-5)
    expect(endgame.daoSource).toBe(7)
  })

  it('spendDaoSource 拒绝负数与非有限值,0 保持成功且不动账', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ daoSource: 7 })
    expect(endgame.spendDaoSource(-5), '负扣款不得反向加道源').toBe(false)
    expect(endgame.spendDaoSource(NaN)).toBe(false)
    expect(endgame.spendDaoSource(Infinity)).toBe(false)
    expect(endgame.daoSource).toBe(7)
    expect(endgame.spendDaoSource(0)).toBe(true)
    expect(endgame.daoSource).toBe(7)
  })
})

describe('天道试炼 · recordTrial best-min 守谱', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('递减回合:bestRounds 逐次取最小,clears 每次 +1', () => {
    const e = useEndgameStore()
    e.recordTrial('qisha', 10)
    e.recordTrial('qisha', 6)
    e.recordTrial('qisha', 4)
    expect(e.trialRecords['qisha']?.bestRounds).toBe(4)
    expect(e.trialRecords['qisha']?.clears).toBe(3)
  })

  it('更差的(更多回合)不清 best:5 后打 9,仍守 5(纪录不被坏成绩盖掉)', () => {
    const e = useEndgameStore()
    e.recordTrial('yixian', 5)
    e.recordTrial('yixian', 9)
    expect(e.trialRecords['yixian']?.bestRounds).toBe(5)
    expect(e.trialRecords['yixian']?.clears).toBe(2)
  })

  it('不同试炼各自独立记谱(不相串)', () => {
    const e = useEndgameStore()
    e.recordTrial('qisha', 3)
    e.recordTrial('wuhui', 7)
    expect(e.trialRecords['qisha']?.bestRounds).toBe(3)
    expect(e.trialRecords['wuhui']?.bestRounds).toBe(7)
  })
})

describe('终局公共写入 · 只认目录 id 与合法值', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('器魂只收认得类型、唯一 uid 与有限品阶；坏值不污染魂仓', () => {
    const e = useEndgameStore()
    e.addSoul({ uid: 's1', type: 'fengmang', grade: 1, fromName: '剑' })
    e.addSoul({ uid: 's1', type: 'gangdun', grade: 2, fromName: '同号' })
    e.addSoul({ uid: 's2', type: 'ghost_type' as never, grade: 1, fromName: '野类型' })
    e.addSoul({ uid: 's3', type: 'fengmang', grade: Number.NaN, fromName: '坏品阶' })
    e.addSoul({ uid: 's4', type: 'gangdun', grade: 99, fromName: '越界品阶' })
    expect(e.souls.map(s => [s.uid, s.type, s.grade])).toEqual([
      ['s1', 'fengmang', 1],
      ['s4', 'gangdun', 5]
    ])
  })

  it('破界与试炼只认目录 id，回合按有限正整数收口', () => {
    const e = useEndgameStore()
    e.recordWorldClear('ghost_world')
    e.recordWorldClear('chiyan')
    e.recordTrial('ghost_trial', 5)
    e.recordTrial('qisha', Number.NaN)
    e.recordTrial('qisha', -1)
    e.recordTrial('qisha', 6.8)
    expect(e.worldClears).toEqual({ chiyan: 1 })
    expect(e.trialRecords).toEqual({ qisha: { clears: 1, bestRounds: 6 } })
  })

  it('道痕写入复用读档修形：残骸不收，坏字段按语义兜底', () => {
    const e = useEndgameStore()
    e.addMark({ targetName: '无主残骸' } as never)
    e.addMark({
      life: Number.NaN,
      targetId: 'chiyan',
      targetName: 42,
      cleared: 'yes',
      rounds: Number.NaN,
      buildName: 7,
      powerText: null,
      at: Number.NaN
    } as never)
    expect(e.marks).toHaveLength(1)
    expect(e.marks[0]).toEqual(
      expect.objectContaining({
        life: 1,
        targetId: 'chiyan',
        targetName: 'chiyan',
        cleared: false,
        rounds: 0,
        buildName: '杂学',
        powerText: '',
        at: 0
      })
    )
  })

  it('节点、纪录与道途只认目录 id 和有限值', () => {
    const e = useEndgameStore()
    expect(e.addMilestone('ghost_milestone', 1)).toBe(false)
    expect(e.addMilestone('first_world', Number.NaN)).toBe(false)
    expect(e.addMilestone('first_world', 3)).toBe(true)
    expect(e.updateRecord('ghost_record', 10, 1, '野键', 'max')).toBe(false)
    expect(e.updateRecord('fastest_world', Number.NaN, 1, '赤炎天', 'min')).toBe(false)
    expect(e.updateRecord('fastest_world', 10, Number.NaN, '赤炎天', 'min')).toBe(false)
    expect(e.updateRecord('fastest_world', 10, 1, 42 as never, 'min')).toBe(false)
    expect(e.updateRecord('fastest_world', 10, 1, '赤炎天', 'max')).toBe(false)
    expect(e.updateRecord('fastest_world', 10, 1, '赤炎天', 'min')).toBe(true)
    expect(e.chooseDao('ghost_dao' as never)).toBe(false)
    expect(e.daoPath).toBeNull()
    expect(e.milestones.map(m => m.id)).toEqual(['first_world'])
    expect(e.records.fastest_world).toEqual({ value: 10, life: 1, note: '赤炎天' })
  })

  /**
   * 读档侧也要截。
   *
   * 上一轮补的是 updateRecord 的**写入**路径(自建挑战的书名),而 sanitize 那条仍原样收
   * —— 手改存档塞 10 万字,$state 序列化出来 100343 字节,纪录行还要渲染那一整段。
   * 写入与读档是两条独立路径,都得截;与 player.name / loadouts.name 同一把尺,
   * 见 data/constants 里 NAME_MAX_LENGTH 的注释。
   */
  it('sanitize 也把纪录 note 截到 NAME_MAX_LENGTH', () => {
    const e = useEndgameStore()
    const huge = '甲'.repeat(100000)
    ;(e as unknown as { records: Record<string, unknown> }).records = {
      fastest_world: { value: 10, life: 1, note: huge }
    }
    e.sanitize()
    const stored = e.records.fastest_world?.note ?? ''
    expect(stored.length, `读档后 note 长度 ${stored.length} 超了上限`).toBeLessThanOrEqual(NAME_MAX_LENGTH)
    expect(JSON.stringify(e.$state).length, '坏档把 state 撑爆了').toBeLessThan(2000)
  })

  /**
   * 纪录 note 要截到 NAME_MAX_LENGTH(写入路径)。
   *
   * 它有两个来源:自建挑战的书名(输入框写了 maxlength=8,但那只是输入侧约束)
   * 与读档(手改存档能塞进几十万字符 —— 存档爆量、纪录行还要渲染那一整段)。
   * 与 player.name / loadouts.name 同一把尺,见 data/constants 里 NAME_MAX_LENGTH 的注释。
   * 补之前实测:5000 字的 note 被原样存进 records。
   */
  it('纪录 note 截到 NAME_MAX_LENGTH,超长不落库', () => {
    const e = useEndgameStore()
    e.updateRecord('best_custom', 100, 1, '甲'.repeat(5000), 'max')
    const stored = e.records.best_custom?.note ?? ''
    expect(stored.length, `存进来的 note 长度 ${stored.length} 超了上限`).toBeLessThanOrEqual(NAME_MAX_LENGTH)
    // 正常长度原样保留
    e.updateRecord('best_custom', 200, 1, '太虚试炼', 'max')
    expect(e.records.best_custom?.note).toBe('太虚试炼')
  })

  it('每日落闸不接受非有限日号，避免 NaN 让当日赏无限重领', () => {
    const e = useEndgameStore()
    e.markDailyDone(Number.NaN)
    e.markDailyDone(Number.POSITIVE_INFINITY)
    expect(e.dailyDoneDay).toBeNull()
    e.markDailyDone(-1)
    expect(e.dailyDoneDay, '负数日号不是任何一天,不得关闸').toBeNull()
    e.markDailyDone(20261022.8)
    expect(e.dailyDoneDay).toBe(20261022)
  })

  it('读档时坏日号与坏纪录按同一语义收口,不留下永不匹配的日号或 0 回合纪录', () => {
    const e = useEndgameStore()
    e.$patch({
      dailyDoneDay: 20261022.8,
      records: {
        fastest_world: { value: 0, life: 2, note: '赤炎天' },
        highest_pact: { value: 2.5, life: 2, note: '赤炎天·血契' }
      } as never
    })
    e.sanitize()
    expect(e.dailyDoneDay, '日号按写入侧同一把尺取整').toBe(20261022)
    expect(e.records.fastest_world, '零回合不是一场破界').toBeUndefined()
    expect(e.records.highest_pact).toEqual({ value: 2.5, life: 2, note: '赤炎天·血契' })
  })

  it('最快破界只收正回合,0 与负数不得占住纪录', () => {
    const e = useEndgameStore()
    expect(e.updateRecord('fastest_world', 0, 1, '赤炎天', 'min')).toBe(false)
    expect(e.updateRecord('fastest_world', -3, 1, '赤炎天', 'min')).toBe(false)
    expect(e.records.fastest_world).toBeUndefined()
    expect(e.updateRecord('fastest_world', 12, 1, '赤炎天', 'min')).toBe(true)
    expect(e.records.fastest_world).toEqual({ value: 12, life: 1, note: '赤炎天' })
  })

  it('破界与试炼计数在运行时被写成非对象时,总计与写入都不抛错', () => {
    const e = useEndgameStore()
    e.$patch({
      worldClears: null as never,
      trialRecords: ['bad'] as never
    })

    expect(() => e.totalClears, '总计应把坏容器当作空表').not.toThrow()
    expect(e.totalClears).toBe(0)
    expect(() => e.recordWorldClear('chiyan')).not.toThrow()
    expect(e.worldClears).toEqual({ chiyan: 1 })
    expect(() => e.recordTrial('qisha', 12)).not.toThrow()
    expect(e.trialRecords).toEqual({ qisha: { clears: 1, bestRounds: 12 } })
  })
})

describe('终局一次性引导标记 sanitize', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('损坏的真值(非字面 true)被 ===true 归一,不再永久压掉或重播引导', () => {
    const e = useEndgameStore()
    ;(e as unknown as { endgameTutorialSeen: unknown }).endgameTutorialSeen = 'false'
    ;(e as unknown as { daoFruitTutorialSeen: unknown }).daoFruitTutorialSeen = 1
    ;(e as unknown as { resourceDialogSeen: unknown }).resourceDialogSeen = 'true'
    ;(e as unknown as { soulTutorialSeen: unknown }).soulTutorialSeen = 0
    e.sanitize()
    expect(e.endgameTutorialSeen, '"false"不再被当成已看,引导按需可出').toBe(false)
    expect(e.daoFruitTutorialSeen, '数字 1 不再永久压掉道果引导').toBe(false)
    expect(e.resourceDialogSeen, '"true"不再永久压掉资源弹窗').toBe(false)
    expect(e.soulTutorialSeen, '0 → false').toBe(false)
  })

  /**
   * `soulTutorialSeen` 的现状:**只写不读**。
   *
   * 同组另外两个教程标记都接了线(endgameTutorialSeen → shouldShowEndgameTutorial,
   * daoFruitTutorialSeen → shouldShowFruitTutorial),唯独这个没有对应的
   * shouldShowSoulTutorial,器魂页也没有首次教学弹窗 —— 是加进来但没接线的那一半。
   *
   * 它仍在 sanitize 里做布尔归位、转世审计也断言它跨世保留,所以不删。
   * 这条把现状钉住:哪天有人真读了它(或删了字段),就会红,提醒同步改
   * `endgame.ts` 里那段说明。
   */
  it('soulTutorialSeen 生产代码里没有读取点', () => {
    const srcRoot = resolve(__dirname, '..')
    const reads: string[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.(ts|vue)$/.test(e.name) && !e.name.endsWith('.spec.ts')) {
          const lines = readFileSync(p, 'utf-8').split('\n')
          lines.forEach((line, i) => {
            if (!line.includes('soulTutorialSeen')) return
            // 声明与导出不算读取
            if (/const soulTutorialSeen\s*=/.test(line)) return
            if (/^\s*soulTutorialSeen,?\s*$/.test(line)) return
            if (/soulTutorialSeen\s*:/.test(line)) return
            if (/soulTutorialSeen\.value\s*=[^=]/.test(line)) return
            reads.push(`${relative(srcRoot, p)}:${i + 1} ${line.trim().slice(0, 70)}`)
          })
        }
      }
    }
    walk(srcRoot)
    expect(reads, `soulTutorialSeen 出现了读取点,该更新 endgame.ts 的说明:\n${reads.join('\n')}`).toEqual([])
  })

  it('sanitize:器魂 uid 与装配位都去重,同一枚不重复计词条', () => {
    const e = useEndgameStore()
    e.$patch({
      souls: [
        { uid: 's1', type: 'fengmang', grade: 1, fromName: '剑' },
        { uid: 's1', type: 'fengmang', grade: 1, fromName: '剑' },
        { uid: 's2', type: 'gangdun', grade: 1, fromName: '盾' }
      ],
      equippedSouls: ['s1', 's1', 's2']
    })
    e.sanitize()
    expect(e.souls.map(s => s.uid), '魂仓同号只留一枚').toEqual(['s1', 's2'])
    expect(e.equippedSouls, '装配位同一枚只占一格').toEqual(['s1', 's2'])
    expect(e.activeSouls, '装配出来的也是两枚,不是三枚').toHaveLength(2)
  })

  it('sanitize:器魂的坏品阶夹回合法档、野类型清掉,不再让器魂页白屏', () => {
    const e = useEndgameStore()
    e.$patch({
      souls: [
        { uid: 's1', type: 'fengmang', grade: Number.NaN, fromName: '剑' },
        { uid: 's2', type: 'gangdun', grade: -3, fromName: '盾' },
        { uid: 's3', type: 'fengmang', grade: 99, fromName: '刀' },
        { uid: 's4', type: 'bogus_type', grade: 1, fromName: '棍' }
      ] as never
    })
    e.sanitize()
    expect(e.souls.map(s => [s.uid, s.grade]), '坏品阶修平,野类型整枚清掉').toEqual([
      ['s1', 0],
      ['s2', 0],
      ['s3', 5]
    ])
    expect(e.souls.every(s => typeof soulGradeDef(s.grade).color === 'string'), '每一枚都能取到品阶名色').toBe(true)
  })

  it('sanitize:装配位超出器魂槽数时按上限裁剪,多出来的不生效', () => {
    const e = useEndgameStore()
    e.$patch({
      souls: ['s1', 's2', 's3', 's4', 's5'].map((uid, i) => ({
        uid,
        type: i % 2 === 0 ? 'fengmang' : 'gangdun',
        grade: 1,
        fromName: '器'
      })),
      equippedSouls: ['s1', 's2', 's3', 's4', 's5']
    })
    e.sanitize()
    expect(e.equippedSouls, '只留先装的三缕').toEqual(['s1', 's2', 's3'])
    expect(e.activeSouls, '生效的也只有三缕').toHaveLength(SOUL_SLOTS)
  })

  it('sanitize:修行节点同一条只留一次', () => {
    const e = useEndgameStore()
    e.$patch({
      milestones: [
        { id: 'first_dao', life: 1, at: 100 },
        { id: 'first_dao', life: 2, at: 200 },
        { id: 'first_world', life: 2, at: 300 },
        { id: 'first_ghost', life: 3, at: 400 }
      ]
    })
    e.sanitize()
    expect(e.milestones.map(m => m.id), '同一条只留先出现的那次，认不出的节点直接清掉').toEqual([
      'first_dao',
      'first_world'
    ])
  })
})

describe('天界终局坏档 · 按 id 认道/认界/认试炼', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('认不出的道途回落 null,不再把「此生道途已定」永久锁死', () => {
    const e = useEndgameStore()
    e.$patch({ daoPath: 'ghost_dao' as never })
    e.sanitize()
    expect(e.daoPath).toBeNull()
    expect(e.chooseDao('sword')).toBe(true)
  })

  it('运行时写入的野道途不再挡住本世重选,合法道途仍不可改', () => {
    const e = useEndgameStore()
    e.$patch({ daoPath: 'ghost_dao' as never })

    expect(e.chooseDao('sword'), '野 id 不是一条已立之道').toBe(true)
    expect(e.daoPath).toBe('sword')
    expect(e.chooseDao('slaughter'), '真道途一旦立下不可另择').toBe(false)
    expect(e.daoPath).toBe('sword')
  })

  it('认得 four 道途原样保留', () => {
    for (const id of ['sword', 'longevity', 'fate', 'slaughter'] as const) {
      setActivePinia(createPinia())
      const e = useEndgameStore()
      e.$patch({ daoPath: id })
      e.sanitize()
      expect(e.daoPath).toBe(id)
    }
  })

  it('世界破界次数只留认得的天界/虚界,次数按非负整数收口', () => {
    const e = useEndgameStore()
    e.$patch({ worldClears: { chiyan: 3.7, void: 2, nowhere: 9, bogus: Number.NaN } as never })
    e.sanitize()
    expect(e.worldClears).toEqual({ chiyan: 3, void: 2 })
  })

  it('试炼纪录的 NaN 回合不再挂出「最佳 NaN 回合」', () => {
    const e = useEndgameStore()
    e.$patch({
      trialRecords: {
        qisha: { clears: 2, bestRounds: Number.NaN },
        bogus: { clears: 4, bestRounds: 5 }
      } as never
    })
    e.sanitize()
    expect(e.trialRecords.qisha).toEqual({ clears: 2, bestRounds: 0 })
    expect(e.trialRecords.bogus, '认不出的试炼没有卡会读它').toBeUndefined()
  })

  it('在途远征的战报行逐项修平:回合与余血不再写出 NaN', () => {
    const e = useEndgameStore()
    e.$patch({
      worldRun: hostileRun({
        rows: [
          { foeName: '妖王', win: 'yes', rounds: Number.NaN, hpLeftPct: 7 },
          { foeName: '鬼将', win: true, rounds: 3, hpLeftPct: 0.4 }
        ] as never
      })
    })
    e.sanitize()
    expect(e.worldRun!.rows[0]).toEqual({ foeName: '妖王', win: false, rounds: 0, hpLeftPct: 1 })
    expect(e.worldRun!.rows[1]).toEqual({ foeName: '鬼将', win: true, rounds: 3, hpLeftPct: 0.4 })
  })

  it('极限纪录只留 RECORD_DEFS 认得的键,坏值照旧收口', () => {
    const e = useEndgameStore()
    e.$patch({
      records: {
        fastest_world: { value: Number.NaN, life: 2, note: '赤炎天' },
        highest_pact: { value: 3.5, life: 2, note: '赤炎天·血契' },
        bogus_record: { value: 9, life: 1, note: '无名' }
      } as never
    })
    e.sanitize()
    expect(e.records, '野键与零值纪录不留;有效纪录照旧保留').toEqual({
      highest_pact: { value: 3.5, life: 2, note: '赤炎天·血契' }
    })
  })
})

/** 道痕是「修行画像」「今昔之比」「忆战/重写」的共同底账 */
describe('道痕坏档 · 逐条逐字段修形', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('非对象/无 targetId 的条目被剔掉,坏字段按语义兜底', () => {
    const e = useEndgameStore()
    e.$patch({
      marks: [
        null,
        'x',
        { life: 1 },
        {
          life: Number.NaN,
          daoPathId: 'ghost_dao',
          targetId: 'chiyan',
          targetName: 42,
          cleared: 'yes',
          rounds: Number.NaN,
          buildName: 7,
          powerText: null,
          at: Number.NaN
        }
      ]
    } as never)
    e.sanitize()

    expect(e.marks, '没有 targetId 的残骸不是道痕').toHaveLength(1)
    const m = e.marks[0]!
    expect(m.life, '第 0 世没有来路,回落第 1 世').toBe(1)
    expect(m.daoPathId, '认不出的道途取不到当年的规则').toBeNull()
    expect(m.targetName, '没名字就拿 id 顶上,不印 42').toBe('chiyan')
    expect(m.cleared, '只有字面 true 才算破界').toBe(false)
    expect(m.rounds).toBe(0)
    expect(m.buildName, '画像按它做字符串匹配').toBe('杂学')
    expect(m.powerText).toBe('')
    expect(m.at).toBe(0)

    expect(() => cultivatorProfile(e.marks)).not.toThrow()
    expect(() => legacyComparisons(e.marks)).not.toThrow()
  })

  it('忆战快照成不了那一局时整块作废,界面按「不可考」处理', () => {
    const e = useEndgameStore()
    const base = { life: 2, targetId: 'chiyan', targetName: '赤炎天', cleared: true, rounds: 9, buildName: '剑', powerText: '1', at: 5 }
    e.$patch({
      marks: [
        { ...base, replay: { artifacts: null, skills: 'x' } },
        { ...base, at: 6, replay: { mods: {}, attack: gn(1), defense: gn(1), maxHp: gn(0), speed: 1, skills: [], artifacts: [], pactId: null } }
      ]
    } as never)
    e.sanitize()

    expect(e.marks[0]!.replay, '技能表不是数组,快照开不了打').toBeUndefined()
    expect(e.marks[1]!.replay, '气血为零的一战不成立').toBeUndefined()
    expect(() => legacyComparisons(e.marks), '无快照的痕不参与今昔之比').not.toThrow()
  })

  it('快照本身合法时原样保留,野技能/野法宝逐条剔掉', () => {
    const e = useEndgameStore()
    e.$patch({
      marks: [
        {
          life: 3,
          daoPathId: 'sword',
          major: 12,
          targetId: 'chiyan',
          targetName: '赤炎天',
          cleared: true,
          rounds: 9,
          buildName: '剑修',
          powerText: '1.2e9',
          at: 7,
          ruleset: '25.0',
          context: { worldId: 'chiyan', mutatorIds: ['heal_down', 'ghost_mutator'], gateId: 'ghost_gate' },
          replay: {
            mods: { attackPct: 0.2, ghostStat: 99 },
            attack: gn(120),
            defense: gn(80),
            maxHp: gn(1000),
            speed: 1.4,
            skills: [
              { name: '斩', mult: 2, rate: 0.25, effect: 'pierce' },
              { name: '坏', mult: Number.NaN, rate: 0.1 }
            ],
            artifacts: [
              { defId: 'ghost_artifact', level: 3 },
              { defId: 'af_muyu', level: Number.NaN },
              { defId: 'af_muyu', level: 9 },
              { defId: 'af_lihuo', level: 999 },
              // 第三、四件合法但超出法宝位上限
              { defId: 'af_xuantian', level: 0 },
              { defId: 'af_fuyao', level: 0 }
            ],
            pactId: 'xue'
          }
        }
      ]
    } as never)
    e.sanitize()

    const m = e.marks[0]!
    expect(m.targetName).toBe('赤炎天')
    expect(m.context, '认不出的变数与门取不到规则,一并剔掉').toEqual({ worldId: 'chiyan', mutatorIds: ['heal_down'] })
    const replay = m.replay!
    expect(replay, '三维齐备的快照要留住').toBeDefined()
    expect(replay.skills, '坏技能没有倍率可言').toEqual([{ name: '斩', mult: 2, rate: 0.25, effect: 'pierce' }])
    expect(replay.artifacts, '认不出的法宝、坏重数越界与重复佩带都不进当年那一局').toEqual([
      { defId: 'af_muyu', level: 0 },
      { defId: 'af_lihuo', level: 9 }
    ])
    expect(replay.artifacts, '忆战快照也受法宝位上限约束,超编件不许一起生效').toHaveLength(ARTIFACT_MAX_SLOTS)
    expect(replay.mods, '野词条键会让构筑厚度与当年对不上').toEqual({ attackPct: 0.2 })
    expect(replay.pactId).toBe('xue')
    expect(() => snapFromReplay('当年', replay), '忆战入口').not.toThrow()
  })

  it('忆战技能概率与倍率按可玩值域收口,野 effect 不再带进当年那一局', () => {
    const e = useEndgameStore()
    e.$patch({
      marks: [
        {
          life: 3,
          targetId: 'chiyan',
          targetName: '赤炎天',
          cleared: true,
          rounds: 9,
          buildName: '剑修',
          powerText: '1.2e9',
          at: 7,
          replay: {
            mods: {},
            attack: gn(120),
            defense: gn(80),
            maxHp: gn(1000),
            speed: 1.4,
            skills: [
              { name: '必中', mult: 2, rate: 999, effect: 'pierce' },
              { name: '封印', mult: -5, rate: -1, effect: 'ghost_effect' }
            ],
            artifacts: [],
            pactId: null
          }
        }
      ]
    } as never)
    e.sanitize()

    expect(e.marks[0]!.replay!.skills).toEqual([
      { name: '必中', mult: 2, rate: 1, effect: 'pierce' },
      { name: '封印', mult: 0, rate: 0 }
    ])
  })

  it('道痕超过 MAX_MARKS 时按写入侧同一把尺截断', () => {
    const e = useEndgameStore()
    const many = Array.from({ length: 100 }, (_, i) => ({
      life: 1,
      daoPathId: null,
      targetId: 'chiyan',
      targetName: '赤炎天',
      cleared: true,
      rounds: i,
      buildName: '剑',
      powerText: '',
      at: i
    }))
    e.$patch({ marks: many } as never)
    e.sanitize()
    expect(e.marks).toHaveLength(60)
  })
})

describe('虚界坏档 · 形状不成立整座作废', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** 以手工天界为模板造一座形状完整的虚界(与生成器同一套结构) */
  function voidWorld(): Record<string, unknown> {
    const base = celestialWorldDef('chiyan')!
    return { ...base, id: 'void', name: '虚界·试作' }
  }

  it('形状完整的虚界原样保留', () => {
    const e = useEndgameStore()
    e.$patch({ voidWorld: voidWorld() } as never)
    e.sanitize()
    expect(e.voidWorld?.id).toBe('void')
    expect(e.voidWorld?.name).toBe('虚界·试作')
    expect(e.voidWorld?.routes).toHaveLength(EXPEDITION_ROUTE_LAYERS)
  })

  it('缺敌阵/缺规则文案时整座作废,天界页不再对着 undefined 调 map', () => {
    const e = useEndgameStore()
    for (const patch of [{ foes: undefined }, { ruleText: 'x' }, { routes: [] }, { guardian: null }]) {
      e.$patch({ voidWorld: { ...voidWorld(), ...patch } } as never)
      e.sanitize()
      expect(e.voidWorld, `${JSON.stringify(patch)} 不是一座能打的虚界`).toBeNull()
    }
  })

  it('敌方比例被写成 0/NaN 时整座作废,而不是打一场负血或秒杀', () => {
    const e = useEndgameStore()
    const w = voidWorld()
    const foes = (w.foes as Record<string, unknown>[]).map(f => ({ ...f, hpR: Number.NaN }))
    e.$patch({ voidWorld: { ...w, foes } } as never)
    e.sanitize()
    expect(e.voidWorld, '血量为零的敌人不成立').toBeNull()

    e.$patch({ voidWorld: { ...voidWorld(), guardian: { ...(voidWorld().guardian as object), speed: 0 } } } as never)
    e.sanitize()
    expect(e.voidWorld, '速度为 0 的界主永不先手').toBeNull()
  })

  it('id 不是 void 的残块不会被当成虚界', () => {
    const e = useEndgameStore()
    e.$patch({ voidWorld: { ...voidWorld(), id: 'chiyan' } } as never)
    e.sanitize()
    expect(e.voidWorld).toBeNull()
  })

  it('虚界敌形技能与词条逐项修形:概率/倍率不越界,野词条键不参与天道判定', () => {
    const e = useEndgameStore()
    const w = voidWorld()
    const foes = (w.foes as Record<string, unknown>[]).map((f, i) =>
      i === 0
        ? {
            ...f,
            mods: { dodgeRate: 0.2, ghostStat: 99 },
            skills: [
              { name: '必中', mult: 999, rate: 999, effect: 'stun' },
              { name: '封印', mult: -2, rate: -1, effect: 'ghost_effect' }
            ]
          }
        : f
    )
    e.$patch({ voidWorld: { ...w, foes } } as never)
    e.sanitize()

    const foe = e.voidWorld!.foes[0]!
    expect(foe.skills).toEqual([
      { name: '必中', mult: 10, rate: 1, effect: 'stun' },
      { name: '封印', mult: 0, rate: 0 }
    ])
    expect(foe.mods, '野词条键会让构筑厚度虚增').toEqual({ dodgeRate: 0.2 })
  })

/**
 * 忆战快照的量级守卫。
 *
 * sanitizeMarkReplay 原先用裸 gn() 归一三维,它不限指数:
 * 坏档写 { m: 1, e: 1e9 } 会让道痕列表把战力印成「1.00e1000000000」。
 * 改走 asBoundedGNum 后越界归零,三维不全的快照整块作废(界面按「不可考」),
 * 但**道痕本身要留住** —— 那一世的胜负与回合数是玩家的历史,不该因快照坏掉就消失。
 */
describe('忆战快照 · 量级', () => {
  const base = {
    life: 2,
    targetId: 'chiyan',
    targetName: '赤炎天',
    cleared: true,
    rounds: 9,
    buildName: '剑',
    powerText: '1',
    at: 5
  }

  function replayWith(gnum: unknown) {
    return { mods: {}, attack: gnum, defense: gnum, maxHp: gnum, speed: 1, skills: [], artifacts: [], pactId: null }
  }

  it('三维指数越界时快照作废,不印出非法数字', () => {
    const e = useEndgameStore()
    e.$patch({ marks: [{ ...base, replay: replayWith({ m: 1, e: 1e9 }) }] } as never)
    e.sanitize()
    expect(e.marks[0]!.replay, '越界三维归零后不成一局,快照应作废').toBeUndefined()
  })

  it('快照作废但道痕仍在(那一世的胜负不该因快照坏掉就消失)', () => {
    const e = useEndgameStore()
    e.$patch({ marks: [{ ...base, replay: replayWith({ m: 1, e: 1e9 }) }] } as never)
    e.sanitize()
    expect(e.marks, '道痕本身必须留住').toHaveLength(1)
    expect(e.marks[0]!.targetName).toBe('赤炎天')
    expect(e.marks[0]!.rounds).toBe(9)
    expect(e.marks[0]!.cleared).toBe(true)
  })

  it('合法快照原样保留(修形非空转)', () => {
    const e = useEndgameStore()
    const ok = { ...replayWith(gn(100)) }
    e.$patch({ marks: [{ ...base, replay: ok }] } as never)
    e.sanitize()
    expect(e.marks[0]!.replay, '合法快照不该被当成坏档').toBeDefined()
  })

  it('裸数字三维仍被接受(旧档常把 GNum 写成数字)', () => {
    const e = useEndgameStore()
    const ok = { ...replayWith(undefined), attack: 100, defense: 55, maxHp: 1400 }
    e.$patch({ marks: [{ ...base, replay: ok }] } as never)
    e.sanitize()
    expect(e.marks[0]!.replay, '裸数字应被归一而非丢弃').toBeDefined()
  })
})


/**
 * 远征规则修形。
 *
 * `world.rules` 此前只判了「是不是对象」,内部字段一概原样收下 ——
 * 而 combat.ts 第 202 行是 `mulN(maxHp, rules.playerStartHpPct ?? 1)`,
 * 实测 `mulN(100, Infinity)` 与 `mulN(100, NaN)` 都回 0:
 * 坏档写这两个值,玩家一进远征就满血变空血、开局即死。
 * `maxRounds` 写 Infinity 会让第 547 行的回合循环失去上界。
 */
describe('远征规则修形 · 坏档里的 rules 字段', () => {
  const foe = { name: 'f', icon: 'i', atkR: 1, defR: 1, hpR: 1, speed: 1, skills: [], mods: {} }
  const node = (id: string) => ({ id, name: 'N', desc: '', foe, bonus: 1, riskText: '' })
  const worldWith = (rules: unknown, nodeRules?: unknown) => ({
    id: 'void',
    name: 'V',
    seal: 's',
    anchorTier: 1,
    desc: '',
    ruleText: [],
    rules,
    foes: [foe],
    guardian: foe,
    rewardDaoSource: 1,
    routes: [
      [{ ...node('n1'), ...(nodeRules === undefined ? {} : { rules: nodeRules }) }, node('n2')],
      [node('n3'), node('n4')],
      [node('n5'), node('n6')]
    ]
  })

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('开场气血为 Infinity / NaN 时剔除该字段(否则一进远征即判负)', () => {
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, -1, 5]) {
      const endgame = useEndgameStore()
      endgame.$patch({ voidWorld: worldWith({ playerStartHpPct: bad }) as never })
      endgame.sanitize()
      const rules = (endgame.voidWorld as never as { rules?: { playerStartHpPct?: number } }).rules
      const got = rules?.playerStartHpPct
      expect(got === undefined || (got > 0 && got <= 1), `playerStartHpPct=${bad} 修形后仍是 ${got}`).toBe(true)
    }
    // 正常的 0.5 照常保留
    const endgame = useEndgameStore()
    endgame.$patch({ voidWorld: worldWith({ playerStartHpPct: 0.5 }) as never })
    endgame.sanitize()
    expect((endgame.voidWorld as never as { rules?: { playerStartHpPct?: number } }).rules?.playerStartHpPct).toBe(0.5)
  })

  it('maxRounds 为 Infinity / 负数时剔除该字段(否则回合循环失去上界)', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ voidWorld: worldWith({ maxRounds: Number.POSITIVE_INFINITY }) as never })
    endgame.sanitize()
    expect((endgame.voidWorld as never as { rules?: { maxRounds?: number } }).rules?.maxRounds).toBeUndefined()

    const e2 = useEndgameStore()
    e2.$patch({ voidWorld: worldWith({ maxRounds: 40 }) as never })
    e2.sanitize()
    expect((e2.voidWorld as never as { rules?: { maxRounds?: number } }).rules?.maxRounds).toBe(40)
  })

  it('倍率夹到 [0,100],负治疗与离谱攻击都不留', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ voidWorld: worldWith({ playerAtkMult: 1e9, healMult: -5, enemyHpMult: 1e12 }) as never })
    endgame.sanitize()
    const rules = (endgame.voidWorld as never as { rules?: { playerAtkMult?: number; healMult?: number; enemyHpMult?: number } }).rules
    expect(rules?.playerAtkMult).toBe(100)
    expect(rules?.healMult).toBe(0)
    expect(rules?.enemyHpMult).toBe(100)
  })

  it('perRounds.interval 至少为 1(0 会让 round % 0 恒为 NaN,整条规则静默失效)', () => {
    const endgame = useEndgameStore()
    endgame.$patch({
      voidWorld: worldWith({ perRounds: { interval: 0, playerHealPct: 5, playerShieldPct: Number.NaN, enemyAtkGrowth: -3 } }) as never
    })
    endgame.sanitize()
    const per = (endgame.voidWorld as never as { rules?: { perRounds?: { interval: number; playerHealPct: number; playerShieldPct: number; enemyAtkGrowth: number } } })
      .rules?.perRounds
    expect(per?.interval).toBe(1)
    expect(per?.playerHealPct).toBe(1)
    expect(per?.playerShieldPct).toBe(0)
    expect(per?.enemyAtkGrowth).toBe(0)
  })

  it('路线节点的 rules 同样修形(节点规则也会进战斗)', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ voidWorld: worldWith({}, { playerStartHpPct: 99, maxRounds: -5 }) as never })
    endgame.sanitize()
    const nodeRules = (endgame.voidWorld as never as { routes?: { rules?: { playerStartHpPct?: number; maxRounds?: number } }[][] })
      .routes?.[0]?.[0]?.rules
    expect(nodeRules?.playerStartHpPct, '节点开场气血也要夹回 1').toBe(1)
    expect(nodeRules?.maxRounds, '节点回合上界至少为 1').toBe(1)
  })
})
})
