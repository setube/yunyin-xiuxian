import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { formatGN } from '@/utils/format'
import { buffDef } from '@/data/buffs'
import { CULT_BASE_SPEED, CULT_SPEED_SOFT_CAP_T, LIFESPAN_CRITICAL_RATIO } from '@/data/constants'
import { baseCultPerSec } from './formulas'
import {
  checkAchievements,
  retreatGainText,
  retreatGainedText,
  checkStateAchievements,
  retreatMarginalSpeed,
  rolloverDailyIfNeeded
} from './progress'
import { todayStr } from '@/utils/time'
import { DAILY_TASKS } from '@/data/quests'
import { useQuestsStore } from '@/stores/quests'
import { useResourcesStore } from '@/stores/resources'
import { ACHIEVEMENTS } from '@/data/achievements'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** 闭关预览「约多得修为 X」:与修炼行同读 baseCultPerSec,时长与加成取自 buffs.ts 的 retreat 本体 */
describe('retreatGainText 闭关约多得预览', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('炼气初成:值 = CULT_BASE_SPEED ×1.5×300(写死算一遍,不镜像实现)', () => {
    const player = usePlayerStore()
    expect(baseCultPerSec(player.major, player.sub)).toBeCloseTo(CULT_BASE_SPEED, 6)
    const expected = CULT_BASE_SPEED * 1.5 * 300 // 585
    expect(retreatGainText()).toBe(`约多得修为 ${formatGN(expected)}`)
  })

  it('加成翻倍 → 预览翻倍(buff 本体改,这里的数也线性跟)', () => {
    const player = usePlayerStore()
    const baseline = baseCultPerSec(player.major, player.sub)

    const def = buffDef('retreat')!
    const boost = def.mods.cultivationSpeed ?? 0
    const expected = baseline * boost * def.durationSec
    expect(retreatGainText()).toBe(`约多得修为 ${formatGN(expected)}`)

    const doubled = baseline * (boost * 2) * def.durationSec
    expect(formatGN(doubled)).toBe(formatGN(expected * 2))
  })

  it('境界抬升 → 预览随 base 抬升(非写死一个数)', () => {
    const player = usePlayerStore()
    const lo = baseCultPerSec(player.major, player.sub)
    player.major = 2
    const hi = baseCultPerSec(player.major, player.sub)
    expect(hi).toBeGreaterThan(lo)
    expect(retreatGainText()).toBe(`约多得修为 ${formatGN(hi * 1.5 * 300)}`)
  })

  it('闭关中的活数:过半 → 恰为全长的一半(同一速率,只差已走时长)', () => {
    const player = usePlayerStore()
    const perSec = baseCultPerSec(player.major, player.sub) * 1.5
    const half = perSec * 150
    const full = perSec * 300
    expect(retreatGainedText(150)).toBe(`已多得修为 ${formatGN(half)}`)
    expect(full).toBeCloseTo(half * 2, 6)
  })

  it('闭关中的活数:未起步(0 秒)→ 空白,不报「已多得 0」', () => {
    expect(retreatGainedText(0)).toBe('')
  })
})

/**
 * 成就周期补扫:realm/counter 成就只在 track()/trackRealm() 时求值;
 * checkStateAchievements 须重放 checkAchievements,老档/导入档越境后低境界成就才会解锁。
 */
describe('成就周期补扫应治愈「越境未解锁」', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('境界已拉高、从未 track 过,checkStateAchievements 也应补发低境界成就', () => {
    const player = usePlayerStore()
    const quests = useQuestsStore()
    player.$patch({ major: 12 })
    expect(quests.hasAchieved('a_r1'), '前置于未补扫时应是锁着的(红->绿)').toBe(false)
    checkStateAchievements()
    expect(quests.hasAchieved('a_r1'), '筑基境成就应被周期补扫解锁').toBe(true)
    expect(quests.hasAchieved('a_r5'), '炼虚境成就应补发').toBe(true)
    expect(quests.hasAchieved('a_r9'), '渡劫/真仙成就应补发').toBe(true)
    expect(quests.hasAchieved('a_r12'), '太乙境成就应补发').toBe(true)
  })
})

