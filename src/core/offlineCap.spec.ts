/**
 * 离线结算封顶一致性:镇压收益受洞府离线上限约束(按 capSec 结,不按 dtSec)。
 * 断言读「镇压收益」那行的灵石数,不读 spiritStone 总额:总额含 track('offlineClaims') 触发的成就奖励。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { settleOffline } from './offline'
import { checkStateAchievements } from './progress'
import { studyTick } from './loreService'
import { useLoreStore } from '@/stores/lore'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { useDongfuStore } from '@/stores/dongfu'
import { useCultivationStore } from '@/stores/cultivation'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'
import { useAdventureStore } from '@/stores/adventure'
import { todayWeather } from './weather'
import { gn, mulN, toNum } from '@/utils/gnum'
import { OFFLINE_EFFICIENCY } from '@/data/constants'

const GAP_HOURS = 60

/** 解析 formatGN 输出为数值 */
function parseGNFmt(s: string): number {
  const m = /([\d.,]+)\s*(万|亿|兆|京)?/.exec(s)
  const base = parseFloat(m![1]!.replace(/,/g, ''))
  const mult = m![2] === '万' ? 1e4 : m![2] === '亿' ? 1e8 : m![2] === '兆' ? 1e12 : m![2] === '京' ? 1e16 : 1
  return base * mult
}

function suppressionStoneAfterOffline(mansionLevel: number): number {
  const game = useGameStore()
  const player = usePlayerStore()
  const dongfu = useDongfuStore()
  game.markStarted()
  game.lastActiveAt = Date.now() - GAP_HOURS * 3600 * 1000
  player.major = 3
  player.suppressedRegions = ['qingyun']
  dongfu.setLevel('mansion', mansionLevel)
  settleOffline(Date.now())
  const line = useUiStore().offlineSummary?.notes.find(n => n.startsWith('镇压收益'))
  expect(line, '镇压区域离线应有镇压提示').toBeDefined()
  const m = /灵石 \+([\d.,]+\s*万?亿?兆?京?)/.exec(line!)
  expect(m, '镇压提示应含灵石数').not.toBeNull()
  return parseGNFmt(m![1]!)
}

describe('离线结算封顶一致性', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('洞府 0 级(cap 8h):60h 缺席的镇压收益按 8h 结算,而非 60h', () => {
    const stone = suppressionStoneAfterOffline(0)
    // 8h 封顶:stoneByTier(tier1, 150×8×1.0) = 1440;60h 全额 ≈ 10800
    expect(stone).toBeGreaterThan(1000)
    expect(stone).toBeLessThan(2000)
  })

  it('洞府 4 级(cap 72h → capSec 60h):镇压收益随封顶抬升到 60h 量级', () => {
    const stone = suppressionStoneAfterOffline(4)
    // 60h 封顶 ≈ 10800
    expect(stone).toBeGreaterThan(8000)
    expect(stone).toBeLessThan(13000)
  })
})

