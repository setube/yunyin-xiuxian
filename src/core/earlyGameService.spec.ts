import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useCultivationStore } from '@/stores/cultivation'
import { useAdventureStore } from '@/stores/adventure'
import { gn, gnZero, toNum } from '@/utils/gnum'
import { todayLocalNum } from '@/utils/time'
import {
  dismissCaveEvent,
  dismissEnlightenment,
  getCurrentCaveEvent,
  getCurrentEnlightenment,
  mayTriggerCaveEvent,
  mayTriggerEnlightenment,
  recordWin,
  recordLoss,
  prepareBreakthrough,
  breakthroughPrepState,
  consumeBreakthroughPrep,
  startRetreat,
  isRetreating,
  getRetreatRemainingSec
} from './earlyGameService'
import { BREAKTHROUGH_PREP_OPTIONS } from '@/data/earlyGame'

describe('洞府巡游(Phase 28)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('当日已巡游后不再触发', () => {
    const player = usePlayerStore()
    const today = todayLocalNum()
    player.markCaveEventToday(today)
    expect(mayTriggerCaveEvent()).toBeNull()
  })

  it('触发后 getCurrentCaveEvent 能取到,离开则清除并占用今日', () => {
    const player = usePlayerStore()
    const ev = mayTriggerCaveEvent()
    expect(ev).not.toBeNull()
    expect(getCurrentCaveEvent()).not.toBeNull()

    const today = todayLocalNum()
    dismissCaveEvent()
    // 模块态清空
    expect(getCurrentCaveEvent()).toBeNull()
    // 离开占用今日:轮询再也不会掷一个新事件出来
    expect(player.lastCaveEventDay).toBe(today)
    expect(mayTriggerCaveEvent()).toBeNull()
  })
})

describe('悟道顿悟(Phase 28)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('忽略后模块态清空,getCurrentEnlightenment 取不到', () => {
    // 8% 概率 + 5 分钟冷却,直接触发一次
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    mayTriggerEnlightenment()
    const ev = getCurrentEnlightenment()
    expect(ev).not.toBeNull()

    dismissEnlightenment()
    expect(getCurrentEnlightenment()).toBeNull()
    vi.restoreAllMocks()
  })

  it('冷却随档:重开页面刷不出顿悟(Phase 34.6)', () => {
    // 顿悟给悟道点(真货币),冷却若挂模块,刷新一次就等于清掉 5 分钟闸门
    vi.spyOn(Math, 'random').mockReturnValue(0.001)
    mayTriggerEnlightenment()
    const player = usePlayerStore()
    const firstAt = player.enlightenmentAt
    expect(firstAt, '触发后应记下时刻').toBeGreaterThan(0)

    // 写盘取的就是这份 $state —— 冷却必须在这里面
    const persisted = JSON.parse(JSON.stringify(player.$state)) as { enlightenmentAt?: number }
    expect(persisted.enlightenmentAt).toBe(firstAt)

    // 模拟刷新:新进程 + 把写盘的档灌回去,再试一次 —— 冷却未过,不该再给
    setActivePinia(createPinia())
    const reloaded = usePlayerStore()
    reloaded.$patch({ enlightenmentAt: persisted.enlightenmentAt as never })
    dismissEnlightenment()
    mayTriggerEnlightenment()
    expect(getCurrentEnlightenment(), '刷新后冷却被清掉了,可以刷顿悟').toBeNull()
    expect(reloaded.enlightenmentAt).toBe(firstAt)
    vi.restoreAllMocks()
  })
})

