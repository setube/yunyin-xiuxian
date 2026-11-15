/** 玩家区域统计、奇缘与暂停顺延的公共写入边界 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import type { RegionStats } from '@/core/suppress'
import { MAX_MAJOR } from '@/data/realms'
import { SUB_LEVELS } from '@/data/constants'

function stats(over: Partial<RegionStats> = {}): RegionStats {
  return {
    consecutiveWins: 1,
    totalFights: 2,
    avgRounds: 5,
    avgDamageTakenPct: 0.2,
    lastUpdateAt: 1000,
    ...over
  }
}

describe('玩家区域统计与奇缘公共写入边界', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('区域统计只认真实地界与有限非负战报,坏调用不改旧账', () => {
    const player = usePlayerStore()
    const before = stats()
    player.regionStats = { qingyun: before }

    player.updateRegionStats('ghost', true, 3, 0.1)
    expect(player.regionStats).toEqual({ qingyun: before })

    for (const bad of [NaN, Infinity, -1]) {
      player.updateRegionStats('qingyun', true, bad, 0.1)
      player.updateRegionStats('qingyun', true, 3, bad)
    }
    expect(player.regionStats.qingyun, '坏回合或坏受伤占比不能污染均值').toEqual(before)

    player.updateRegionStats('qingyun', false, 0, 2)
    expect(player.regionStats.qingyun).toMatchObject({ consecutiveWins: 0, totalFights: 3 })
    expect(player.regionStats.qingyun?.avgDamageTakenPct, '受伤占比夹在 0..1').toBeLessThanOrEqual(1)
  })

  it('离线批量净胜只认真实地界与有限非负批量', () => {
    const player = usePlayerStore()
    const before = stats()
    player.regionStats = { qingyun: before }
    player.regionWins = { qingyun: 2 }

    for (const bad of [NaN, Infinity, -1]) player.applyRegionWinBatch('qingyun', bad, 3, 0.1)
    player.applyRegionWinBatch('ghost', 2, 3, 0.1)
    player.applyRegionWinBatch('qingyun', 2, NaN, 0.1)
    player.applyRegionWinBatch('qingyun', 2, 3, Infinity)

    expect(player.regionStats.qingyun).toEqual(before)
    expect(player.regionWins).toEqual({ qingyun: 2 })

    player.applyRegionWinBatch('qingyun', 2, 3, 0.1)
    expect(player.regionStats.qingyun).toMatchObject({ consecutiveWins: 3, totalFights: 4 })
    expect(player.regionWins.qingyun).toBe(4)
  })

  it('镇压与区域胜场只认真实地界', () => {
    const player = usePlayerStore()
    player.suppressRegion('ghost')
    player.markSuppressQualified('ghost')
    player.recordRegionWin('ghost')
    expect(player.suppressedRegions).toEqual([])
    expect(player.suppressQualified).toEqual([])
    expect(player.suppressedSince).toEqual({})
    expect(player.regionWins).toEqual({})

    player.suppressRegion('qingyun')
    player.markSuppressQualified('qingyun')
    player.recordRegionWin('qingyun')
    expect(player.suppressedRegions).toEqual(['qingyun'])
    expect(player.suppressQualified).toEqual(['qingyun'])
    expect(player.suppressedSince.qingyun).toBeGreaterThan(0)
    expect(player.regionWins.qingyun).toBe(1)
  })

  it('奇缘进度只认目录链,阶段夹在 0..链长', () => {
    const player = usePlayerStore()
    player.setEventChain('ghost_chain', 1)
    expect(player.eventChains).toEqual({})

    for (const bad of [NaN, Infinity]) player.setEventChain('old_man_stone', bad)
    expect(player.eventChains, '非有限阶段不写进度').toEqual({})
    player.setEventChain('old_man_stone', -1)
    expect(player.eventChains.old_man_stone, '负阶段夹回 0,与读档修形同口径').toBe(0)

    player.setEventChain('old_man_stone', 99)
    expect(player.eventChains.old_man_stone).toBe(3)
    player.setEventChain('old_man_stone', 1.8)
    expect(player.eventChains.old_man_stone).toBe(1)
  })

  it('暂停顺延拒绝坏时长,不把在身状态与区域计时写成 NaN', () => {
    const player = usePlayerStore()
    player.divination = {
      hexagram: '乾',
      upper: 'qian',
      lower: 'qian',
      changed: null,
      changing: 0,
      changingAt: [],
      lines: [1, 1, 1, 1, 1, 1],
      castAt: 1000,
      expiresAt: 5000
    }
    player.regionEvent = { regionId: 'qingyun', eventId: 'yaochao', endsAt: 6000 }
    player.breakthroughPrep = { bonus: 0.05, readyAt: 7000, kind: 'pill' }
    player.enlightenmentAt = 8000
    player.suppressedSince = { qingyun: 9000 }
    player.regionStats = { qingyun: stats({ lastUpdateAt: 10000 }) }

    for (const bad of [NaN, Infinity, -Infinity, -1, 0]) player.shiftTimedState(bad)
    expect(player.divination.expiresAt).toBe(5000)
    expect(player.regionEvent.endsAt).toBe(6000)
    expect(player.breakthroughPrep.readyAt).toBe(7000)
    expect(player.enlightenmentAt).toBe(8000)
    expect(player.suppressedSince.qingyun).toBe(9000)
    expect(player.regionStats.qingyun?.lastUpdateAt).toBe(10000)

    player.shiftTimedState(500)
    expect(player.divination.expiresAt).toBe(5500)
    expect(player.regionEvent.endsAt).toBe(6500)
    expect(player.breakthroughPrep.readyAt).toBe(7500)
    expect(player.enlightenmentAt).toBe(8500)
    expect(player.suppressedSince.qingyun).toBe(9500)
    expect(player.regionStats.qingyun?.lastUpdateAt).toBe(10500)
  })

  it('读档境界大阶与层数取整夹界,派生境界/名称/数值都可用', () => {
    const player = usePlayerStore()

    player.$patch({ major: Number.NaN, sub: Number.NaN })
    player.sanitize()
    expect(player.major).toBe(0)
    expect(player.sub).toBe(0)

    player.$patch({ major: 3.5, sub: 4.8 })
    player.sanitize()
    expect(player.major, '小数大阶不能当境界表下标').toBe(3)
    expect(player.sub, '小数层数不能带进公式').toBe(4)
    expect(player.realm, '境界定义必须存在').toBeDefined()
    expect(typeof player.subName, '层数名称必须是字符串').toBe('string')

    player.$patch({ major: 999, sub: 999 })
    player.sanitize()
    expect(player.major).toBe(MAX_MAJOR)
    expect(player.sub).toBe(SUB_LEVELS - 1)
    expect(Number.isFinite(player.cultPerSec), '越界大阶不得把增速算成 Infinity').toBe(true)
    expect(Number.isFinite(player.qiCapValue), '越界层数不得把灵气容量算成 Infinity').toBe(true)
  })

  it('道号为空串时兜底成「无名散修」—— 顶栏是裸渲染,空串会显示成一片空白', () => {
    const player = usePlayerStore()

    // 建号与导入检视都有兜底,唯独 store 的 sanitize 原先只挡非字符串,
    // 于是手改档/旧档里的空道号会一路留到顶栏(`{{ player.name }}`)渲染
    player.$patch({ name: '' })
    player.sanitize()
    expect(player.name, '空道号须兜底').toBe('无名散修')

    player.$patch({ name: '   ' })
    player.sanitize()
    expect(player.name, '纯空白也算空').toBe('无名散修')

    player.$patch({ name: 42 as unknown as string })
    player.sanitize()
    expect(player.name, '非字符串照旧兜底').toBe('无名散修')

    player.$patch({ name: '青玄' })
    player.sanitize()
    expect(player.name, '正常道号不许被改').toBe('青玄')
  })
})

/**
 * 坏档里的负年龄必须被修正。
 *
 * `sanitize` 里 age 原先只挡 `!Number.isFinite`,不挡负数 —— 而同函数的 major / sub
 * 都用了 `Math.max(0, ...)`。负年龄有三条可见后果:
 *  · 死亡判据是 `age < lifespanMax`,负年龄永远死不了
 *  · TopStatusBar 直接印 `Math.floor(player.age)`,会显示「寿元 -100/120」
 *  · lifespanRatio 算出大于 1 的值,喂给寿元血色档位判断
 *
 * 故障注入:把 sanitize 里那行改回只判 `!Number.isFinite(age.value)`,本条红。
 */