describe('离线结算同源吃天时', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('灵雨日离线修炼速率高于清和日(天时并入 cultPerSec,离线不再掉加成)', () => {
    // 清和日无修炼加成,灵雨日 +10%
    const game = useGameStore()
    let lingyuDay = -1
    let qingheDay = -1
    for (let d = 0; d < 60; d += 1) {
      game.$patch({ totalPlaySec: d * 86400 })
      const id = todayWeather().id
      if (id === 'lingyu' && lingyuDay < 0) lingyuDay = d
      if (id === 'qinghe') qingheDay = d
    }
    expect(lingyuDay).toBeGreaterThanOrEqual(0)
    expect(qingheDay).toBeGreaterThanOrEqual(0)

    function offlineExpOnDay(day: number): number {
      const g = useGameStore()
      const p = usePlayerStore()
      g.markStarted()
      // 10s 短离线:修为远未触及 expReq 封顶,差值才可比
      g.lastActiveAt = Date.now() - 10 * 1000
      g.$patch({ totalPlaySec: day * 86400 })
      p.initCharacter('离修', { roots: [] } as never)
      const before = toNum(p.exp)
      settleOffline(Date.now())
      return toNum(p.exp) - before
    }
    const expLingyu = offlineExpOnDay(lingyuDay)
    const expQinghe = offlineExpOnDay(qingheDay)
    // 灵雨 +10%;阈值取 1.05 留余量
    expect(expLingyu).toBeGreaterThan(expQinghe * 1.05)
  })

  it('混沌道祖离线结算不崩:修为有增、数值有限', () => {
    const game = useGameStore()
    const player = usePlayerStore()
    game.markStarted()
    game.lastActiveAt = Date.now() - GAP_HOURS * 3600 * 1000
    player.major = 20
    player.sub = 9

    const before = toNum(player.exp)
    const summary = settleOffline(Date.now())

    expect(summary, '高界离线应产出总结').not.toBeNull()
    expect(toNum(player.exp), '高界离线修为未增长').toBeGreaterThan(before)
    expect(Number.isFinite(toNum(player.exp))).toBe(true)
  })

  /** 高界全产线体检:镇压按 capSec、洞府按 effSec,量级不同须分别验 */
  it('混沌道祖离线:五条产线的读数全部有限且非负', () => {
    const game = useGameStore()
    const player = usePlayerStore()
    game.markStarted()
    game.lastActiveAt = Date.now() - GAP_HOURS * 3600 * 1000
    player.major = 20
    player.sub = 9
    player.suppressRegion('hongmengbenyuan')
    player.suppressQualified.push('hongmengbenyuan')

    const summary = settleOffline(Date.now())!
    expect(summary).not.toBeNull()
    const numeric: Record<string, number> = {
      exp: toNum(summary.exp),
      stone: toNum(summary.stone),
      herb: summary.herb,
      ore: summary.ore,
      wudao: summary.wudao
    }
    for (const [k, v] of Object.entries(numeric)) {
      expect(Number.isFinite(v), `${k} 非有限值`).toBe(true)
      expect(v, `${k} 为负`).toBeGreaterThanOrEqual(0)
    }
    for (const line of summary.notes) expect(line).not.toContain('NaN')
    for (const e of summary.equipment) expect(e.name).not.toContain('NaN')
  })

  /** 洞府与藏经阁同走 effSec(时长 × 0.9):同一状态跑离线结算与直接传 effSec 两遍,比对进度读数 */
  it('洞府与藏经阁的离线折扣与在线同源:进度读数等于「直接传 effSec」那一遍', () => {
    // 比 frac/studyFrac 不比资源总额:总额含 track('offlineClaims') 的成就奖励;frac 只由这条产线写
    // 取除不尽的时长:整数时长下 frac 恒为 0,断言失效
    const gapHours = 0.37
    const setup = (): number => {
      setActivePinia(createPinia())
      const game = useGameStore()
      const player = usePlayerStore()
      const dongfu = useDongfuStore()
      const lore = useLoreStore()
      game.markStarted()
      player.major = 9
      dongfu.levels.field = 3
      dongfu.levels.library = 2
      lore.recipeLore = { p_jvqidan: 0.2 }
      // 结算与 lastActiveAt 须用同一个 now:差几毫秒就推过 6 位小数断言;now 随 setup 返回给结算
      const now = Date.now()
      game.lastActiveAt = now - gapHours * 3600 * 1000
      return now
    }
    const readFrac = (): { herb: number; ore: number; wudao: number; study: number } => ({
      herb: useDongfuStore().frac.herb,
      ore: useDongfuStore().frac.ore,
      wudao: useDongfuStore().frac.wudao,
      study: useLoreStore().studyFrac
    })

    settleOffline(setup())
    const offline = readFrac()

    setup()
    const capSec = Math.min(gapHours * 3600, useDongfuStore().offlineCapHours * 3600)
    const effSec = capSec * OFFLINE_EFFICIENCY
    useDongfuStore().produce(effSec)
    studyTick(effSec)
    const direct = readFrac()

    expect(offline.herb, `灵草进度:离线 ${offline.herb} vs 直接 ${direct.herb}`).toBeCloseTo(direct.herb, 6)
    expect(offline.ore).toBeCloseTo(direct.ore, 6)
    expect(offline.wudao).toBeCloseTo(direct.wudao, 6)
    expect(offline.study, '藏经阁钻研进度:离线与直接传 effSec 应一致').toBeCloseTo(direct.study, 6)
    expect(offline.herb, '进度不该为 0,否则断言形同虚设').toBeGreaterThan(0)
  })

  /** 离线修为 = 在线速率 × 时长 × OFFLINE_EFFICIENCY,跨界验比率 */
  it('离线折扣全程一致:人间/真仙/神人/混沌的增益都恰是 在线速率 ×0.9', () => {
    for (const major of [0, 9, 14, 20]) {
      setActivePinia(createPinia())
      const game = useGameStore()
      const player = usePlayerStore()
      game.markStarted()
      player.major = major
      player.sub = 0
      const gapHours = 4 // 低于最低封顶 8h,capSec = 真实时长
      game.lastActiveAt = Date.now() - gapHours * 3600 * 1000
      const rate = player.cultPerSec
      const effSec = gapHours * 3600 * OFFLINE_EFFICIENCY
      const before = toNum(player.exp)
      expect(settleOffline(Date.now()), `major ${major} 离线未结算`).not.toBeNull()
      const gained = toNum(player.exp) - before
      const expected = toNum(mulN(gn(rate), effSec))
      expect(expected, `major ${major} 期望增益为 0,断言形同虚设`).toBeGreaterThan(0)
      expect(gained / expected, `major ${major} 离线增益偏离 0.9 折扣:${(gained / expected).toFixed(4)}`).toBeCloseTo(1, 3)
    }
  })
})