describe('连胜(Phase 28 · 曾经无调用方,TASK-022 接线后)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('第 3/5/10 连胜发放对应奖励,中间档不发', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.initCharacter('连胜测试', { roots: [] } as never)

    player.winStreak = 2
    recordWin()
    expect(player.winStreak).toBe(3)
    expect(toNum(resources.spiritStone)).toBe(20)
    expect(resources.wudao).toBe(1)

    recordWin() // 4:非奖励档
    expect(player.winStreak).toBe(4)
    expect(toNum(resources.spiritStone)).toBe(20)

    player.winStreak = 4
    recordWin() // 5
    expect(toNum(resources.spiritStone)).toBe(60)
    expect(resources.wudao).toBe(3)

    player.winStreak = 9
    recordWin() // 10
    expect(toNum(resources.spiritStone)).toBe(160)
    expect(resources.wudao).toBe(8)
  })

  it('败北重置连胜', () => {
    const player = usePlayerStore()
    player.initCharacter('连胜测试', { roots: [] } as never)
    player.winStreak = 7
    recordLoss()
    expect(player.winStreak).toBe(0)
  })
})

describe('突破准备(Phase 28 · TASK-023 接线后)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    consumeBreakthroughPrep() // 兜底清态;准备态自 Phase 34.6 起随 pinia 隔离
  })

  it('静坐调息:开始为坐定态,3 分钟完转为就绪,+8% 一次性可取', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      expect(prepareBreakthrough('meditate')).toBe(true)

      let s = breakthroughPrepState()
      expect(s.sitting).toBe(true)
      expect(s.ready).toBe(false)
      expect(s.remainingSec).toBe(180)
      // 坐定未完,突破无加成可取,且不耗准备
      expect(consumeBreakthroughPrep()).toBe(0)
      expect(s.sitting).toBe(true)

      vi.advanceTimersByTime(181_000)
      s = breakthroughPrepState()
      expect(s.sitting).toBe(false)
      expect(s.ready).toBe(true)
      expect(s.bonus).toBeCloseTo(0.08)

      expect(consumeBreakthroughPrep()).toBeCloseTo(0.08)
      // 一次性:取过即空
      expect(consumeBreakthroughPrep()).toBe(0)
      expect(breakthroughPrepState().ready).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('服聚气丹:支付 80 灵石立即可取 +5%;灵石不足则拒绝', () => {
    const resources = useResourcesStore()
    resources.addStone(gn(100))

    expect(prepareBreakthrough('pill')).toBe(true)
    // GNum 减法在整数量级有浮点尾噪(19.9999…),显示层 formatGN 已兜底,断言取容差
    expect(toNum(resources.spiritStone)).toBeCloseTo(20)
    expect(breakthroughPrepState().ready).toBe(true)
    expect(breakthroughPrepState().bonus).toBeCloseTo(0.05)
    expect(consumeBreakthroughPrep()).toBeCloseTo(0.05)

    // 灵石不足:拒绝且不动加成
    resources.$patch({ spiritStone: gn(10) })
    expect(prepareBreakthrough('pill')).toBe(false)
    expect(breakthroughPrepState().ready).toBe(false)
  })

  it('付费的一次性加成存进档:刷新页面不吞玩家的 80 灵石(Phase 34.6)', () => {
    const resources = useResourcesStore()
    resources.addStone(gn(100))
    expect(prepareBreakthrough('pill')).toBe(true)

    // ① 状态在 store 上 —— 存档写盘取的就是这份 $state
    const persisted = JSON.parse(JSON.stringify(usePlayerStore().$state)) as { breakthroughPrep?: unknown }
    expect(persisted.breakthroughPrep, '准备态没进 store,刷新必丢').toBeTruthy()

    // ② 重开一局(新 pinia = 重新载入进程),把写盘的那份灌回来 → 加成仍在
    setActivePinia(createPinia())
    const reloaded = usePlayerStore()
    reloaded.$patch({ breakthroughPrep: persisted.breakthroughPrep as never })
    const s = breakthroughPrepState()
    expect(s.ready).toBe(true)
    expect(s.bonus).toBeCloseTo(BREAKTHROUGH_PREP_OPTIONS.find(o => o.id === 'pill')!.bonusRate)
    // ③ 仍是一次性的:取过即空
    expect(consumeBreakthroughPrep()).toBeCloseTo(0.05)
    expect(breakthroughPrepState().ready).toBe(false)
  })

  it('转世不带突破准备:新的一世要重新备(与卦同理)', () => {
    const resources = useResourcesStore()
    resources.addStone(gn(100))
    prepareBreakthrough('pill')
    const player = usePlayerStore()
    expect(player.breakthroughPrep).not.toBeNull()
    player.rebirth(player.linggen!)
    expect(player.breakthroughPrep).toBeNull()
  })
})

