/**
 * 离线结算封顶一致性 —— 镇压区域被动收益受洞府离线上限约束。
 *
 * 回归点:离线结算此前把完整 dtSec 传给 settleSuppressedRegions(见 offline.ts),
 * 镇压收益绕过 mansion 离线封顶 —— 60h 缺席、洞府 0 级(cap 8h)时仍按 60h 全额
 * 结算(且装备 0.4/h × 60h 洪水)。修后按 capSec 结算。
 *
 * 注意:改做断言的是离线总结中「镇压诸域仍有余韵」一行的灵石数,而非 spiritStone
 * 总额——总额还含 track('offlineClaims') 触发的成就奖励(境界成就等),与镇压无关。
 * 每个 `it` 独立 pinia,避免多次结算互相污染。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { settleOffline } from './offline'
import { checkStateAchievements } from './progress'
import { studyTick } from './loreService'
import { useLoreStore } from '@/stores/lore'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { useDongfuStore } from '@/stores/dongfu'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'
import { todayWeather } from './weather'
import { gn, mulN, toNum } from '@/utils/gnum'
import { OFFLINE_EFFICIENCY } from '@/data/constants'

const GAP_HOURS = 60

/** 解析 formatGN 输出(1,411 / 1.5万 / 1.2亿)为数值 */
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
  game.lastActiveAt = Date.now() - GAP_HOURS * 3600 * 1000 // 60h 前最后在线
  player.major = 3
  player.suppressedRegions = ['qingyun']
  dongfu.setLevel('mansion', mansionLevel)
  settleOffline(Date.now())
  const line = useUiStore().offlineSummary?.notes.find(n => n.startsWith('镇压诸域仍有余韵'))
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
    // 8h 封顶:stoneByTier(tier1, 150×8×0.98) = 1411;60h 全额为 10584
    expect(stone).toBeGreaterThan(1000)
    expect(stone).toBeLessThan(2000)
  })

  it('洞府 4 级(cap 72h → capSec 60h):镇压收益随封顶抬升到 60h 量级', () => {
    const stone = suppressionStoneAfterOffline(4)
    // 60h 封顶:stoneByTier(tier1, 150×60×0.98) ≈ 10584
    expect(stone).toBeGreaterThan(8000)
    expect(stone).toBeLessThan(13000)
  })
})