/** 离线总结「报数 == 实发」守卫:OfflineSummary 各项与结算前后快照差逐项核对 */
describe('离线总结报数 == 实发', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('非封顶段:stone/qi/herb/herbByGrade/ore/wudao/ageYears 报数==实发,cap 恒假', () => {
    // 冻时:lastActiveAt 与 settleOffline 读同一时刻,否则 gap 略超 3600s,报数与实发偶发差 1
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_800_000_000_000)
      setActivePinia(createPinia())
      const game = useGameStore()
      const player = usePlayerStore()
      const resources = useResourcesStore()
      const dongfu = useDongfuStore()
    player.major = 3
    dongfu.setLevel('field', 3) // herb/ore 真实走通
    dongfu.setLevel('library', 3) // wudao 真实走通
    // 先结清成就:首次 track('offlineClaims') 会补发成就奖励,污染总额差
    checkStateAchievements()
    game.markStarted()
    game.lastActiveAt = Date.now() - 3600 * 1000 // 1h;洞府 0 级 cap 8h,不封顶

    const s0 = toNum(resources.spiritStone)
    const q0 = resources.qi
    const h0 = resources.herb
    const o0 = resources.ore
    const w0 = resources.wudao
    const age0 = player.age
    const herbBefore = { ...resources.herbByGrade }

    const summary = settleOffline(Date.now())
    expect(summary, '1h 离线应结算').not.toBeNull()
    const sm = summary!

    expect(sm.capped, '1h 未达 8h 封顶').toBe(false)
    expect(sm.seconds).toBe(3600)
    expect(sm.cappedSeconds, '非封顶时带报完整秒数').toBe(3600)

    expect(toNum(resources.spiritStone) - s0, 'stone 实发').toBeCloseTo(toNum(sm.stone), 3)
    expect(Math.round(resources.qi - q0), 'qi 实发(取整)').toBe(sm.qi)
    expect(Math.round(player.age - age0), 'ageYears 实发').toBe(sm.ageYears)
    expect(resources.herb - h0, 'herb 实发').toBe(sm.herb)
    expect(resources.ore - o0, 'ore 实发').toBe(sm.ore)
    expect(resources.wudao - w0, 'wudao 实发').toBe(sm.wudao)

    // 防逐品核对空转
    expect(sm.herb, '灵田应产出灵草').toBeGreaterThan(0)
    const gradeSum = sm.herbByGrade.reduce((a, e) => a + e.amount, 0)
    expect(gradeSum, '总 herb 应等于逐品之和').toBe(sm.herb)
    for (const e of sm.herbByGrade) {
      expect(resources.herbOf(e.grade) - (herbBefore[e.grade] ?? 0), `品${e.grade} 逐品实发`).toBe(e.amount)
    }
    } finally {
      vi.useRealTimers()
    }
  })

  it('封顶段:capped/cappedSeconds/seconds 报数正确,实发按 cap 折算且寿元不封顶', () => {
    // 冻时:否则跨秒时 seconds 偶发报 216001
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_800_000_000_000)
      setActivePinia(createPinia())
      const game = useGameStore()
      const player = usePlayerStore()
      const dongfu = useDongfuStore()
      player.major = 3
      dongfu.setLevel('field', 3)
      dongfu.setLevel('library', 3)
      checkStateAchievements() // 先结清成就奖励
      game.markStarted()
      game.lastActiveAt = Date.now() - 60 * 3600 * 1000 // 60h;洞府 0 级 cap 8h

      const age0 = player.age
      const rate = player.cultPerSec // 须取结算前速率:结算中可能越层
      const summary = settleOffline(Date.now())
      expect(summary, '60h 离线应结算').not.toBeNull()
      const sm = summary!

      const capSec = 8 * 3600
      const effSec = capSec * OFFLINE_EFFICIENCY
      expect(sm.capped, '60h 超过 8h 封顶').toBe(true)
      expect(sm.cappedSeconds, '报出真实 capSec').toBe(capSec)
      expect(sm.seconds, '报出完整 dtSec').toBe(60 * 3600)

      expect(toNum(sm.exp), '增益按 cap 折算').toBeCloseTo(rate * effSec, 3)
      expect(toNum(sm.exp), '不得越过 cap 多给').toBeLessThan(rate * (60 * 3600) * OFFLINE_EFFICIENCY * 0.5)

      // 寿元不封顶:60h ≈ 60 年
      expect(sm.ageYears).toBe(Math.round(player.age - age0))
      expect(sm.ageYears, '寿元按完整 60h 记账').toBeGreaterThanOrEqual(50)
    } finally {
      vi.useRealTimers()
    }
  })
})

