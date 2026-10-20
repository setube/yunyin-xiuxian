import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useInventoryStore } from '@/stores/inventory'
import { DECOMPOSE_DUST } from '@/data/constants'
import { regionDef } from '@/data/regions'
import { herbGradeOfMajor, HERB_GRADE_SHORT } from '@/data/herbGrades'
import { qualityDef } from '@/data/qualities'
import { sub, toNum } from '@/utils/gnum'
import { RandomService } from '@/utils/random'
import { checkSuppression, settleSuppressedRegions, suppressRateFor, suppressionProgress, suppressYield, type RegionStats } from './suppress'
import { prosperityYieldMult, regionRecallFor } from './worldMemory'

describe('区域镇压系统', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /**
   * 地界物产:镇压收益不再只有灵石 —— 火域出矿、林区出草、天界以上出尘。
   * 这样「镇守哪几片」才是一道取舍,而不是"挑层级最高的那几处"。
   */
  describe('地界物产(灵石之外的次级产出)', () => {
    it('按地界气质给物产:林区出草、山地出矿、混沌之滨出尘', () => {
      expect(suppressYield('wanyao')?.id).toBe('herb') // 万妖林:forest
      expect(suppressYield('qingyun')?.id).toBe('ore') // 青云山麓:mountain
      expect(suppressYield('hongmengbenyuan')?.id).toBe('dust') // 鸿蒙本源:sky
      expect(suppressYield('guzhanchang')?.id).toBe('page') // 古战场遗迹:ruin
    })

    it('层级越高,同一物产产出越丰(线性,不随灵石做指数)', () => {
      // 同为林区(灵草):黑风林 tier 3 vs 迷雾沼泽 tier 9
      const low = suppressYield('heifeng')!
      const high = suppressYield('miwu')!
      expect(low.id).toBe('herb')
      expect(high.id).toBe('herb')
      expect(high.perHour).toBeGreaterThan(low.perHour)
      // 线性口径:层级差 6,约多 6×15%
      expect(high.perHour / low.perHour).toBeLessThan(1 + 0.15 * 8)
    })

    it('结算时物产真的进了库存,并记进产出清单', () => {
      const player = usePlayerStore()
      const resources = useResourcesStore()
      player.suppressedRegions = ['wanyao']
      player.suppressedSince = { wanyao: Date.now() }
      const before = resources.herb

      const total = settleSuppressedRegions(3600) // 一小时
      expect(total).not.toBeNull()
      expect(resources.herb, '林区镇压应产出灵草').toBeGreaterThan(before)
      const row = total!.resources.find(r => r.id === 'herb')
      expect(row, '产出清单应记下灵草').toBeDefined()
      // 灵草已分品阶,清单必须写明品阶(否则压着神/道域也看不出囤的是哪一品)—— 品阶按该地界取
      const grade = herbGradeOfMajor(regionDef('wanyao')!.minRealm)
      expect(row!.name, '产出清单的灵草要写明品阶,不能只写「灵草」').toBe(`${HERB_GRADE_SHORT[grade]}灵草`)
      expect(row!.grade, '行上应带着品阶').toBe(grade)
      expect(row!.amount).toBeGreaterThan(0)
    })

    it('在线「镇压/时」的产草率也写明品阶(suppressYield 不只报「灵草」)', () => {
      const y = suppressYield('wanyao')
      expect(y).not.toBeNull()
      if (y!.id === 'herb') {
        // 品阶按该地界算;在线速率行与离线清单同一口径,都不能只有「灵草」二字
        expect(y!.name, '产草率要带品阶').toContain('灵草')
        expect(y!.name, '产草率不能只写「灵草」').not.toBe('灵草')
        expect(y!.name).toContain(HERB_GRADE_SHORT[herbGradeOfMajor(regionDef('wanyao')!.minRealm)])
      }
    })

    /**
     * 比率体检:镇压产出对**时长**必须是线性的(层级线性上面已有用例)。
     * 只看"有没有产出"看不出某处被 clamp 或按整点数取整 —— 六小时的产出
     * 应当恰是两小时的三倍。
     */
    it('时长线性:六小时产出恰是两小时的三倍(同一片地,不因取整走样)', () => {
      const player = usePlayerStore()
      player.suppressedRegions = ['wanyao']
      player.suppressedSince = { wanyao: Date.now() }
      const two = settleSuppressedRegions(2 * 3600)!
      const six = settleSuppressedRegions(6 * 3600)!
      const twoStone = toNum(two.stone)
      const sixStone = toNum(six.stone)
      expect(twoStone).toBeGreaterThan(0)
      expect(sixStone / twoStone, `六小时 ${sixStone} vs 两小时 ${twoStone}`).toBeCloseTo(3, 6)
      // 材料是整数取整,允许 ±1 的取整误差,但比值仍应在 3 附近
      const twoHerb = two.resources.find(r => r.id === 'herb')?.amount ?? 0
      const sixHerb = six.resources.find(r => r.id === 'herb')?.amount ?? 0
      expect(twoHerb).toBeGreaterThan(0)
      expect(sixHerb / twoHerb).toBeGreaterThan(2.5)
      expect(sixHerb / twoHerb).toBeLessThan(3.5)
    })
  })

  /**
   * 「镇压过就镇压过」(DEC-018):
   * 取得资格是**一次性**的,此后收取收益只是一个开关 —— 停取不影响资格,
   * 想切回来一键即可,不必重新打满二十场。收益可多处并存,历练一次只一处。
   */
  describe('镇压资格 · 收益自由开关', () => {
    it('停取收益不丢资格,可一键切回', () => {
      const player = usePlayerStore()
      player.markSuppressQualified('qingyun')
      player.suppressRegion('qingyun')
      expect(player.suppressedRegions).toContain('qingyun')

      player.unsuppressRegion('qingyun')
      expect(player.suppressedRegions).not.toContain('qingyun')
      expect(player.suppressQualified, '资格不该随停取而失去').toContain('qingyun')

      player.suppressRegion('qingyun') // 一键切回,无需再战
      expect(player.suppressedRegions).toContain('qingyun')
    })

    it('收益可多处同时收取,资格各自独立', () => {
      const player = usePlayerStore()
      for (const id of ['qingyun', 'luoxia', 'heifeng']) {
        player.markSuppressQualified(id)
        player.suppressRegion(id)
      }
      expect([...player.suppressedRegions].sort()).toEqual(['heifeng', 'luoxia', 'qingyun'])
      player.unsuppressRegion('luoxia')
      expect([...player.suppressedRegions].sort()).toEqual(['heifeng', 'qingyun'])
      expect(player.suppressQualified).toContain('luoxia')
    })

    it('资格幂等:重复取得不会写重', () => {
      const player = usePlayerStore()
      player.markSuppressQualified('qingyun')
      player.markSuppressQualified('qingyun')
      expect(player.suppressQualified.filter(id => id === 'qingyun')).toHaveLength(1)
    })

    it('旧存档修复:已有镇压区域自动视为已取得资格', () => {
      const player = usePlayerStore()
      player.suppressedRegions = ['qingyun']
      player.suppressQualified = []
      player.sanitize()
      expect(player.suppressQualified, '老存档不该丢失镇压资格').toContain('qingyun')
    })
  })

  describe('checkSuppression', () => {
    it('战斗次数不足时不触发镇压', () => {
      const player = usePlayerStore()
      player.regionStats.qingyun = {
        totalFights: 10,
        avgRounds: 2,
        avgDamageTakenPct: 0.05,
        consecutiveWins: 10,
        lastUpdateAt: Date.now()
      }

      expect(checkSuppression(player, 'qingyun')).toBe(false)
    })

    it('平均回合数过高时不触发镇压', () => {
      const player = usePlayerStore()
      player.regionStats.qingyun = {
        totalFights: 20,
        avgRounds: 5, // 超过阈值 3
        avgDamageTakenPct: 0.05,
        consecutiveWins: 20,
        lastUpdateAt: Date.now()
      }

      expect(checkSuppression(player, 'qingyun')).toBe(false)
    })

    it('平均受伤过高时不触发镇压', () => {
      const player = usePlayerStore()
      player.regionStats.qingyun = {
        totalFights: 20,
        avgRounds: 2,
        avgDamageTakenPct: 0.15, // 超过阈值 10%
        consecutiveWins: 20,
        lastUpdateAt: Date.now()
      }

      expect(checkSuppression(player, 'qingyun')).toBe(false)
    })

    it('满足所有条件时触发镇压', () => {
      const player = usePlayerStore()
      player.regionStats.qingyun = {
        totalFights: 20,
        avgRounds: 2,
        avgDamageTakenPct: 0.05,
        consecutiveWins: 20,
        lastUpdateAt: Date.now()
      }

      expect(checkSuppression(player, 'qingyun')).toBe(true)
    })

    it('已镇压的区域不重复触发', () => {
      const player = usePlayerStore()
      player.suppressedRegions = ['qingyun']
      player.regionStats.qingyun = {
        totalFights: 20,
        avgRounds: 2,
        avgDamageTakenPct: 0.05,
        consecutiveWins: 20,
        lastUpdateAt: Date.now()
      }

      expect(checkSuppression(player, 'qingyun')).toBe(false)
    })
  })

  describe('settleSuppressedRegions', () => {
    it('无镇压区域时不产出', () => {
      const resources = useResourcesStore()
      const initialStone = { ...resources.spiritStone }

      settleSuppressedRegions(60) // 1 分钟

      expect(resources.spiritStone).toEqual(initialStone)
    })

    it('镇压区域每小时产出灵石', () => {
      const player = usePlayerStore()
      player.major = 3 // 筑基境
      player.suppressedRegions = ['qingyun']
      const resources = useResourcesStore()
      const initialStone = { ...resources.spiritStone }

      // 模拟 1 小时
      settleSuppressedRegions(3600)

      // 应该有灵石增长
      expect(resources.spiritStone.m).toBeGreaterThan(initialStone.m)
    })

    it('镇压区域产出装备并按回收规则处置(入包或化尘)', () => {
      const player = usePlayerStore()
      player.major = 3
      player.suppressedRegions = ['qingyun']
      const inventory = useInventoryStore()
      const resources = useResourcesStore()

      const itemsBefore = inventory.items.length
      const dustBefore = resources.dust
      // 注入固定随机源确保掉落(equipChance 0.4 × 1h > 0.1)——
      // 从前是 mock 全局 Math.random,而 rng 在构造时已抓走原函数,mock 根本管不到
      const total = settleSuppressedRegions(3600, new RandomService(() => 0.1)) // 1 小时

      // 必掉 1 件;处置记账必须自洽:入包则件数+1且不化尘,回收则器灵尘按档位到账且不入包
      expect(total).not.toBeNull()
      expect(total!.equipment).toHaveLength(1)
      const eq = total!.equipment[0]!
      const dustGain = resources.dust - dustBefore
      if (eq.recycled) {
        expect(inventory.items.length).toBe(itemsBefore)
        expect(dustGain).toBe(DECOMPOSE_DUST[qualityDef(eq.quality).rank] ?? 1)
        expect(total!.recycledDust).toBe(dustGain)
      } else {
        expect(inventory.items.length).toBe(itemsBefore + 1)
        expect(dustGain).toBe(0)
        expect(total!.recycledDust).toBe(0)
      }

    })

    it('长时离线装备按次数期望产出,不再被压成每区仅 1 件', () => {
      const player = usePlayerStore()
      player.major = 5
      player.suppressedRegions = ['qingyun']

      // 24h → equipChance = 0.4×24 = 9.6。旧实现 `random < 9.6` 恒真但只掉 1 件;
      // 修复后 floor(9.6)=9 + 零头 60% 概率第 10 件。注入 0 → 零头必中,共 10 件
      const total = settleSuppressedRegions(24 * 3600, new RandomService(() => 0))

      expect(total).not.toBeNull()
      expect(total!.equipment.length).toBeGreaterThan(1)
      expect(total!.equipment).toHaveLength(10)

    })

    it('多个镇压区域同时产出', () => {
      const player = usePlayerStore()
      player.major = 5
      player.suppressedRegions = ['qingyun', 'cangwu']
      const resources = useResourcesStore()
      const initialStone = { ...resources.spiritStone }

      settleSuppressedRegions(3600)

      // 灵石增长应该是两个区域的总和
      const gain = resources.spiritStone.m - initialStone.m
      expect(gain).toBeGreaterThan(0)
    })

    /**
     * 结算逐条遍历镇压表:同一位写两遍(坏档/重复导入)会产出两份灵石。
     * 读档 sanitize 已去重,这里兜住内存里直接塞进来的重复,收益只该结一次。
     */
    it('同一地界写两遍只结算一份收益', () => {
      const player = usePlayerStore()
      player.major = 3

      player.suppressedRegions = ['qingyun']
      const one = settleSuppressedRegions(3600)!
      const singleStone = one.stone

      setActivePinia(createPinia())
      const p2 = usePlayerStore()
      p2.major = 3
      p2.suppressedRegions = ['qingyun', 'qingyun']
      const dup = settleSuppressedRegions(3600)!

      // 同一小时、同一地界:重复条目不该多出一份
      expect(dup.stone, '重复地界不该结算两份灵石').toEqual(singleStone)
    })
  })
})