describe('离线结算同源吃天时(ISS-027 续)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('灵雨日离线修炼速率高于清和日(天时并入 cultPerSec,离线不再掉加成)', () => {
    // 找一个清和日(无修炼加成)与灵雨日(+10%),同一角色同一时长下对比
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
      // 短离线(10s)只修一次修炼,修为远未触及 expReq 封顶,差值才可比
      g.lastActiveAt = Date.now() - 10 * 1000
      g.$patch({ totalPlaySec: day * 86400 })
      p.initCharacter('离修', { roots: [] } as never)
      const before = toNum(p.exp)
      settleOffline(Date.now())
      return toNum(p.exp) - before
    }
    const expLingyu = offlineExpOnDay(lingyuDay)
    const expQinghe = offlineExpOnDay(qingheDay)
    // 灵雨修炼 +10%:离线修为增益应显著高于无加成日(留余量,防修复方 double-count)
    expect(expLingyu).toBeGreaterThan(expQinghe * 1.05)
  })

  /**
   * 扩界冒烟:离线结算此前只在元婴期(major 3)验过。
   * 高界的修为/灵气量级跨了十几个数量级,若某处仍按旧口径算,离线一结算就现形。
   */
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

  /**
   * 高界离线的**全产线**体检:修为、灵气、洞府、镇压、藏经阁都在同一次结算里跑。
   * 只验修为是不够的 —— 镇压产出按 capSec 结算、洞府产出按 effSec,两处量级不同,
   * 谁在高界算出负数/NaN,总结里会直接现形。
   */
  it('混沌道祖离线:五条产线的读数全部有限且非负', () => {
    const game = useGameStore()
    const player = usePlayerStore()
    game.markStarted()
    game.lastActiveAt = Date.now() - GAP_HOURS * 3600 * 1000
    player.major = 20
    player.sub = 9
    // 开一条镇压线(混沌海地界),让镇压产出也进这次结算
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

  /**
   * 「比率」体检的第二处与第三处:洞府产出与藏经阁钻研同样走 effSec(= 时长 × 0.9)。
   * 与修为那条同理 —— 只看"有没有产出"看不出折扣是否被某处吞掉或被重复施加。
   * 做法:同一份状态跑两遍,一遍走离线结算,一遍直接调在线函数并传 effSec,比对读数。
   */
  it('洞府与藏经阁的离线折扣与在线同源:进度读数等于「直接传 effSec」那一遍', () => {
    /**
     * 为什么比 frac/studyFrac 而不比资源总额:离线结算里的 track('offlineClaims')
     * 会触发成就奖励(其中就有灵草/玄铁这类),总额因此天然高于"纯产出"那一遍 ——
     * 那是设计,不是折扣被吞。洞府的 frac 与藏经阁的 studyFrac 只由这条产线写,
     * 拿它们比才真正隔离出「折扣口径是否同源」。
     */
    // 取一个除不尽的时长:整份产出会被 floor 进资源,余数才留在 frac 上 ——
    // 而余数正是这条产线的指纹(整数时长下 frac 恒为 0,断言会失去意义)
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
      // 结算时刻与 lastActiveAt 必须用**同一个 now**:settleOffline 的 dtSec 是
      // 实量 `now − lastActiveAt`,差几毫秒就会把余数推过 6 位小数的同源断言
      // (CI 上时好时坏的随机红,根因在此)。now 随 setup 返回,由调用方回填给结算。
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

  /**
   * 离线折扣的**口径一致性**:离线修为 = 在线速率 × 时长 × OFFLINE_EFFICIENCY。
   * 单看「有没有增长」看不出量级走样 —— 高界数值跨十几个数量级,
   * 某处若被 clamp 或精度丢失,增长率就会悄悄偏离这个折扣。
   */
  it('离线折扣全程一致:人间/真仙/神人/混沌的增益都恰是 在线速率 ×0.9', () => {
    for (const major of [0, 9, 14, 20]) {
      setActivePinia(createPinia())
      const game = useGameStore()
      const player = usePlayerStore()
      game.markStarted()
      player.major = major
      player.sub = 0
      const gapHours = 4 // 低于最低封顶(8h),故 capSec = 真实时长
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

/**
 * 离线总结「报数 == 实发」守卫。
 *
 * 回归点:离线结算在各条产线落账后,于 offline.ts:327-345 汇总 `OfflineSummary`
 * (stone/qi/herb/herbByGrade/ore/wudao/ageYears + capped/cappedSeconds)。这些数全靠
 * 与结算前快照做差得到,却从未被断言「报的数 == 玩家实际到手的数」——一旦汇总口径
 * 漂移(差值错位、逐品漏档、cap 标签写死),玩家在归来卷轴看到的就是「说谎的数」,
 * 而 CI 毫无反应。这里用受控起始态过一遍真实 settleOffline,逐项核对报数与实发。
 *
 * 每个 `it` 独立 pinia(离线结算会改多店状态),避免互相污染。
 */
describe('离线总结报数 == 实发', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('非封顶段:stone/qi/herb/herbByGrade/ore/wudao/ageYears 报数==实发,cap 恒假', () => {
    const game = useGameStore()
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const dongfu = useDongfuStore()
    player.major = 3
    dongfu.setLevel('field', 3) // 灵田在产,让 herb/ore 真实走通
    dongfu.setLevel('library', 3) // 藏经阁让 wudao 真实走通
    // 先排掉「首次 track('offlineClaims') 时被一并补发的主线/境界成就一次性石头/灵草」——
    // 那是成就系统的账,不在离线总结的管辖内;不排掉会用原始总额差污染 "报数==实发" 断言
    checkStateAchievements()
    game.markStarted()
    game.lastActiveAt = Date.now() - 3600 * 1000 // 1h 前最后在线;洞府 0 级 cap 8h -> 非封顶

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

    // 报数 == 实发(以结算后快照差为准,逐项核对)
    expect(toNum(resources.spiritStone) - s0, 'stone 实发').toBeCloseTo(toNum(sm.stone), 3)
    expect(Math.round(resources.qi - q0), 'qi 实发(取整)').toBe(sm.qi)
    expect(Math.round(player.age - age0), 'ageYears 实发').toBe(sm.ageYears)
    expect(resources.herb - h0, 'herb 实发').toBe(sm.herb)
    expect(resources.ore - o0, 'ore 实发').toBe(sm.ore)
    expect(resources.wudao - w0, 'wudao 实发').toBe(sm.wudao)

    // 灵田真实在产(否则下面逐品核对形同虚设)
    expect(sm.herb, '灵田应产出灵草').toBeGreaterThan(0)
    // 总 herb == 逐品净增之和
    const gradeSum = sm.herbByGrade.reduce((a, e) => a + e.amount, 0)
    expect(gradeSum, '总 herb 应等于逐品之和').toBe(sm.herb)
    // 逐品净增 == 实际该品增量
    for (const e of sm.herbByGrade) {
      expect(resources.herbOf(e.grade) - (herbBefore[e.grade] ?? 0), `品${e.grade} 逐品实发`).toBe(e.amount)
    }
  })

  it('封顶段:capped/cappedSeconds/seconds 报数正确,实发按 cap 折算且寿元不封顶', () => {
    const game = useGameStore()
    const player = usePlayerStore()
    const dongfu = useDongfuStore()
    player.major = 3
    dongfu.setLevel('field', 3)
    dongfu.setLevel('library', 3)
    checkStateAchievements() // 排掉首次 track 补发的成就/主线一次性收益,保持断言纯净
    game.markStarted()
    game.lastActiveAt = Date.now() - 60 * 3600 * 1000 // 60h;洞府 0 级 cap 8h

    const age0 = player.age
    const rate = player.cultPerSec // 结算前速率(60h 修为可能当场越层,结算后会涨,须以结算前为准)
    const summary = settleOffline(Date.now())
    expect(summary, '60h 离线应结算').not.toBeNull()
    const sm = summary!

    const capSec = 8 * 3600 // 28800
    const effSec = capSec * OFFLINE_EFFICIENCY
    expect(sm.capped, '60h 超过 8h 封顶').toBe(true)
    expect(sm.cappedSeconds, '报出真实 capSec').toBe(capSec)
    expect(sm.seconds, '报出完整 dtSec').toBe(60 * 3600)

    // 实发按 capSec 折算:修为增益对应 ~7.2h(cap×0.9),而非 ~54h(60h×0.9)
    expect(toNum(sm.exp), '增益按 cap 折算').toBeCloseTo(rate * effSec, 3)
    expect(toNum(sm.exp), '不得越过 cap 多给').toBeLessThan(rate * (60 * 3600) * OFFLINE_EFFICIENCY * 0.5)

    // 寿元不封顶:60h 全额记账(≈60 年),而非 8h(≈8 年),且报数==实发
    expect(sm.ageYears).toBe(Math.round(player.age - age0))
    expect(sm.ageYears, '寿元按完整 60h 记账').toBeGreaterThanOrEqual(50)
  })
})