/** 离线修炼修为(不挂历练) */
function offlineCultExp(buff: 'none' | 'expired' | 'active'): number {
  // 冻时:endsAt 与 nowMs 读同一时刻,否则过期的聚灵偶发被当成仍有效
  vi.useFakeTimers()
  try {
    vi.setSystemTime(1_000_000)
    setActivePinia(createPinia())
    const game = useGameStore()
    const player = usePlayerStore()
    game.markStarted()
    const started = Date.now() - 2 * 3600 * 1000
    game.lastActiveAt = started
    player.major = 4
    player.exp = { m: 0, e: 0 }
    if (buff !== 'none') {
      const endsAt = buff === 'expired' ? Date.now() - 5000 : Date.now() + 3600 * 1000
      useCultivationStore().buffs = [{ defId: 'buff_juling', endsAt, added: 1800000 }] // 聚灵:+50% 修速
    }
    const summary = settleOffline(Date.now())!
    return toNum(summary.exp)
  } finally {
    vi.useRealTimers()
  }
}

describe('离线结算 · 已过期 buff 不补贴(结算前先清算)', () => {
  it('已过期的聚灵(+50% 修速)对离线修为零贡献:与无 buff 完全一致', () => {
    const expired = offlineCultExp('expired')
    const none = offlineCultExp('none')
    expect(expired).toBe(none)
  })

  it('未过期聚灵仍正常抬离线修为(阳性对照:测试不是空转)', () => {
    const active = offlineCultExp('active')
    const none = offlineCultExp('none')
    expect(active).toBeGreaterThan(none)
  })
})

/** 归来卷轴的镇压账:道韵修为、妖气复聚、镇压松开都须写进卷轴 */
describe('离线归来卷轴 · 镇压账目', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('镇压产出的那一行带上道韵修为,不只报灵石与物产', () => {
    const game = useGameStore()
    const player = usePlayerStore()
    game.markStarted()
    game.lastActiveAt = Date.now() - 2 * 3600 * 1000
    player.major = 3
    player.suppressRegion('qingyun')

    settleOffline(Date.now())
    const line = useUiStore().offlineSummary?.notes.find(n => n.startsWith('镇压收益'))
    expect(line, '镇压一区离线应有镇压提示').toBeDefined()
    expect(line, '守着一片地界多拿了修为,卷轴得说清是哪来的').toContain('道韵修为 +')
  })

  it('妖气复聚的旧主要写进归来卷轴,不能只在提示条里闪过', () => {
    vi.useFakeTimers()
    try {
      // 起点须取真实量级时刻:≤0 的起钟时刻会被读档守卫丢掉
      vi.setSystemTime(1_760_000_000_000)
      setActivePinia(createPinia())
      const game = useGameStore()
      const player = usePlayerStore()
      const adventure = useAdventureStore()
      const id = 'qingyun'
      const started = Date.now() - 100 * 3600 * 1000
      game.markStarted()
      game.lastActiveAt = started
      player.major = 3
      // 100 小时前靖平,已过 72 小时复聚钟
      adventure.markCleared(id)
      adventure.clearedAt[id] = started

      settleOffline(Date.now())
      const notes = useUiStore().offlineSummary?.notes.join('\n') ?? ''
      expect(notes, '旧主归来得写进卷轴').toContain('妖气复聚')
      expect(notes, '复聚那一行要点明旧主归来').toContain('旧主归来')
      expect(notes, '只报状态,不附「再历一程」的指引').not.toContain('再历一程')
    } finally {
      vi.useRealTimers()
    }
  })

  /** 故障注入:把 offline.ts 的 loosened 分支删掉,本条红 */
  it('镇压被妖气复聚松开也写进卷轴,并说出「资格仍在」', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_760_000_000_000)
      setActivePinia(createPinia())
      const game = useGameStore()
      const player = usePlayerStore()
      const id = 'qingyun'
      const started = Date.now() - 100 * 3600 * 1000
      game.markStarted()
      game.lastActiveAt = started
      player.major = 3
      // 只镇压未靖平:复聚钟读 regionTouchedAt(镇压时刻)
      player.suppressedRegions = [id]
      player.suppressedSince = { [id]: started }

      settleOffline(Date.now())

      expect(player.suppressedRegions, '够钟了镇压该松').toEqual([])
      const notes = useUiStore().offlineSummary?.notes.join('\n') ?? ''
      expect(notes, '镇压松开要写进卷轴').toContain('镇压松开')
      expect(notes, '写明资格还在').toContain('资格仍在')
    } finally {
      vi.useRealTimers()
    }
  })
})