/**
 * 镇压资格进度 —— 界面与判定共用一份阈值。
 *
 * 三判据(20 战 / 均≤3 回合 / 均受伤≤10%)从前只活在 checkSuppression 内部:
 * 玩家打够了场数却压不住时,界面给不出「你到底差在哪一项」。
 */
describe('镇压资格进度', () => {
  // 本文件顶层的 beforeEach 只覆盖上面那个 describe;新块必须自己起一份干净的 pinia,
  // 否则会接着上一个用例的 store 跑(镇压表/战绩都还留着),断言能过也能假过
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const stats = (over: Partial<RegionStats> = {}): RegionStats => ({
    totalFights: 0,
    avgRounds: 0,
    avgDamageTakenPct: 0,
    consecutiveWins: 0,
    lastUpdateAt: 0,
    ...over
  })

  it('毫无战绩:三判据全不达标,且不显示假的平均值', () => {
    const p = suppressionProgress(undefined)
    expect(p.wins).toBe(0)
    expect(p.hasStats).toBe(false)
    expect([p.winsOk, p.roundsOk, p.damageOk]).toEqual([false, false, false])
    expect(p.qualified).toBe(false)
  })

  it('胜场够但打得久:只有回合项不合格,玩家能看出卡在哪', () => {
    const p = suppressionProgress(stats({ totalFights: 25, avgRounds: 4, avgDamageTakenPct: 0.05 }))
    expect(p.winsOk).toBe(true)
    expect(p.roundsOk).toBe(false)
    expect(p.damageOk).toBe(true)
    expect(p.qualified).toBe(false)
    expect(p.maxAvgRounds).toBe(3)
    expect(p.maxAvgDamagePct).toBe(0.1)
  })

  it('胜场够但挨打多:只有受伤项不合格', () => {
    const p = suppressionProgress(stats({ totalFights: 40, avgRounds: 2, avgDamageTakenPct: 0.3 }))
    expect(p.winsOk).toBe(true)
    expect(p.roundsOk).toBe(true)
    expect(p.damageOk).toBe(false)
    expect(p.qualified).toBe(false)
  })

  it('三判据全达标(阈值取闭区间):qualified 与 checkSuppression 同判', () => {
    const boundary = stats({ totalFights: 20, avgRounds: 3, avgDamageTakenPct: 0.1 })
    expect(suppressionProgress(boundary).qualified).toBe(true)

    const player = usePlayerStore()
    player.regionStats.qingyun = { ...boundary }
    expect(checkSuppression(player, 'qingyun')).toBe(true)
  })
})

