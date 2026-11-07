import { EVENTS, FORTUNE_EVENTS } from '@/data/events'
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
  })

  /**
   * 事件记忆要有上界。
   *
   * 写入路径(markEventSeen)有 `eventDef(id)` 这道闸,读档路径原先只有去重 ——
   * 手改存档能塞进任意多条,实测 10 万条后 $state 序列化出来 1.49MB,存档顶到配额。
   * 上界取事件目录规模的两倍:够容纳「改名/下线旧档」的残留,又远小于恶意膨胀量级。
   */
  it('读档时事件记忆截到目录规模的两倍以内', () => {
    const a = useAdventureStore()
    ;(a as unknown as { seenOnceEvents: unknown }).seenOnceEvents = Array.from({ length: 100000 }, (_, i) => `evt_${i}`)
    a.sanitize()
    const cap = (EVENTS.length + FORTUNE_EVENTS.length) * 2
    expect(a.seenOnceEvents.length, `读档后 ${a.seenOnceEvents.length} 条超了上界 ${cap}`).toBeLessThanOrEqual(cap)
    expect(JSON.stringify(a.$state).length, '坏档把 state 撑爆了').toBeLessThan(5000)
  })

  /**
   * unlocked / cleared 也要按区域目录过滤。
   *
   * 同函数里 revived 与 clearedAt 早就这么做了,只有这两个只做了去重 ——
   * 手改存档塞 10 万条假 id 后 $state 到 1.98MB / 989KB。
   * 这里可以安全过滤(不像事件记忆要兼容下线内容):区域 id 认得才能用。
   */
  it('读档时把认不得的区域 id 从 unlocked / cleared 里清掉', () => {
    const a = useAdventureStore()
    const fake = Array.from({ length: 100000 }, (_, i) => `fake_${i}`)
    ;(a as unknown as { cleared: unknown }).cleared = fake
    ;(a as unknown as { unlocked: unknown }).unlocked = fake
    a.sanitize()
    expect(a.cleared.length, '认不得的区域 id 不该留在 cleared').toBeLessThan(100)
    expect(a.unlocked.length, '认不得的区域 id 不该留在 unlocked').toBeLessThan(100)
    expect(JSON.stringify(a.$state).length, '坏档把 state 撑爆了').toBeLessThan(10000)
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

  /**
   * enemyId 声明为 `string?`,此前靠 `...b` 原样带过来 —— 坏档塞个数字进来,
   * 类型是否成立没人管。查表本身安全(BY_ID.get 返回 undefined),
   * 但后面任何一处按字符串用它(如 startsWith、拼进 URL)都会当场炸。
   */
  it('战报的 enemyId 非字符串时按缺失处理,不留在状态里', () => {
    const a = useAdventureStore()
    for (const bad of [123, { x: 1 }, [1], true]) {
      a.lastBattle = {
        enemyName: '试敌',
        enemyIcon: 'sword',
        enemyId: bad,
        result: { win: true, log: [] }
      } as never
      a.sanitize()
      const got = (a.lastBattle as { enemyId?: unknown } | null)?.enemyId
      expect(typeof got, `enemyId 塞 ${JSON.stringify(bad)} 后仍是 ${typeof got}`).not.toBe('number')
      expect(got, `enemyId 塞 ${JSON.stringify(bad)} 后该按缺失处理`).toBeUndefined()
    }
  })

  it('正常 enemyId 原样保留(修形非空转)', () => {
    const a = useAdventureStore()
    a.lastBattle = {
      enemyName: '试敌',
      enemyIcon: 'sword',
      enemyId: 'e_wolf',
      result: { win: true, log: [] }
    } as never
    a.sanitize()
    expect((a.lastBattle as { enemyId?: string } | null)?.enemyId, '好档的 enemyId 不该被清掉').toBe('e_wolf')
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

/**
 * 会话收益的量级守卫。
 *
 * sanitize 原先对 stoneGain / expGain 直接调 gn() —— 它只规范化 m、不限 e,
 * 于是坏档写 { m: 1, e: 1e9 } 就能让本世收益显示成「1.00e1000000000」。
 * 这两项是 exploration 每场胜利 add() 的入参,坏 GNum 还会让推进抛错。
 * 现已改走 asBoundedGNum(与 asPrice 同一条界)。
 */
describe('历练会话 · 收益量级', () => {
  function withGain(g: unknown) {
    const a = useAdventureStore()
    a.setSession({
      regionId: 'qingyun',
      mode: 'normal',
      startedAt: 100,
      endsAt: 2000,
      nextBattleAt: 500,
      wins: 0,
      losses: 0,
      events: 0,
      stoneGain: g,
      expGain: g,
      itemGain: 0
    } as never)
    a.sanitize()
    return a.session
  }

  it('指数越界的收益归零(不再印出 1.00e1000000000)', () => {
    const s = withGain({ m: 1, e: 1e9 })
    expect(s, '坏收益不该让整个会话被丢掉').not.toBeNull()
    expect(formatGN(s!.stoneGain)).toBe('0')
    expect(formatGN(s!.expGain)).toBe('0')
  })

  it('正常收益原样保留(修形非空转)', () => {
    const s = withGain({ m: 2, e: 4 })
    expect(s).not.toBeNull()
    expect(formatGN(s!.stoneGain)).toBe('2万')
  })

  it('收益归零后会话本身仍在(玩家还在历练,只是这一世的累计读数被修形)', () => {
    const s = withGain({ m: 1, e: 1e9 })
    expect(s!.regionId).toBe('qingyun')
    expect(s!.endsAt).toBe(2000)
  })
})


/**
 * 凡人界世界规则的修形。
 *
 * `rules` 与虚界的远征规则同源,都会原样进 `resolveCombat`
 * (mortalWorldGen.ts 第 357 行)。此前这里只判了「是不是对象」,内部字段一概收下,
 * 而 `mulN(maxHp, rules.playerStartHpPct ?? 1)` 对 Infinity / NaN 都回 0 ——
 * 坏档写这两个值,玩家一进战斗就满血变空血。
 */
describe('凡人界世界规则 · 坏档字段修形', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('开场气血为 Infinity / NaN / 超范围时都不留成可致死值', () => {
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, -1, 5]) {
      const a = useAdventureStore()
      a.setMortalWorld(mortalWorld({ rules: { playerStartHpPct: bad } }) as never)
      a.sanitize()
      const got = (a.mortalWorld as never as { rules?: { playerStartHpPct?: number } }).rules?.playerStartHpPct
      expect(got === undefined || (got > 0 && got <= 1), `playerStartHpPct=${bad} 修形后仍是 ${got}`).toBe(true)
    }
    // 正常的 0.5 照常保留
    const a = useAdventureStore()
    a.setMortalWorld(mortalWorld({ rules: { playerStartHpPct: 0.5 } }) as never)
    a.sanitize()
    expect((a.mortalWorld as never as { rules?: { playerStartHpPct?: number } }).rules?.playerStartHpPct).toBe(0.5)
  })

  it('maxRounds 为 Infinity 时剔除,否则回合循环失去上界', () => {
    const a = useAdventureStore()
    a.setMortalWorld(mortalWorld({ rules: { maxRounds: Number.POSITIVE_INFINITY } }) as never)
    a.sanitize()
    expect((a.mortalWorld as never as { rules?: { maxRounds?: number } }).rules?.maxRounds).toBeUndefined()
  })

  it('倍率与 perRounds 一并夹回', () => {
    const a = useAdventureStore()
    a.setMortalWorld(
      mortalWorld({
        rules: { playerAtkMult: 1e9, healMult: -5, perRounds: { interval: 0, playerHealPct: 9, playerShieldPct: Number.NaN, enemyAtkGrowth: -2 } }
      }) as never
    )
    a.sanitize()
    const rules = (a.mortalWorld as never as {
      rules?: { playerAtkMult?: number; healMult?: number; perRounds?: { interval: number; playerHealPct: number; playerShieldPct: number; enemyAtkGrowth: number } }
    }).rules
    expect(rules?.playerAtkMult).toBe(100)
    expect(rules?.healMult).toBe(0)
    expect(rules?.perRounds?.interval).toBe(1)
    expect(rules?.perRounds?.playerHealPct).toBe(1)
    expect(rules?.perRounds?.playerShieldPct).toBe(0)
    expect(rules?.perRounds?.enemyAtkGrowth).toBe(0)
  })
})
})