describe('突破准备数据源(BREAKTHROUGH_PREP_OPTIONS · TASK-029 接线后)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    consumeBreakthroughPrep()
  })

  it('备选数值与数据表一致:加成/时长/药价读数据,不硬编码', () => {
    const meditate = BREAKTHROUGH_PREP_OPTIONS.find(o => o.id === 'meditate')!
    const pill = BREAKTHROUGH_PREP_OPTIONS.find(o => o.id === 'pill')!
    const pillCost = pill.cost?.stone ?? 0
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      prepareBreakthrough('meditate')
      // 坐满数据表里的时长后,加成 = 数据表 bonusRate(不再是某处硬编码的 0.08)
      vi.advanceTimersByTime(meditate.duration * 1000 + 1000)
      expect(breakthroughPrepState().bonus).toBeCloseTo(meditate.bonusRate)
      expect(consumeBreakthroughPrep()).toBeCloseTo(meditate.bonusRate)

      // 聚气丹:药价与加成都来自数据表
      const resources = useResourcesStore()
      resources.addStone(gn(pillCost + 1))
      expect(prepareBreakthrough('pill')).toBe(true)
      expect(toNum(resources.spiritStone)).toBeCloseTo(1)
      expect(breakthroughPrepState().bonus).toBeCloseTo(pill.bonusRate)
      expect(consumeBreakthroughPrep()).toBeCloseTo(pill.bonusRate)
    } finally {
      vi.useRealTimers()
    }
  })

  it('direct(直接突破)不是准备动作:不产生加成,也不报错', () => {
    expect(BREAKTHROUGH_PREP_OPTIONS.some(o => o.id === 'direct')).toBe(true)
    expect(prepareBreakthrough('direct')).toBe(false)
    expect(breakthroughPrepState().ready).toBe(false)
  })
})

describe('前期事件衰减(EARLY_EVENT_DECAY · TASK-028 接线后)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // 顿悟的 5 分钟冷却 Phase 34.6 起存在 player store(随档),不再跨用例泄漏 ——
  // 每个用例一个新 pinia 即天然隔离,这几条不必再按触发/不触发排序。
  // (遗留的 enlightenmentEvent 仍是模块态:它只是"当下的弹窗",重开即无,不影响频次。)
  it('真仙后顿悟完全退出(衰减 0)', () => {
    const player = usePlayerStore()
    player.major = 5
    const realNow = Date.now()
    vi.useFakeTimers()
    try {
      vi.setSystemTime(realNow + 600_000) // 越过 5 分钟冷却(新档该栏为 0),只测衰减
      vi.spyOn(Math, 'random').mockReturnValue(0.001) // 即使随机数最小也不该触发
      mayTriggerEnlightenment()
      expect(getCurrentEnlightenment()).toBeNull()
      vi.restoreAllMocks()
    } finally {
      vi.useRealTimers()
    }
  })

  it('金丹(境界2)顿悟触发率按曲线 0.35 收窄:高随机数不再触发', () => {
    const player = usePlayerStore()
    player.major = 2
    const realNow = Date.now()
    vi.useFakeTimers()
    try {
      vi.setSystemTime(realNow + 600_000)
      vi.spyOn(Math, 'random').mockReturnValue(0.9) // 0.9 > 0.08×0.35
      mayTriggerEnlightenment()
      expect(getCurrentEnlightenment()).toBeNull()
      vi.restoreAllMocks()
    } finally {
      vi.useRealTimers()
    }
  })

  it('元婴后洞府巡游退出,不占用当日', () => {
    const player = usePlayerStore()
    player.major = 3 // cavePatrol.yuanying = 0
    expect(mayTriggerCaveEvent()).toBeNull()
    expect(player.lastCaveEventDay).toBe(0)
  })

  it('金丹巡游存在感 0.25:掷败则今日让位(不反复重掷)', () => {
    const player = usePlayerStore()
    player.major = 2
    const today = todayLocalNum()
    vi.spyOn(Math, 'random').mockReturnValue(0.9) // 0.9 > 0.25 → 今日让位
    expect(mayTriggerCaveEvent()).toBeNull()
    expect(player.lastCaveEventDay).toBe(today)
    vi.restoreAllMocks()
  })

  // 低随机数在金丹仍可触发(0.08×0.35 之上);触发会写入 store 的顿悟冷却
  it('低随机数在金丹仍可触发(0.08×0.35 之上)', () => {
    const player = usePlayerStore()
    player.major = 2
    const realNow = Date.now()
    vi.useFakeTimers()
    try {
      vi.setSystemTime(realNow + 600_000)
      vi.spyOn(Math, 'random').mockReturnValue(0.001) // 0.001 ≤ 0.028 → 触发
      mayTriggerEnlightenment()
      expect(getCurrentEnlightenment()).not.toBeNull()
      vi.restoreAllMocks()
    } finally {
      vi.useRealTimers()
    }
  })

  it('金丹巡游存在感 0.25:掷中则在当日出现', () => {
    const player = usePlayerStore()
    player.major = 2
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // 0.1 ≤ 0.25 → 触发
    expect(mayTriggerCaveEvent()).not.toBeNull()
    vi.restoreAllMocks()
  })
})

