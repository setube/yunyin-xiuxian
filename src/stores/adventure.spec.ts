/** 历练公共写入边界 —— 会话/区域/事件/暂停顺延 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAdventureStore } from '@/stores/adventure'
import type { AdventureSession } from '@/types'
import { gnZero } from '@/utils/gnum'
import { formatGN } from '@/utils/format'

function session(over: Partial<AdventureSession> = {}): AdventureSession {
  return {
    regionId: 'qingyun',
    mode: 'normal',
    startedAt: 1000,
    endsAt: 2000,
    nextBattleAt: 1500,
    wins: 0,
    losses: 0,
    events: 0,
    stoneGain: gnZero(),
    expGain: gnZero(),
    itemGain: 0,
    ...over
  }
}

describe('历练公共写入边界', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('setSession 拒绝野区域与坏时刻,不清掉现有会话', () => {
    const a = useAdventureStore()
    const valid = session()
    a.setSession(valid)
    a.setSession(session({ regionId: 'ghost' }))
    a.setSession(session({ endsAt: NaN }))
    a.setSession(session({ nextBattleAt: Infinity }))
    expect(a.session, '坏写入不覆盖现有会话').toEqual(valid)
    a.setSession(null)
    expect(a.session).toBeNull()
  })

  it('unlock/markCleared/markRevived 只认区域目录', () => {
    const a = useAdventureStore()
    expect(a.unlock('ghost')).toBe(false)
    expect(a.unlocked).not.toContain('ghost')
    expect(a.markCleared('ghost')).toBe(false)
    expect(a.cleared).not.toContain('ghost')
    expect(a.markRevived('ghost')).toBe(false)
    expect(a.revived).not.toContain('ghost')
  })

  it('待处理事件只认事件目录与有限非负时刻', () => {
    const a = useAdventureStore()
    a.setPendingEvent('ghost_event', 1000)
    expect(a.pendingEventId).toBeNull()
    a.setPendingEvent('ft_sword_remnant', NaN)
    expect(a.pendingEventId, '坏时刻不挂事件').toBeNull()
    a.setPendingEvent('ft_sword_remnant', 1000)
    expect(a.pendingEventId).toBe('ft_sword_remnant')
    expect(a.pendingEventSince).toBe(1000)
  })

  it('暂停顺延拒绝坏时长,不把会话时刻写成 NaN', () => {
    const a = useAdventureStore()
    a.setSession(session())
    a.setPendingEvent('ft_sword_remnant', 1000)
    for (const ms of [NaN, Infinity, -1]) a.shiftTimedState(ms)
    expect(a.session!.endsAt).toBe(2000)
    expect(a.pendingEventSince).toBe(1000)
    a.shiftTimedState(500)
    expect(a.session!.endsAt).toBe(2500)
    expect(a.pendingEventSince).toBe(1500)
  })

  it('一次见闻与路线节点只收非空 id', () => {
    const a = useAdventureStore()
    a.markEventSeen('ghost_event')
    expect(a.seenOnceEvents).toEqual([])
    a.markEventSeen('ft_sword_remnant')
    expect(a.seenOnceEvents).toEqual(['ft_sword_remnant'])
    expect(a.markNodeCleared('')).toBe(false)
    expect(a.mortalCleared).toEqual([])
  })

/**
 * 本世之界的读档自愈。
 *
 * sanitizeMortalWorld 对结构错误一律返回 null(整条链丢弃),而不是逐个节点剔除 ——
 * 只要一个节点缺字段,玩家的本世之界就整个没了。这条链路此前没有测试。
 *
 * 丢弃之后不是死局:mortalWorldService.ensureMortalWorld 见 mortalWorld 为空会重新生成,
 * 所以后果是「换了一个世界」而非「卡死」。本条把两条都钉住:
 *   1. 坏结构被整条丢弃(不留下半截世界)
 *   2. 丢弃后 mortalCleared 仍在(那是玩家已通关的记录,不该随世界一起消失)
 */