describe('坏档 · 年龄下限', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('负年龄被重置为起始年龄,寿元比例回到 [0,1]', () => {
    const player = usePlayerStore()
    for (const bad of [-1, -100, -0.5, -1e6]) {
      player.age = bad
      player.sanitize()
      expect(player.age, `年龄 ${bad} 该被重置`).toBeGreaterThanOrEqual(0)
      expect(player.lifespanRatio, `年龄 ${bad} 的寿元比例越界`).toBeGreaterThanOrEqual(0)
      expect(player.lifespanRatio, `年龄 ${bad} 的寿元比例越界`).toBeLessThanOrEqual(1)
    }
  })

  it('正常年龄不被误改', () => {
    const player = usePlayerStore()
    player.age = 55
    player.sanitize()
    expect(player.age, '正常年龄被重置了').toBe(55)
  })
})

/*
 * 坏档 · 寿元加算项的下限
 *
 * 与上面「年龄下限」同型,但漏了这一侧:`sanitize` 里 lifespanBonusYears 只挡了 NaN
 * (`asFiniteNumber(v, 0)`),没挡负数。而它是 lifespanMax 的**加算项**:
 *
 *   lifespanMax = floor(基础寿元 × (1 + 灵根加成) + lifespanBonusYears)
 *
 * 坏档里写 -999,炼气一层的寿元上限就从 150 变成 -849 —— 界面上直接印
 * 「寿元 -849」,而 lifespanRatio 被 `Math.max(0, …)` 压成 0,寿元条永远是空的。
 *
 * 注释当时只担心 NaN 让死亡判据恒假,没想到负数会把上限本身拖成负数。
 *
 * 故障注入:把那行改回 `asFiniteNumber(lifespanBonusYears.value, 0)`,本条红。
 */
