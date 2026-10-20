/**
 * 远征读档恢复守卫 —— endgame.sanitize() 对 worldRun(在途远征)的形体修复。
 *
 * worldRun 是**活状态**(每场战斗都读 layer/carriedHpPct/winStacks):
 * layer 越界会跳到不存在的层,carriedHpPct 越界会把开局算成 NaN 或无敌。
 * 读档恢复处(endgame.sanitize)把每一域都夹回安全区间 —— 但此前 0 个测试调用
 * sanitize,一处 clamp 写坏(unknown worldId 不 void / layer 不夹 / carriedHp 不夹 /
 * rows 不过滤)会静默滑过 CI。这里把「夹回」钉成测试。
 *
 * 规则来源(端到端核实):endgame.ts:81-99 sanitize;saveShape.ts:56-59
 * asCarriedHpPct;EXPEDITION_GUARDIAN_LAYER = EXPEDITION_ROUTE_LAYERS = 3。
 */
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEndgameStore, type WorldRunState } from './endgame'
import { EXPEDITION_GUARDIAN_LAYER } from '@/data/endgame'
import { SOUL_SLOTS, soulGradeDef } from '@/data/souls'
import { rerollVoidWorld, VOID_REROLL_COST } from '@/core/expedition'
import { usePlayerStore } from '@/stores/player'
import type { GeneratedWorld } from '@/core/worldGen'
import { cultivatorProfile } from '@/core/identity'
import { legacyComparisons } from '@/core/compare'
import { snapFromReplay } from '@/core/endgameService'
import { gn } from '@/utils/gnum'

// generateApprovedWorld 的成败由 h.genResult 开关:让重掷代价的「扣/退」可确定性断言
const h = vi.hoisted(() => ({ genResult: 'world' as 'world' | 'null' }))
vi.mock('@/core/worldGen', async importOriginal => {
  const mod = await importOriginal<typeof import('@/core/worldGen')>()
  // vi.mock 工厂被提升至一切静态 import 之上,此处只能运行时 import;
  // 静态导入的绑定在工厂执行时尚未就绪(TDZ),故为已知模块仍须 await import。
  const { celestialWorldDef } = await import('@/data/endgame')
  return {
    ...mod,
    generateApprovedWorld: (): GeneratedWorld | null =>
      h.genResult === 'world'
        ? ({ world: celestialWorldDef('chiyan')!, audit: {} as never, novelty: 0.5, rejected: 3 } as unknown as GeneratedWorld)
        : null
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

  it('虚界(void)远征在途保护:worldId=void 不被作废', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ worldRun: hostileRun({ worldId: 'void' }) })
    endgame.sanitize()
    expect(endgame.worldRun?.worldId).toBe('void')
  })

  it('layer 越界/非数被夹回 [0, GUARDIAN_LAYER],NaN 兜底 0', () => {
    const endgame = useEndgameStore()
    const cases: [unknown, number][] = [
      [EXPEDITION_GUARDIAN_LAYER + 50, EXPEDITION_GUARDIAN_LAYER], // 越上界夹到界主层
      [-5, 0], // 越下界夹到 0
      [2.9, 2], // 小数取整
      [NaN, 0], // 非数兜底 0
      ['7' as unknown as number, 0] // 非数(字符串)兜底 0
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
      [2, 1], // 上限(无敌禁区)
      [0, 0.05], // 下限(垂死也保一格)
      [0.4, 0.4], // 中值原样
      [NaN, 1], // 非数兜底满血
      ['x' as unknown as number, 1]
    ]
    for (const [raw, expected] of cases) {
      endgame.$patch({ worldRun: hostileRun({ carriedHpPct: raw as number }) })
      endgame.sanitize()
      expect(endgame.worldRun?.carriedHpPct, `carriedHpPct=${String(raw)}`).toBe(expected)
    }
  })

  it('pactId/gateId 只收 string,非串一律置 null', () => {
    const endgame = useEndgameStore()
    endgame.$patch({
      worldRun: hostileRun({ pactId: 123 as unknown as null, gateId: 5 as unknown as null })
    })
    endgame.sanitize()
    expect(endgame.worldRun?.pactId).toBeNull()
    expect(endgame.worldRun?.gateId).toBeNull()

    endgame.$patch({ worldRun: hostileRun({ pactId: 'p', gateId: 'g' }) })
    endgame.sanitize()
    expect(endgame.worldRun?.pactId).toBe('p')
    expect(endgame.worldRun?.gateId).toBe('g')
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
})