/** 造一个结构合法的本世之界 */
function mortalWorld(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    seed: 12345,
    chain: [
      {
        nodeId: 'n1',
        fromId: 'start',
        name: '青云山',
        tier: 1,
        enemies: ['e1'],
        boss: 'b1',
        archetype: 'brute',
        eventTags: ['herb']
      }
    ],
    shapeId: 'line',
    shapeName: '一线天',
    rhythmId: 'calm',
    rhythmName: '静水',
    ruleId: 'r1',
    ruleName: '规则一',
    rules: {},
    bias: '',
    bossFallbackAt: [],
    ...over
  }
}

describe('本世之界 · 读档自愈', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('结构合法的世界原样留下(修形非空转)', () => {
    const a = useAdventureStore()
    a.setMortalWorld(mortalWorld() as never)
    a.sanitize()
    expect(a.mortalWorld).not.toBeNull()
    expect(a.mortalWorld!.ruleId).toBe('r1')
    expect(a.mortalWorld!.chain).toHaveLength(1)
    expect(a.mortalWorld!.chain[0]!.name).toBe('青云山')
  })

  it('缺少 chain 的世界被整条丢弃', () => {
    const a = useAdventureStore()
    a.setMortalWorld(mortalWorld({ chain: [] }) as never)
    a.sanitize()
    expect(a.mortalWorld, '空 chain 应判为无效世界').toBeNull()
  })

  it('ruleId 不是字符串时丢弃', () => {
    const a = useAdventureStore()
    a.setMortalWorld(mortalWorld({ ruleId: 42 }) as never)
    a.sanitize()
    expect(a.mortalWorld).toBeNull()
  })

  it('单个节点缺字段会丢弃整条链(不保留半截世界)', () => {
    const a = useAdventureStore()
    const w = mortalWorld()
    const chain = w.chain as Array<Record<string, unknown>>
    chain.push({ nodeId: 'n2', fromId: 'n1', name: '断崖' }) // 缺 tier/enemies/boss 等
    a.setMortalWorld(w as never)
    a.sanitize()
    expect(a.mortalWorld, '一个坏节点就让整条链作废 —— 这是有意的严格选择').toBeNull()
  })

  it('节点 tier 不是有限数时丢弃整条链(坏 tier 会让区域阶梯算错)', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '3', null]) {
      const a = useAdventureStore()
      const w = mortalWorld()
      const chain = w.chain as Array<Record<string, unknown>>
      chain[0]!.tier = bad
      a.setMortalWorld(w as never)
      a.sanitize()
      expect(a.mortalWorld, `tier=${String(bad)} 应被判为无效世界`).toBeNull()
    }
  })

  it('节点 enemies / eventTags 不是数组时丢弃整条链', () => {
    for (const field of ['enemies', 'eventTags'] as const) {
      const a = useAdventureStore()
      const w = mortalWorld()
      const chain = w.chain as Array<Record<string, unknown>>
      chain[0]![field] = 'not-an-array'
      a.setMortalWorld(w as never)
      a.sanitize()
      expect(a.mortalWorld, `${field} 不是数组应判为无效世界`).toBeNull()
    }
  })

  it('nodes 里的非字符串元素被清洗,但节点本身保留', () => {
    const a = useAdventureStore()
    const w = mortalWorld()
    const chain = w.chain as Array<Record<string, unknown>>
    chain[0]!.enemies = ['e1', 42, null, 'e2']
    chain[0]!.eventTags = ['herb', {}, 'ore']
    a.setMortalWorld(w as never)
    a.sanitize()
    expect(a.mortalWorld).not.toBeNull()
    expect(a.mortalWorld!.chain[0]!.enemies).toEqual(['e1', 'e2'])
    expect(a.mortalWorld!.chain[0]!.eventTags).toEqual(['herb', 'ore'])
  })

  it('seed 不是有限数时回落到 0,世界本身仍保留', () => {
    const a = useAdventureStore()
    a.setMortalWorld(mortalWorld({ seed: Number.NaN }) as never)
    a.sanitize()
    expect(a.mortalWorld).not.toBeNull()
    expect(a.mortalWorld!.seed).toBe(0)
  })

  it('世界被丢弃后,mortalCleared 里的通关记录仍在(sanitize 不清进度)', () => {
    const a = useAdventureStore()
    // 顺序要紧:setMortalWorld 会把 mortalCleared 清空(换世界即重置进度),
    // 所以先立世界、再记进度、最后 sanitize —— 要验的是 sanitize 这一步不抹掉进度。
    a.setMortalWorld(mortalWorld() as never)
    a.mortalCleared = ['n1']
    a.setMortalWorld(mortalWorld({ chain: [] }) as never) // 坏世界,但 setMortalWorld 已先清进度
    a.mortalCleared = ['n1'] // 直接置位,模拟「坏档里同时有坏世界与进度」
    a.sanitize()
    expect(a.mortalWorld, '坏世界应被丢弃').toBeNull()
    expect(a.mortalCleared, 'sanitize 只管结构自愈,不该顺手清掉玩家的通关进度').toContain('n1')
  })

  it('换世界会重置本世进度:setMortalWorld 有意清空 mortalCleared', () => {
    const a = useAdventureStore()
    a.setMortalWorld(mortalWorld() as never)
    a.markNodeCleared('n1')
    expect(a.mortalCleared).toContain('n1')
    a.setMortalWorld(mortalWorld({ ruleId: 'r2' }) as never)
    expect(a.mortalCleared, '换了世界,旧世界的通关记录就不该再算数').toEqual([])
  })
})