describe('主线任务同根补扫也应推进', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('境界已过出生任务、未再 track,checkStateAchievements 也应推进主线', () => {
    const player = usePlayerStore()
    const quests = useQuestsStore()
    expect(quests.mainIdx).toBe(0)
    player.$patch({ major: 1 }) // 出生任务 realm_0_2(炼气二层)已满足
    checkStateAchievements()
    expect(quests.mainIdx, '出生任务应被补扫完成并把主线前推一步').toBe(1)
  })
})

describe('retreatMarginalSpeed 闭关边际(修炼速度软上限)', () => {
  it('低于阈:按全额加成报(预览与修炼行同口径)', () => {
    expect(retreatMarginalSpeed(0, 1.5)).toBeCloseTo(1.5, 6)
    expect(retreatMarginalSpeed(1.0, 1.5)).toBeCloseTo(1.5, 6)
  })

  it('越阈:越出部分按 CULT_SPEED_SOFT_CAP_DIMINISH 折算,不再全按 1.5 报', () => {
    // 5.9 反解无封顶 = 6.8;+1.5 = 8.3;再封 = 6.65;净增量 = 0.75
    expect(retreatMarginalSpeed(5.9, 1.5)).toBeCloseTo(0.75, 6)
    // 恰在阈上:1.5 全按半价
    expect(retreatMarginalSpeed(CULT_SPEED_SOFT_CAP_T, 1.5)).toBeCloseTo(0.75, 6)
  })

/**
 * 成就条件的分工契约。
 *
 * 三条判定路径各管一类,任何一类没人管,那条成就就**永远不会解锁**,而且不报错:
 *   checkAchievements      :counter / realm,以及 custom 里的 realm_<major>_<sub>
 *   checkQualityAchievement:quality(获得装备时显式调用)
 *   checkStateAchievements :custom 里的状态型键,按 key 逐个触发
 *
 * 上面第三条是硬编码的键名清单。新增一条 custom 成就却忘了在 checkStateAchievements
 * 里加触发,它就沉默失效 —— 这条把「每个 custom key 都有归处」钉住。
 */
describe('成就条件 · 每条都有判定路径', () => {
  const SRC = readFileSync(resolve(__dirname, 'progress.ts'), 'utf-8')
  // 每条用例开新 pinia:下面的行为判据会改 age / spiritStone / 已解锁集合,
  // 共享实例会让前一条的后果污染后一条(实测:寿元那条跑了之后,灵石那条就红)
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('custom 型的 key 只有 realm_x_y 与状态型两种,realm 型走正则,其余须在 checkStateAchievements 里出现', () => {
    const customKeys = [
      ...new Set(
        ACHIEVEMENTS.filter(a => a.cond.type === 'custom').map(a => (a.cond as { key: string }).key)
      )
    ]
    expect(customKeys.length, '没有 custom 成就,说明结构变了').toBeGreaterThan(0)
    for (const key of customKeys) {
      if (/^realm_\d+_\d+$/.test(key)) continue
      // 状态型:progress.ts 里必须有 checkCustomAchievement('key') 这样的触发点
      expect(SRC, `custom key「${key}」在 checkStateAchievements 里没有触发点,该成就永远不会解锁`).toContain(
        `checkCustomAchievement('${key}')`
      )
    }
  })

  /**
   * 三个状态型自定义成就的**触发条件**本身也要钉住。
   *
   * 上面那条只查 `checkCustomAchievement('lifespanLow')` 这个字符串在不在源码里 ——
   * 把条件写成反的(`<=` 改成 `>=`),字符串一字不差,那条照样绿。
   * 实测过:改成 `lifespanRatio >= LIFESPAN_CRITICAL_RATIO` 后整个 progress.spec 全绿,
   * 而那样「寿元将尽」会在健康角色身上解锁、真告急时反而不解锁。
   *
   * 这里走行为:造出临界内 / 外的状态,调 checkStateAchievements,看成就有没有该解锁。
   * 故障注入:把寿元条件方向改反,本条红。
   */
  /**
   * 职责边界:`checkAchievements` 不许越界去解锁状态型成就。
   *
   * 状态型(lifespanLow / lifespan10k / stone1m)只由 `checkStateAchievements` 负责 ——
   * 它挂在那几个「状态变了」的时刻。若 `checkAchievements` 也判它们,每次 track()
   * 都会重复扫一遍这三条,且两条路径的触发时机不一致时会出现「成就自己冒出来」。
   * 注:第 112 行那句正则跳过去掉后本条**仍是绿的** —— 因为 `evalCond` 对非 realm_x_y 的
   * custom 一律返回 false(第 91 行),那是第二道保护。所以那句跳过是省迭代的性能写法,
   * 不是正确性守卫。本条钉的是「谁来解锁」这个分工,不是「删了会崩」。
   */
  it('checkAchievements 不碰状态型成就(只由 checkStateAchievements 负责)', () => {
    const player = usePlayerStore()
    const quests = useQuestsStore()
    const resources = useResourcesStore()
    // 把两个状态型成就的条件都造满,但不调 checkStateAchievements
    player.age = Math.floor(player.lifespanMax * 0.95)
    resources.spiritStone = { m: 1, e: 7 }
    expect(player.lifespanRatio, '探针前提:寿元该已跌破一成').toBeLessThanOrEqual(LIFESPAN_CRITICAL_RATIO)

    checkAchievements()
    expect(quests.hasAchieved('a_lifelow'), 'checkAchievements 越界解锁了寿元成就').toBe(false)
    expect(quests.hasAchieved('a_rich'), 'checkAchievements 越界解锁了灵石成就').toBe(false)

    // 换成正确的入口,两条都该解锁
    checkStateAchievements()
    expect(quests.hasAchieved('a_lifelow'), 'checkStateAchievements 该解锁寿元成就').toBe(true)
    expect(quests.hasAchieved('a_rich'), 'checkStateAchievements 该解锁灵石成就').toBe(true)
  })

  it('寿元告急:只有真跌破一成才解锁「寿元将尽」', () => {
    const player = usePlayerStore()
    const quests = useQuestsStore()
    // 寿元健康:ratio 明显 > 临界值
    player.age = 10
    expect(player.lifespanRatio, '探针前提:健康时该远高于临界').toBeGreaterThan(LIFESPAN_CRITICAL_RATIO)
    checkStateAchievements()
    expect(quests.hasAchieved('a_lifelow'), '寿元健康不该解锁「寿元将尽」').toBe(false)

    // 跌进临界:age 推到寿命上限的 95%
    player.age = Math.floor(player.lifespanMax * 0.95)
    expect(player.lifespanRatio, '探针前提:此时该低于临界').toBeLessThanOrEqual(LIFESPAN_CRITICAL_RATIO)
    checkStateAchievements()
    expect(quests.hasAchieved('a_lifelow'), '跌破一成该解锁「寿元将尽」').toBe(true)
  })

  it('灵石百万:只有真到一百万才解锁「富可敌国」', () => {
    const resources = useResourcesStore()
    const quests = useQuestsStore()
    resources.spiritStone = { m: 9.9, e: 5 }   // 99 万,差一点
    checkStateAchievements()
    expect(quests.hasAchieved('a_rich'), '不到一百万不该解锁').toBe(false)
    resources.spiritStone = { m: 1, e: 6 }     // 正好一百万
    checkStateAchievements()
    expect(quests.hasAchieved('a_rich'), '到一百万该解锁').toBe(true)
  })

  it('quality 型由 checkQualityAchievement 负责,不进 checkAchievements 的循环', () => {
    const quality = ACHIEVEMENTS.filter(a => a.cond.type === 'quality')
    expect(quality.length).toBeGreaterThan(0)
    // checkAchievements 里明确跳过 quality
    expect(SRC).toContain("if (def.cond.type === 'quality') continue")
  })

  it('counter / realm 型不依赖任何额外触发点(evalCond 直接判)', () => {
    const direct = ACHIEVEMENTS.filter(a => a.cond.type === 'counter' || a.cond.type === 'realm')
    expect(direct.length, '没有直接判定的成就,说明结构变了').toBeGreaterThan(0)
  })

  /**
   * `evalCond` 的 switch 必须覆盖 `AchvCond` 的每一种类型。
   *
   * 那是个没有 default 的 switch,而函数声明返回 `boolean` —— 漏一个 case 时实际返回
   * `undefined`,于是**该类型的成就永远不解锁,且不报错**(undefined 是假值,判据静默为假)。
   * 类型检查拦不住:给 `AchvCond` 加一条并集分支时,switch 不加 case 照样编译过。
   *
   * 上面几条判据查的是数据侧(哪些成就走哪条路),没有一条盯着分发表本身。
   * 故障注入:往 AchvCond 加一条 `| { type: 'foo' }` 而不加 case,本条红。
   */
  it('evalCond 的分支与 AchvCond 的类型定义同步', () => {
    const engine = readFileSync(resolve(__dirname, 'progress.ts'), 'utf-8')
    const types = readFileSync(resolve(__dirname, '../types/index.ts'), 'utf-8')
    const body = /switch \(cond\.type\) \{([\s\S]*?)\n  \}/.exec(engine)?.[1]
    expect(body, '找不到 evalCond 的 switch,判据会空转').toBeTruthy()
    const cases = [...new Set([...body!.matchAll(/case '([a-z]+)'/g)].map(m => m[1]!))].sort()
    const kinds = [
      ...new Set([...(/export type AchvCond =([\s\S]*?)\n\n/.exec(types)?.[1] ?? '').matchAll(/type: '([a-z]+)'/g)].map(m => m[1]!))
    ].sort()
    expect(cases.length, '没解析到 case,判据失去意义').toBeGreaterThan(2)
    expect(kinds.length, '没解析到类型,判据失去意义').toBeGreaterThan(2)
    expect(cases, '有成就类型没有对应分支(该类型成就永不解锁)').toEqual(kinds)
  })

  it('三类路径合起来覆盖全部成就,没有无主条目', () => {
    const kinds = new Set(ACHIEVEMENTS.map(a => a.cond.type))
    for (const k of kinds) {
      expect(['counter', 'realm', 'custom', 'quality'], `出现了未登记的条件类型 ${k},需在 progress.ts 里接上判定路径`).toContain(k)
    }
  })
})
})