/**
 * 镇压速率单一真相源 —— 界面显示的数就是真正入账的数。
 *
 * 历练页从前自己写死 stoneByTier(tier, 150) 并注释「= SUPPRESS_YIELD_PER_HOUR.stoneMultiplier」:
 * 只改 suppress.ts 的倍率时界面照旧显示旧值。此处锁死「界面速率 × 兴衰系数 = 一小时真实入账」。
 */
describe('镇压速率:显示与结算同源', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** 照 AdventureView.rateText 的算法算出界面上的每小时灵石 */
  function uiStonePerHour(regionId: string): number {
    const rate = suppressRateFor(regionId)!
    return toNum(rate.stonePerHour) * prosperityYieldMult(regionRecallFor(regionId).prosperity)
  }

  it('刚镇压(混乱 ×1.0):界面速率 = 一小时入账', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.suppressedRegions = ['qingyun']
    player.suppressedSince = { qingyun: Date.now() }

    const before = { ...resources.spiritStone }
    settleSuppressedRegions(3600, new RandomService(() => 0.99)) // 固定随机源:这一小时不掉装,只比灵石
    const gained = toNum(sub(resources.spiritStone, before))

    expect(gained).toBeGreaterThan(0)
    expect(gained).toBeCloseTo(uiStonePerHour('qingyun'), 6)
  })

  it('守满 6 小时(稳定 ×1.05):界面速率随兴衰上浮,与实际入账一致', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    const now = Date.now()
    player.suppressedRegions = ['qingyun']
    player.suppressedSince = { qingyun: now - 7 * 3600_000 } // 已守 7 小时 → 稳定

    expect(regionRecallFor('qingyun').prosperity).toBe('stable')
    const before = { ...resources.spiritStone }
    settleSuppressedRegions(3600, new RandomService(() => 0.99))
    const gained = toNum(sub(resources.spiritStone, before))

    expect(gained).toBeCloseTo(uiStonePerHour('qingyun'), 6)
    expect(uiStonePerHour('qingyun')).toBeGreaterThan(toNum(suppressRateFor('qingyun')!.stonePerHour))
  })

  /**
   * 结算与界面必须读同一份胜场。
   *
   * 界面(`regionRecallFor`)已改读净胜场 `regionWins`,若结算仍读连败仗也算的
   * `regionStats.totalFights`,同一地界会出现「界面上写着混乱、入账却按繁盛 110%」:
   * 玩家按显示的速率算账,永远对不上。故障注入:把这里改回 totalFights → 红。
   */
  it('连输五十场、刚镇压不到 6 小时:界面混乱,入账也按混乱,不白给繁盛', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.suppressedRegions = ['qingyun']
    player.suppressedSince = { qingyun: Date.now() - 3600_000 } // 守 1 小时,未到稳定
    player.regionStats = {
      qingyun: { totalFights: 200, avgRounds: 9, avgDamageTakenPct: 0.9, consecutiveWins: 0, lastUpdateAt: Date.now() }
    }
    player.regionWins = { qingyun: 0 }

    expect(regionRecallFor('qingyun').prosperity).toBe('chaos')
    const before = { ...resources.spiritStone }
    settleSuppressedRegions(3600, new RandomService(() => 0.99))
    const gained = toNum(sub(resources.spiritStone, before))
    expect(gained).toBeCloseTo(uiStonePerHour('qingyun'), 6)
    expect(gained, '不是繁盛的 110%').toBeCloseTo(toNum(suppressRateFor('qingyun')!.stonePerHour), 6)
  })

  /**
   * 倒计时与「已守多久」必须跟着秒走。
   *
   * 这两处读的都是墙钟,而所在 computed 只依赖 player 的少数字段 —— 停在历练页
   * 不动时不会重算,倒计时会冻在进页那一刻。故障注入:把 now.value 改回
   * `Date.now()` → 本条红(读数再次失去每秒推进的来源)。
   */
  it('历练页的镇压倒计时与已守时长读每秒推进的 now,不直接调 Date.now()', () => {
    const view = readFileSync(resolve(__dirname, '../views/AdventureView.vue'), 'utf8')
    expect(view, '要有一枚每秒推进的读数').toContain('const now = useNow()')
    expect(view, '复聚倒计时读 now.value').toContain('hoursUntilRevive(player.suppressedSince[row.def.id], now.value)')
    expect(view, '已守时长也读同一读数').toContain('(now.value - since) / 3_600_000')
  })

  /**
   * 每秒一跳的读数不该拖着整张区域表重算。
   *
   * `regionRows` 为每处地界跑 `regionEcology` / `detectionAdaptation` /
   * `suppressionProgress`,只依赖「构筑 × 区域」。复聚倒计时一旦写在这个
   * computed 里,`now` 每秒一跳就让它整表重算四十余遍 —— 页面停着不动也在
   * 白烧 CPU。判据:大表里不出现 `now`;倒计时改由 `reviveNow` 就地读秒。
   * 故障注入:把 `reviveInHours` 放回 regionRows → 本条红。
   */
  it('复聚倒计时不写进 regionRows 大表,只让那一格跟秒走', () => {
    const view = readFileSync(resolve(__dirname, '../views/AdventureView.vue'), 'utf8')
    const start = view.indexOf('const regionRows = computed(')
    expect(start, '找不到 regionRows,判据会假绿').toBeGreaterThan(0)
    const end = view.indexOf('\n  /** 出发预览', start)
    expect(end, '找不到 regionRows 的收尾,判据会假绿').toBeGreaterThan(start)
    const body = view.slice(start, end)
    expect(body, 'regionRows 里不该出现每秒一跳的 now').not.toMatch(/\bnow\.value\b/)
    expect(view, '倒计时改成就地读秒的函数').toContain('function reviveNow(')
  })

  /**
   * 「妖气复聚」是落盘的世界状态,不是镇压到点的临时读数。
   *
   * `adventure.revived` 由 core/regionRevival 写入并存档;界面若拿
   * `isReviving(suppressedSince)` 现算,两件事就被混成一件 —— 复聚只在结算
   * 那一瞬的 toast 里露过面,之后再进历练页,地界既没有「妖气复聚」章、
   * 也不说「再历一程即可复靖」,玩家看不出旧主已经回来了。
   * 故障注入:把 `adventure.revived.includes` 改回 `isReviving(...)` → 本条红。
   */
  it('历练页的「妖气复聚」读落盘状态 adventure.revived,不拿镇压到期现算', () => {
    const view = readFileSync(resolve(__dirname, '../views/AdventureView.vue'), 'utf8')
    expect(view, '复聚章与一行指引要读同一份落盘状态').toContain('const revived = adventure.revived.includes(r.id)')
    expect(view, '旧主归来要说出下一步:再历一程即可复靖').toContain('旧主归来,再历一程即可复靖')
  })
})