describe('坏档 · 寿元加算项下限', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('负的寿元加成被夹成 0,寿元上限不出现负数', () => {
    const player = usePlayerStore()
    player.initCharacter('寿元探针', { roots: [] } as never)
    const healthy = player.lifespanMax
    expect(healthy, '前置:正常寿元该是正数').toBeGreaterThan(0)
    for (const bad of [-1, -999, -1e9]) {
      player.lifespanBonusYears = bad
      player.sanitize()
      expect(player.lifespanBonusYears, `加成 ${bad} 该夹成 0`).toBe(0)
      expect(player.lifespanMax, `加成 ${bad} 之后寿元上限成了 ${player.lifespanMax}`).toBeGreaterThan(0)
      expect(player.lifespanMax).toBe(healthy)
    }
  })

  it('正常的寿元加成不被误改', () => {
    const player = usePlayerStore()
    player.initCharacter('寿元探针', { roots: [] } as never)
    const base = player.lifespanMax
    player.lifespanBonusYears = 30
    player.sanitize()
    expect(player.lifespanBonusYears, '正加成被夹掉了').toBe(30)
    expect(player.lifespanMax, '正加成该抬高上限').toBe(base + 30)
  })

  it('NaN 与 Infinity 照旧被修正', () => {
    const player = usePlayerStore()
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      player.age = bad
      player.sanitize()
      expect(Number.isFinite(player.age), `${bad} 该被修正成有限数`).toBe(true)
    }
  })
})

/*
 * sanitize 自己不许抛 —— 它是坏档唯一的自愈入口。
 *
 * `reincarnation` 的整体修形在 player.sanitize 靠后那段(统一重建对象、顺带 sanitizeLives),
 * 而「清旧世残留道侣」那一句在它之前执行。坏档里 `reincarnation.lives` 是 undefined/null 时,
 * 原先的 `lives[lives.length - 1]` 会当场抛 TypeError,整条自愈路径断在这里 ——
 * 玩家看到的是启动即崩,而不是被修好的档。
 *
 * 实测修复前:lives 为 undefined 或 null 且身上有道侣时必抛。
 */
describe('player.sanitize · 履历缺失时不许抛', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('给定 lives 是 undefined/null 且身上有道侣,当 sanitize 时,则照常修完且不抛', () => {
    for (const bad of [undefined, null]) {
      setActivePinia(createPinia())
      const player = usePlayerStore()
      player.$patch({ bond: { daoluId: 'dl_muyan', metAt: 1000, stage: 'met' } } as never)
      player.$patch({ reincarnation: { ...player.reincarnation, lives: bad } } as never)
      expect(() => player.sanitize(), `lives = ${String(bad)} 时 sanitize 抛了`).not.toThrow()
      // 无履历时判据不成立:道侣照常保留(与「从未转世的旧档」同义)
      expect(player.bond?.daoluId, '没有履历就不该把道侣当成旧世残留清掉').toBe('dl_muyan')
    }
  })
})