/**
 * 换日守卫:同一天重复调用不能把当日进度清掉。
 *
 * `rolloverDaily(date)` 会整块替换 `daily` —— 连 `done` 一起清空。
 * 而 `rolloverDailyIfNeeded` 被 engine 在每次启动与换日时调用,
 * 守卫(`daily.date !== today`)一旦失效,玩家同一天里反复丢日课进度,且没有任何报错。
 */
describe('日课 · 换日守卫', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('同一天再调一次:当日已完成项不被清掉', () => {
    const quests = useQuestsStore()
    const today = todayStr()
    quests.rolloverDaily(today)
    quests.markDailyDone(DAILY_TASKS[0]!.id)
    const doneBefore = [...quests.daily.done]

    rolloverDailyIfNeeded()   // 同一天

    expect(quests.daily.done, '同一天不该重置日课').toEqual(doneBefore)
    expect(quests.daily.date).toBe(today)
  })

  it('日期变了才重置,且新的 base 取当下计数', () => {
    const quests = useQuestsStore()
    quests.rolloverDaily('1999-01-01')       // 假装是上个世纪
    quests.markDailyDone(DAILY_TASKS[0]!.id)
    quests.inc('battles', 5)

    rolloverDailyIfNeeded()

    expect(quests.daily.date, '该换到今天的日期').toBe(todayStr())
    expect(quests.daily.done, '换日后已完成项该清空').toEqual([])
    expect(quests.daily.base.battles ?? 0, '新的 base 要取当下计数(增量从零开始)').toBe(5)
  })
})