describe('混元界重掷代价 · rerollVoidWorld 扣/退与失效分支', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    usePlayerStore().major = 9 // 达到飞升门槛,终局解锁
  })

  it('虚界远征在途时不可重摇:worldId=void 拒绝,道源分文不动', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ daoPath: 'sword', daoSource: 50 })
    endgame.$patch({ worldRun: { worldId: 'void' } as unknown as WorldRunState })
    expect(rerollVoidWorld()).toBe(false)
    expect(endgame.daoSource).toBe(50)
    expect(endgame.voidWorld).toBeNull()
  })

  it('道源不足拒绝重摇,不扣账', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ daoPath: 'sword', daoSource: VOID_REROLL_COST - 1 })
    expect(rerollVoidWorld()).toBe(false)
    expect(endgame.daoSource).toBe(VOID_REROLL_COST - 1)
  })

  it('重摇成功扣 VOID_REROLL_COST,虚界成形', () => {
    h.genResult = 'world'
    const endgame = useEndgameStore()
    endgame.$patch({ daoPath: 'sword', daoSource: 50 })
    expect(rerollVoidWorld()).toBe(true)
    expect(endgame.daoSource).toBe(50 - VOID_REROLL_COST)
    expect(endgame.voidWorld?.id).toBe('chiyan')
  })

  it('裁判否决生成失败:扣了又退,道源无损、虚界不变', () => {
    h.genResult = 'null'
    const endgame = useEndgameStore()
    endgame.$patch({ daoPath: 'sword', daoSource: 50 })
    expect(rerollVoidWorld()).toBe(false)
    expect(endgame.daoSource).toBe(50) // 先扣 10 又退 10
    expect(endgame.voidWorld).toBeNull()
  })
})

// 恢复 snaity:让 h.genResult 回默认,免得影响其他可能读取它的用例
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
    expect(endgame.daoSource).toBe(7) // 拒绝不吞账
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
    endgame.addDaoSource(0.5) // 3 + 0.5 = 3.5 → floor 3
    expect(endgame.daoSource).toBe(3)
    endgame.addDaoSource(1) // +1 → 4
    expect(endgame.daoSource).toBe(4)
  })

  it('addDaoSource 单调:小数叠加逐次向下取整,不漏不四舍五入', () => {
    const endgame = useEndgameStore()
    endgame.$patch({ daoSource: 0 })
    endgame.addDaoSource(2.2) // → 2
    expect(endgame.daoSource).toBe(2)
    endgame.addDaoSource(0.5) // 2 + 0.5 = 2.5 → 2(不是 3)
    expect(endgame.daoSource).toBe(2)
    endgame.addDaoSource(1) // +1 → 3
    expect(endgame.daoSource).toBe(3)
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
   * 器魂 uid 重复:装配表按 uid 映回魂仓,两条同号会让同一枚的词条被算两次。
   * 这是「一件东西被当成两件」的同族缺陷(装备/法宝侧同一根因)。
   */
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

  /**
   * 器魂品阶是 `SOUL_GRADES[rank]!` 的裸下标:坏档写成 NaN 时取到 undefined,
   * 器魂页渲染 `soulGradeDef(grade).color` 当场抛错,而 Vue 会不断重试渲染 ——
   * 玩家看到的是「出现异常,已记录」的 toast 反复弹出。类型认不出同理(名与词条皆空)。
   */
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

  /**
   * 装配位是硬闸(equipSoul 装到 SOUL_SLOTS 即拒):坏档写进五缕时若不截断,
   * 五缕词条会一起生效,「已凝 5/3」还会把读数顶破上限。
   */
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

  /**
   * 修行节点是「首次」语义(addMilestone 只在没有时才记):坏档同一条写两遍,
   * 「修行节点 N/总数」会多报,时间线上同一件事还要出现两次。
   */
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
    // 回落之后这一世重新选得动 —— 这正是坏 id 最要命的后果
    expect(e.chooseDao('sword')).toBe(true)
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
        bogus_record: { value: 9, life: 1, note: '无名' }
      } as never
    })
    e.sanitize()
    expect(e.records, '野键没有卡会读它，留着只会污染存档').toEqual({
      fastest_world: { value: 0, life: 2, note: '赤炎天' }
    })
  })
})

/**
 * 道痕是「修行画像」「今昔之比」「忆战/重写」的共同底账:
 * 一条缺字段或坏字段的道痕就能把这三处一起打穿 ——
 * 画像读 `buildName.includes('·')`、今昔之比按 `at` 排序、忆战直接拿快照开打。
 */
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

    // 画像与今昔之比都要能跑 —— 这两处正是坏字段的爆点
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
              { defId: 'af_muyu', level: Number.NaN }
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
    expect(replay.artifacts, '认不出的法宝与坏重数都不进当年那一局').toEqual([{ defId: 'af_muyu', level: 0 }])
    expect(replay.mods, '野词条键会让构筑厚度与当年对不上').toEqual({ attackPct: 0.2 })
    expect(replay.pactId).toBe('xue')
    expect(() => snapFromReplay('当年', replay), '忆战入口').not.toThrow()
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