/**
 * 秘境战利清单须封顶。
 *
 * `player.sanitize` 里同一块把 `layer` / `wins` / `losses` 都夹了上界,只有 `spoils`
 * 原样吃下。而 `SecretRealmCard` 用 `v-for` 逐条渲染,`max-h-24 overflow-y-auto`
 * 只管视觉高度、管不住 DOM 节点数 —— 坏档写 5000 条就渲 5000 个 `<span>`。
 * 与行囊 `BAG_CAPACITY` 那处同一类(AGENTS.md 记着「几千件被原样吃下」那次)。
 *
 * 故障注入:把 `asStringArray(sr.spoils).slice(-SPOILS_CAP)` 改回裸 `asStringArray(sr.spoils)` → 本条红。
 */
describe('秘境战利 · 读档条数封顶', () => {
  it('坏档塞 5000 条,读档后只留尾部一小段', () => {
    const player = usePlayerStore()
    player.initCharacter('探针', { roots: [] } as never)
    player.secretRealm = {
      realmId: 'sr_kurong',
      enteredAt: Date.now(),
      layer: 1,
      wins: 0,
      losses: 0,
      spoils: Array.from({ length: 5000 }, (_, i) => `战利 ${i}`),
      rules: [],
      carriedHpPct: 1,
      finished: false
    } as never

    player.sanitize()

    const spoils = (player.secretRealm as { spoils: string[] } | null)?.spoils ?? []
    expect(spoils.length, '战利清单没封顶 —— 界面会逐条渲出来').toBeLessThanOrEqual(50)
    expect(spoils.length, '封顶后不该是空的').toBeGreaterThan(0)
    expect(spoils[spoils.length - 1], '该保留最新的那几条').toBe('战利 4999')
  })
})

/**
 * 区域事件的到期上界须给「时钟回拨」留余量。
 *
 * 只写 `now + 最长时长` 时,回拨会让 `now + MAX` 跟着缩小 ——
 * 实测回拨 3 小时后,一个还剩 90 分钟的**合法事件被当场作废**。
 * 与 155 轮 buff 的 `addEstimatedCap` 是同一类:参照点不能只用「现在」。
 *
 * 判据两半:回拨 3 小时合法事件保留;十天后的远期坏档照常作废。
 *
 * 故障注入:把 `slackMs` 改回 `REGION_EVENT_MAX_MINUTES * 60_000` → 第一条红。
 */
describe('区域事件 · 到期上界与时钟回拨', () => {
  afterEach(() => vi.restoreAllMocks())

  it('时钟回拨后合法事件不被作废,远期坏档仍清掉', () => {
    const p = usePlayerStore()
    p.initCharacter('探针', { roots: [] } as never)
    const t0 = 1_800_000_000_000

    p.regionEvent = { regionId: 'qingyun', eventId: 'yaochao', endsAt: t0 + 90 * 60_000 } as never
    vi.spyOn(Date, 'now').mockReturnValue(t0 - 3 * 3600_000)
    p.sanitize()
    expect(p.regionEvent, '回拨 3 小时后合法事件被清 —— 玩家平白丢一个事件').not.toBeNull()

    vi.restoreAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(t0)
    p.regionEvent = { regionId: 'qingyun', eventId: 'yaochao', endsAt: t0 + 10 * 86_400_000 } as never
    p.sanitize()
    expect(p.regionEvent, '十天后的远期坏档没清 —— 该地界再也掷不出新事件').toBeNull()
  })
})

/**
 * 区域胜场的读档侧只认真实地界。
 *
 * 写入侧（`recordRegionWin`）早有 `regionDef` 闸，读档侧原先漏了 —— 坏档塞三千个野 id 全留下。
 * 野 id 不渲染也不影响兴衰判定（那边按 id 查），但它与 `regionWinsLife` 的**同键约束**会破：
 * 重建世号时按 `regionDef` 跳过野 id，两张表键集就不一致了
 * （`regionWinsLife` 的注释写着「与 regionWins 同键、须同步」）。
 *
 * 故障注入：去掉 `.filter(([id]) => !!regionDef(id))` → 本条红。
 */
describe('区域胜场 · 读档只认真实地界', () => {
  it('野 id 清掉,真实胜场原样', () => {
    const p = usePlayerStore()
    const w: Record<string, number> = {}
    for (let i = 0; i < 500; i += 1) w['wild_' + i] = 5
    w.qingyun = 7
    p.regionWins = w as never
    p.sanitize()
    expect(Object.keys(p.regionWins).length, '野 id 没清 —— 会撑大存档并破坏与 regionWinsLife 的同键约束').toBe(1)
    expect(p.regionWins.qingyun, '真实胜场被误伤').toBe(7)
  })
})