/**
 * 战报数值的量级守卫。
 *
 * sanitizeSideStats 原先直接 `gn(r[key])`,而 gn 只规范化 m、不限制 e:
 * 坏档写下 { m: 1, e: 1e9 } 后,战报页会把总输出/总承伤印成「1.00e1000000000」。
 * 现已改走 asBoundedGNum,与 asPrice 同一条界。
 */
describe('战报数值 · 坏档量级', () => {
  function side(gnum: unknown) {
    return {
      dealt: gnum,
      taken: gnum,
      healed: gnum,
      shieldAbsorbed: gnum,
      biggestHitTaken: gnum,
      pierceTaken: gnum,
      hitsLanded: 0,
      missedHits: 0,
      crits: 0,
      combos: 0,
      counters: 0,
      skillCasts: 0,
      artifactProcs: 0
    }
  }

  function withStats(gnum: unknown) {
    const a = useAdventureStore()
    a.lastBattle = {
      enemyName: '试敌',
      enemyIcon: 'sword',
      result: { win: true, log: [], stats: { player: side(gnum), enemy: side(gnum) } }
    } as never
    a.sanitize()
    return (a.lastBattle as { result?: { stats?: { player?: unknown } } } | null)?.result?.stats?.player as
      | { dealt: never; taken: never }
      | undefined
  }

  it('指数越界的战报数值归零(不再印出 1.00e1000000000)', () => {
    const st = withStats({ m: 1, e: 1e9 })
    expect(st, '坏档不该让整份战报丢掉').toBeDefined()
    expect(formatGN(st!.dealt)).toBe('0')
    expect(formatGN(st!.taken)).toBe('0')
  })

  it('正常战报数值原样保留(修形非空转)', () => {
    const st = withStats({ m: 1.5, e: 5 })
    expect(st).toBeDefined()
    expect(formatGN(st!.dealt)).not.toBe('0')
    expect(formatGN(st!.dealt)).not.toContain('e+')
  })

  it('形状坏的单项归零,不影响同侧其它项', () => {
    const a = useAdventureStore()
    const mixed = { ...side({ m: 1, e: 1e9 }), taken: { m: 2, e: 3 } }
    a.lastBattle = {
      enemyName: '试敌',
      enemyIcon: 'sword',
      result: { win: true, log: [], stats: { player: mixed, enemy: mixed } }
    } as never
    a.sanitize()
    const st = a.lastBattle as unknown as { result: { stats: { player: { dealt: never; taken: never } } } }
    expect(formatGN(st.result.stats.player.dealt)).toBe('0')
    expect(formatGN(st.result.stats.player.taken)).not.toBe('0')
  })
})
})