describe('镇压复苏 · settle 级(72h 复生当拍不产石)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const HOUR = 3600_000

  it('镇压超 72h:settle 自动解除(移出镇压表+since 清掉),复生当拍不产一石', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.major = 5
    player.suppressedRegions = ['qingyun']
    player.suppressedSince = { qingyun: Date.now() - 73 * HOUR }
    const before = { ...resources.spiritStone }
    const total = settleSuppressedRegions(3600, new RandomService(() => 0.1))
    // 复生:移出镇压表、since 清掉
    expect(player.suppressedRegions).not.toContain('qingyun')
    expect(player.suppressedSince['qingyun'], '复生后 since 应被删').toBeUndefined()
    // 复生当拍不产石(active 已空 → 返回 null、一石不动)
    expect(resources.spiritStone).toEqual(before)
    expect(total).toBeNull()
  })

  it('未满 72h:仍镇压、且产出灵石(正对照:测试不是空转)', () => {
    const player = usePlayerStore()
    const resources = useResourcesStore()
    player.major = 5
    player.suppressedRegions = ['qingyun']
    player.suppressedSince = { qingyun: Date.now() - 1 * HOUR }
    const before = { ...resources.spiritStone }
    settleSuppressedRegions(3600, new RandomService(() => 0.1))
    expect(player.suppressedRegions, '不满 72h 不该自行解除').toContain('qingyun')
    expect(resources.spiritStone.m, '仍在镇压期间应照常产石').toBeGreaterThan(before.m)
  })

  it('两区并存:只有超 72h 的复苏,未满 72h 的照常留着(逐区独立判定)', () => {
    const player = usePlayerStore()
    player.major = 5
    player.suppressedRegions = ['qingyun', 'cangwu']
    player.suppressedSince = { qingyun: Date.now() - 73 * HOUR, cangwu: Date.now() - 1 * HOUR }
    settleSuppressedRegions(3600, new RandomService(() => 0.1))
    expect(player.suppressedRegions).not.toContain('qingyun')
    expect(player.suppressedRegions).toContain('cangwu')
  })
})
