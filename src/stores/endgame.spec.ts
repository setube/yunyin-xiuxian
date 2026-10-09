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
import { rerollVoidWorld, VOID_REROLL_COST } from '@/core/expedition'
import { usePlayerStore } from '@/stores/player'
import type { GeneratedWorld } from '@/core/worldGen'

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