describe('闭关(Phase 28 · 接线后:buff 注册/互斥守卫/buff 到期)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('startRetreat 注册 5 分钟闭关 buff,isRetreating 为真,剩余 300 秒', () => {
    // 冻实 Date.now():getRetreatRemainingSec = ceil((endsAt - now)/1000) 是真实时钟秒界,
    // 并行重载下 startRetreat 到断言间只要跨整秒就偶发 299（重复跑又复现不了)——
    // 冻时让两处读到同一时刻,剩余恒为 300（与突破准备/静坐同款做法）。
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      expect(startRetreat()).toBe(true)
      const cult = useCultivationStore()
      expect(cult.hasBuff('retreat')).toBe(true)
      expect(isRetreating()).toBe(true)
      expect(getRetreatRemainingSec()).toBe(300)
    } finally {
      vi.useRealTimers()
    }
  })

  it('已在闭关时再次调用幂等返回 false,不刷新时长', () => {
    startRetreat()
    const cult = useCultivationStore()
    const endsAtBefore = cult.buffs.find(b => b.defId === 'retreat')!.endsAt
    expect(startRetreat()).toBe(false)
    expect(cult.buffs.find(b => b.defId === 'retreat')!.endsAt).toBe(endsAtBefore)
  })

  it('历练途中不可闭关(互斥守卫,拒绝原因显式而非静默)', () => {
    const now = Date.now()
    useAdventureStore().setSession({
      regionId: 'qingyun',
      mode: 'normal',
      startedAt: now,
      endsAt: now + 60000,
      nextBattleAt: now + 1000,
      wins: 0,
      losses: 0,
      events: 0,
      stoneGain: gnZero(),
      expGain: gnZero(),
      itemGain: 0
    })
    expect(startRetreat()).toBe(false)
    expect(useCultivationStore().hasBuff('retreat')).toBe(false)
  })

  it('闭关 buff 到期后 isRetreating 转假、剩余秒数归零(持久化 buff 为唯一真相源)', () => {
    startRetreat()
    const cult = useCultivationStore()
    // 模拟 5 分钟流逝:pruneBuffs 正是 engine 每帧清理过期 buff 的那一步
    expect(cult.pruneBuffs(Date.now() + 301_000)).toBe(true)
    expect(cult.hasBuff('retreat')).toBe(false)
    expect(isRetreating()).toBe(false)
    expect(getRetreatRemainingSec()).toBe(0)
  })
})
