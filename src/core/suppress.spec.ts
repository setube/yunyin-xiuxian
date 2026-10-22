import { describe, it, expect, beforeEach, vi } from 'vitest'
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
import { gnZero, mulN, sub, toNum } from '@/utils/gnum'
import { formatGN } from '@/utils/format'
import { RandomService } from '@/utils/random'
import {
  checkSuppression,
  settleSuppressedRegions,
  suppressionEquipmentLuck,
  suppressionExpRate,
  suppressRateFor,
  suppressRateLine,
  suppressionProgress,
  suppressYield,
  type RegionStats
} from './suppress'
import * as equipGen from './equipGen'
import { prosperityYieldMult, regionRecallFor } from './worldMemory'

describe('区域镇压系统', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /**
   * 镇压产出行文案(灵石/时 × 物产,乘兴衰):界面与「镇压达成」回执共用 suppressRateLine ——
   * 无手抄的证据:开头那段灵石用的就是速率表同源数字(同一组原语算出来的)。
   */
  it('suppressRateLine:产出行带数,且与速率表同源', () => {
    const id = 'wanyao' // 万妖林:forest → 灵草 6/h
    const mult = prosperityYieldMult('flourish')
    const line = suppressRateLine(id, 'flourish')
    expect(line).toContain(`${formatGN(mulN(suppressRateFor(id)!.stonePerHour, mult))}灵石/时`)
    // 灵草名带品阶前缀(「凡品灵草」),量词仍是「N/时」
    expect(line).toMatch(/ · \S*灵草\d+\/时$/)
  })

  it('suppressRateLine:无人产出的地界也不印出半行残句', () => {
    expect(suppressRateLine('not-a-region', 'chaos')).toBe('—')
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
    /**
     * 在线一秒一 tick 时,物产零头必须攒起来,不能每拍被取整吞掉。
     *
     * 病灶是纯算术:`perHour × (1/3600)` 恒小于 1,`Math.floor` 之后永远是 0 ——
     * 在线压着林区挂一整天收不到一件草,离线一次结算同样时长却拿满,「在线收租」
     * 这条玩法在物产上等于不存在。断言读的是**结算返回的物产**(不读库存),
     * 免得响应的存档水合把读数抬起来、把旧病灶盖过去。故障注入:结算改回
     * `Math.floor(yieldDef.perHour * hours * yieldMult)` → 本条红。
     */
    it('在线每 tick 一秒:物产零头攒够就入账(不会被取整吞掉)', () => {
      const player = usePlayerStore()
      player.major = 5
      player.suppressedRegions = ['wanyao'] // 万妖林:灵草 11/h
      player.suppressedSince = { wanyao: Date.now() }

      // 逐 tick 一秒,把每次结算返回的灵草加总;零头攒在 store 里跨 tick 结转
      let online = 0
      for (let i = 0; i < 3600; i++) {
        const tick = settleSuppressedRegions(1)
        online += tick?.resources.find(r => r.id === 'herb')?.amount ?? 0
      }

      expect(online, '在线长挂拿不到物产即是旧病灶').toBeGreaterThanOrEqual(10)
      // 零头留在累积器里(0 ≤ 零头 < 1),不会凭空多算
      expect(player.suppressFrac['wanyao'] ?? 0).toBeGreaterThanOrEqual(0)
      expect(player.suppressFrac['wanyao'] ?? 0).toBeLessThan(1)
    })

    /**
     * 在线逐 tick 与离线一次折算必须落在**同一本账**上。
     *
     * 结算读的是同一份「每小时产出 × 时长 × 兴衰」,若在线逐 tick 每次都取整,
     * 两者就会差出一整段的零头 —— 挂一小时在线与离线一次结算是同一件事,
     * 分叉即说明有一边在丢零头。两条路各起一个干净的 pinia,只比结算产出。
     */
    it('在线分段与离线一次折算等价:同样是 1 小时,入账株数一致', () => {
      const player = usePlayerStore()
      player.major = 5
      player.suppressedRegions = ['wanyao']
      player.suppressedSince = { wanyao: Date.now() }
      let online = 0
      for (let i = 0; i < 3600; i++) {
        const tick = settleSuppressedRegions(1)
        online += tick?.resources.find(r => r.id === 'herb')?.amount ?? 0
      }

      setActivePinia(createPinia())
      const p2 = usePlayerStore()
      p2.major = 5
      p2.suppressedRegions = ['wanyao']
      p2.suppressedSince = { wanyao: Date.now() }
      const once = settleSuppressedRegions(3600)
      const offline = once?.resources.find(r => r.id === 'herb')?.amount ?? 0

      expect(offline, '离线一次折算应给足整件').toBeGreaterThan(0)
      expect(online, `在线 ${online} vs 离线 ${offline}`).toBe(offline)
    })

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

    /**
     * 镇守道韵:镇压不再只回灵石/物产/装备 —— 每镇压一区,一小时按挂机修速 +8%
     * 折算修为(封顶 +40%,5 区满)。同源挂机曲线,故红利在任何境界都是挂机的固定加成。
     */
    describe('镇守道韵(修为红利)与老区装备成长', () => {
      it('红利速率:每镇压一区 +8%,封顶 +40%', () => {
        expect(suppressionExpRate(0)).toBe(0)
        expect(suppressionExpRate(1)).toBeCloseTo(0.08, 9)
        expect(suppressionExpRate(3)).toBeCloseTo(0.24, 9)
        expect(suppressionExpRate(7), '第七区起已顶到 40%').toBeCloseTo(0.4, 9)
      })

      it('坏档挡在门口:负区数 / NaN / Infinity 一律 0,不让倍率变负或变 NaN', () => {
        expect(suppressionExpRate(-3)).toBe(0)
        expect(suppressionExpRate(Number.NaN)).toBe(0)
        expect(suppressionExpRate(Number.POSITIVE_INFINITY)).toBe(0)
      })

      it('老区装备气运:镇满一天 +0.1,封顶 +0.8', () => {
        const now = Date.now()
        expect(suppressionEquipmentLuck(now, now)).toBe(0)
        expect(suppressionEquipmentLuck(now - 86_400_000 * 2, now)).toBeCloseTo(0.2, 9)
        expect(suppressionEquipmentLuck(now - 86_400_000 * 12, now)).toBeCloseTo(0.8, 9)
      })

      it('坏档时钟:未来时刻与 NaN 一律 0,不给负气运也不给 NaN', () => {
        const now = Date.now()
        expect(suppressionEquipmentLuck(now + 86_400_000 * 5, now)).toBe(0)
        expect(suppressionEquipmentLuck(Number.NaN, now)).toBe(0)
      })

      it('结算:镇压两区一小时,修为红利 = 修速 × 16%', () => {
        const player = usePlayerStore()
        player.suppressedRegions = ['qingyun', 'wanyao']
        player.suppressedSince = { qingyun: Date.now(), wanyao: Date.now() }
        const cult = player.cultPerSec
        const before = toNum(player.exp)
        const total = settleSuppressedRegions(3600)
        expect(total).not.toBeNull()
        const gained = toNum(player.exp) - before
        expect(gained).toBeCloseTo(cult * 0.16, 6)
        expect(toNum(total!.expGain)).toBeCloseTo(cult * 0.16, 6)
      })

      /**
       * 故障注入:把结算里的 `suppressionEquipmentLuck(since, now)` 改回裸 ` luck: 0 }`,
       * 长守区掉出的装备气运就不再随守时抬升 —— 本条按「生成器真的收到非零 luck」判。
       */
      it('守满两天的镇压区,掉落装备带非零气运(与裸运气 0 分叉)', () => {
        vi.spyOn(equipGen, 'generateEquipment')
        const player = usePlayerStore()
        player.suppressedRegions = ['qingyun']
        player.suppressedSince = { qingyun: Date.now() - 86_400_000 * 2 }
        settleSuppressedRegions(24 * 3600, new RandomService(() => 0))
        expect(equipGen.generateEquipment).toHaveBeenCalled()
        const opts = vi.mocked(equipGen.generateEquipment).mock.calls[0]![2]!
        expect(opts.luck, '守满两天该带 0.2 气运').toBeCloseTo(0.2, 9)
        expect(opts.minQualityRank, '镇压产出仍走品质窗口').toBeUndefined()
      })
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
    // 计时两列随地界卡迁走:判据随本体走,读卡片而不是页面
    const card = readFileSync(resolve(__dirname, '../components/adventure/RegionCard.vue'), 'utf8')
    expect(card, '要有一枚每秒推进的读数').toContain('const now = useNow()')
    expect(card, '复聚倒计时读 now.value').toContain('now.value')
    // 钉住实参:查「调了 hoursUntilRevive」的话,把读秒换回 Date.now() 也照样绿;
    // 只查 now.value 又看不出喂进去的是哪一份钟 —— 两份都要钉
    expect(card, '复聚倒计时读同一份剩余小时').toContain(
      'hoursUntilRevive(regionReviveClock(props.row.def.id), now.value)'
    )
    expect(card, '复聚倒计时喂的是结算用的那一份钟,不是单看镇压时刻').not.toContain(
      'hoursUntilRevive(player.suppressedSince[props.row.def.id], now.value)'
    )
    expect(card, '已守时长也读同一读数').toContain('(now.value - since) / 3_600_000')
  })

  /**
   * 兴衰章与产出速率也必须跟同一枚游戏钟走。
   *
   * 这两处此前读 `row.recall`(区域大表进页时算好的静态快照):停在历练页
   * 守满 6 / 24 小时不会翻档。故障注入:把卡片改回 `props.row.recall` 或
   * `regionRecallFor(props.row.def.id)`(无 now 实参) → 本条红。
   */
  it('兴衰章与镇压速率按 now 就地重算,不读区域大表的静态快照', () => {
    const card = readFileSync(resolve(__dirname, '../components/adventure/RegionCard.vue'), 'utf8')
    expect(card, '兴衰要由卡片就地派生').toContain('const recall = computed(() => regionRecallFor(props.row.def.id, now.value))')
    expect(card, '速率读同一份兴衰').toContain('suppressRateLine(props.row.def.id, recall.value.prosperity)')
    expect(card, '不许再读大表里的静态快照').not.toMatch(/props\.row\.recall/)

    const rows = readFileSync(resolve(__dirname, '../composables/useRegionRows.ts'), 'utf8')
    expect(rows, '区域大表不该再持有第二份兴衰').not.toMatch(/\brecall\s*:/)
    expect(rows, '区域大表不该再调用 regionRecallFor').not.toContain('regionRecallFor')
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
    const rows = readFileSync(resolve(__dirname, '../composables/useRegionRows.ts'), 'utf8')
    const start = rows.indexOf('const regionRows = computed<RegionRow[]>(')
    expect(start, '找不到 regionRows,判据会假绿').toBeGreaterThan(0)
    const end = rows.indexOf('\n  const visibleRows', start)
    expect(end, '找不到 regionRows 的收尾,判据会假绿').toBeGreaterThan(start)
    const body = rows.slice(start, end)
    expect(body, 'regionRows 里不该出现每秒一跳的 now').not.toMatch(/\bnow\.value\b/)
    expect(body, '大表里也不许直接读墙钟 —— 秒针会拖着整表重算').not.toContain('Date.now(')
    expect(body, '大表连 useNow 都不该引入').not.toContain('useNow')
    const card = readFileSync(resolve(__dirname, '../components/adventure/RegionCard.vue'), 'utf8')
    expect(card, '倒计时改成就地读秒的 computed').toContain('const reviveNow = computed(')
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
    const rows = readFileSync(resolve(__dirname, '../composables/useRegionRows.ts'), 'utf8')
    expect(rows, '复聚章与一行指引要读同一份落盘状态').toContain('const revived = adventure.revived.includes(r.id)')
    const view = readFileSync(resolve(__dirname, '../components/adventure/RegionCard.vue'), 'utf8')
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
    // 复生当拍不产一石:镇压早在 72 小时前就到期,这一小时的租一分不该收
    expect(resources.spiritStone).toEqual(before)
    expect(toNum(total?.stone ?? gnZero()), '越界那一拍没收着租').toBe(0)
    expect(toNum(total?.expGain ?? gnZero()), '道韵也不该为已复聚的地界结算').toBe(0)
    expect(total?.equipment ?? []).toHaveLength(0)
    expect(total?.resources ?? []).toHaveLength(0)
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

  /**
   * 离线整段跨越复聚线:前 72 小时照收,72 小时起回到历练地。
   *
   * 回归点:复聚从前排在收益之前、且与收益共用一个墙钟。离线 80 小时、洞府
   * 满级(cap 72h)时,复聚在**开头**就被判真,镇压当场松开,本该拿到的 72 小时
   * 镇压收益一分不剩 —— 归来卷轴上连「镇压诸域仍有余韵」那一行都不出现。
   *
   * 现在收益按 dt 结、复聚按 worldAt 判,且收益逐区只结到复聚那一刻为止。
   */
  it('离线 80 小时跨过复聚线:仍结满 72 小时的租,镇压随之松开', () => {
    const T0 = Date.now() - 80 * HOUR
    const player = usePlayerStore()
    player.major = 5
    player.suppressedRegions = ['qingyun']
    player.suppressedSince = { qingyun: T0 }

    // dt = 72h(洞府满级的离线上限),worldAt = 真实的此刻(80 小时后)
    const total = settleSuppressedRegions(72 * 3600, new RandomService(() => 0.1), T0 + 80 * HOUR)
    expect(toNum(total?.stone ?? gnZero()), '72 小时的租要一分不少').toBeGreaterThan(0)
    expect(player.suppressedRegions, '跨过复聚线就该松开').not.toContain('qingyun')
  })

  it('离线整段未跨复聚线:照旧全收,镇压不动', () => {
    const T0 = Date.now() - 40 * HOUR
    const player = usePlayerStore()
    player.major = 5
    player.suppressedRegions = ['qingyun']
    player.suppressedSince = { qingyun: T0 }
    const total = settleSuppressedRegions(40 * 3600, new RandomService(() => 0.1), T0 + 40 * HOUR)
    expect(toNum(total?.stone ?? gnZero())).toBeGreaterThan(0)
    expect(player.suppressedRegions).toContain('qingyun')
  })

  it('一段正好跨在复聚线上:只结到复聚那一刻,不收越界的那一截', () => {
    // 镇压起于 T0,第 72 小时复聚。本段从第 71 小时跑到第 74 小时(3 小时),
    // 于是只该收 1 小时(71→72),后 2 小时已回到历练地。
    const T0 = Date.now() - 74 * HOUR
    const player = usePlayerStore()
    player.major = 5
    player.suppressedRegions = ['qingyun']
    player.suppressedSince = { qingyun: T0 }
    const full = settleSuppressedRegions(3 * 3600, new RandomService(() => 0.1), T0 + 74 * HOUR)
    const fullStone = toNum(full?.stone ?? gnZero())

    // 正对照:同样 3 小时但整段都在镇压期内(起于第 10 小时)
    setActivePinia(createPinia())
    const T1 = Date.now() - 13 * HOUR
    const player2 = usePlayerStore()
    player2.major = 5
    player2.suppressedRegions = ['qingyun']
    player2.suppressedSince = { qingyun: T1 }
    const whole = settleSuppressedRegions(3 * 3600, new RandomService(() => 0.1), T1 + 13 * HOUR)
    const wholeStone = toNum(whole?.stone ?? gnZero())

    // 1 小时的租约为 3 小时的三分之一;越界的那两小时一分不多收
    expect(fullStone, '跨线那一段只结到复聚时刻').toBeGreaterThan(0)
    expect(fullStone, '不收越界的那一截').toBeLessThan(wholeStone)
    expect(fullStone).toBeCloseTo(wholeStone / 3, -3)
    expect(player.suppressedRegions, '跨线就该松开').not.toContain('qingyun')
  })
})
