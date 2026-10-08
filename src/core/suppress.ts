/**
 * 区域镇压系统 —— Phase 30.1
 *
 * 当玩家对某区域形成绝对优势后,该区域从主动玩法退出,变成被动收益源。
 * 核心理念:"成长改变世界",而非"世界永远跟着你缩放"。
 */

import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { useUiStore } from '@/stores/ui'
import { regionDef } from '@/data/regions'
import { herbGradeOfMajor } from '@/data/herbGrades'
import { stoneByTier } from '@/core/formulas'
import { generateEquipment } from '@/core/equipGen'
import { acquireEquipment } from '@/core/loot'
import { rng, type RandomService } from '@/utils/random'
import { gnZero, add } from '@/utils/gnum'
import type { GNum, QualityId } from '@/types'
import { equipmentTemplate } from '@/data/equipment'
import { deriveProsperity, isReviving, prosperityYieldMult } from './worldMemory'

/** 区域统计数据(使用指数移动平均) */
export interface RegionStats {
  totalFights: number
  avgRounds: number          // 指数移动平均回合数
  avgDamageTakenPct: number  // 指数移动平均受伤百分比
  consecutiveWins: number
  lastUpdateAt: number
}

/** 镇压判定阈值(界面也用它写规则说明,避免两处各写一套数字) */
export const SUPPRESS_THRESHOLDS = {
  minFights: 20,              // 最少战斗次数
  maxAvgRounds: 3,            // 平均回合数上限
  maxAvgDamageTaken: 0.10,    // 平均受伤百分比上限 10%
}

/** 镇压收益(每小时基础倍率) */
const SUPPRESS_YIELD_PER_HOUR = {
  stoneMultiplier: 150,       // 灵石倍率
  equipmentChance: 0.4,       // 装备掉落概率
}

/**
 * 地界物产 —— 灵石之外,按地界气质给一份次级产出。
 *
 * 为什么要有它:只给灵石的话,"镇压哪几处"退化成"挑层级最高的那几处",
 * 没有取舍。接上物产后,火域出矿、林区出草、秘境出残页、天界以上出尘,
 * 于是「我这一世缺什么,就镇守哪一片」才成为真问题。
 *
 * 取值按标签优先表逐条匹配(与地界自身标签顺序无关,保证确定),
 * 产量随层级线性放大(灵材是小标量,不跟着灵石做指数)。
 */
type SuppressResource = 'herb' | 'ore' | 'page' | 'dust'

const YIELD_BY_TAG: { tag: string; resource: SuppressResource; perHour: number }[] = [
  { tag: 'forest', resource: 'herb', perHour: 6 },
  { tag: 'water', resource: 'herb', perHour: 5 },
  { tag: 'ice', resource: 'herb', perHour: 4 },
  { tag: 'fire', resource: 'ore', perHour: 4 },
  { tag: 'thunder', resource: 'ore', perHour: 3 },
  { tag: 'mountain', resource: 'ore', perHour: 3 },
  { tag: 'ruin', resource: 'page', perHour: 2 },
  { tag: 'sword', resource: 'page', perHour: 2 },
  { tag: 'dark', resource: 'dust', perHour: 2 },
  { tag: 'sky', resource: 'dust', perHour: 2 },
  { tag: 'immortal', resource: 'dust', perHour: 3 },
  { tag: 'god', resource: 'page', perHour: 3 },
  { tag: 'chaos', resource: 'dust', perHour: 4 }
]

const RESOURCE_NAMES: Record<SuppressResource, string> = {
  herb: '灵草',
  ore: '玄铁',
  page: '功法残页',
  dust: '器灵尘'
}

/** 某地界的物产(无匹配标签则无次级产出) */
export function suppressYield(regionId: string): { id: SuppressResource; name: string; perHour: number } | null {
  const region = regionDef(regionId)
  if (!region) return null
  const hit = YIELD_BY_TAG.find(y => region.eventTags.includes(y.tag))
  if (!hit) return null
  // 层级越高,同一物产的产出越丰(线性,不参与灵石的指数口径)
  const perHour = Math.round(hit.perHour * (1 + region.tier * 0.15))
  return { id: hit.resource, name: RESOURCE_NAMES[hit.resource], perHour }
}

/**
 * 判定玩家是否已镇压某区域
 * 条件:≥20 战,平均回合 ≤3,平均受伤 ≤10%
 */
export function checkSuppression(player: ReturnType<typeof usePlayerStore>, regionId: string): boolean {
  if (player.suppressedRegions.includes(regionId)) return false

  const p = suppressionProgress(player.regionStats[regionId])
  return p.fightsOk && p.roundsOk && p.damageOk
}

/**
 * 镇压资格进度 —— 三条判据各差多少,给界面直接把未达标项指出来。
 *
 * 从前三条阈值(20 战 / 均≤3 回合 / 均受伤≤10%)只活在 checkSuppression 里,
 * 玩家只看到「能不能镇压」这个结果,看不到自己卡在哪一项上 —— 打够了场数却总压不住时,
 * 唯一的解释渠道是去读源码。纯函数:吃 stats,不碰 store,便于断言。
 */
export interface SuppressionProgress {
  fights: number
  needFights: number
  /** 指数移动平均回合数;无战绩时为 Infinity(界面据此不显示假平均值) */
  avgRounds: number
  maxAvgRounds: number
  /** 指数移动平均受伤百分比(0~1,界面乘 100 显示);无战绩时为 1 */
  avgDamagePct: number
  maxAvgDamagePct: number
  fightsOk: boolean
  roundsOk: boolean
  damageOk: boolean
  /** 是否已有战绩可谈平均值 */
  hasStats: boolean
  /** 三条判据是否全部满足(不含「是否已镇压」) */
  qualified: boolean
}

export function suppressionProgress(stats: RegionStats | undefined): SuppressionProgress {
  const fights = Math.max(0, stats?.totalFights ?? 0)
  const hasStats = fights > 0
  const avgRounds = stats ? stats.avgRounds : Number.POSITIVE_INFINITY
  const avgDamagePct = stats ? stats.avgDamageTakenPct : 1
  const fightsOk = fights >= SUPPRESS_THRESHOLDS.minFights
  const roundsOk = avgRounds <= SUPPRESS_THRESHOLDS.maxAvgRounds
  const damageOk = avgDamagePct <= SUPPRESS_THRESHOLDS.maxAvgDamageTaken
  return {
    fights,
    needFights: SUPPRESS_THRESHOLDS.minFights,
    avgRounds,
    maxAvgRounds: SUPPRESS_THRESHOLDS.maxAvgRounds,
    avgDamagePct,
    maxAvgDamagePct: SUPPRESS_THRESHOLDS.maxAvgDamageTaken,
    fightsOk,
    roundsOk,
    damageOk,
    hasStats,
    qualified: fightsOk && roundsOk && damageOk
  }
}

/** 某地界镇压产出的每小时速率(灵石 + 物产)—— 界面与结算共用这一份口径 */
export interface SuppressRate {
  stonePerHour: GNum
  resource: { id: SuppressResource; name: string; perHour: number } | null
}

/**
 * 某地界**基础**镇压速率(未乘兴衰系数;繁荣度加成由界面另行叠加展示)。
 *
 * 从前历练页自己写了一份 stoneByTier(tier, 150) 并注释「= SUPPRESS_YIELD_PER_HOUR.stoneMultiplier」,
 * 调常数的那一刻界面就开始撒谎。速率只留这一份实现。
 */
export function suppressRateFor(regionId: string): SuppressRate | null {
  const region = regionDef(regionId)
  if (!region) return null
  return {
    stonePerHour: stoneByTier(region.tier, SUPPRESS_YIELD_PER_HOUR.stoneMultiplier),
    resource: suppressYield(regionId)
  }
}

/**
 * 结算已镇压区域的被动收益(每小时产出灵石和装备)
 * 由 GameEngine 每 tick 调用
 * 返回累计收益(供离线结算展示)
 */
export interface SuppressedYield {
  stone: GNum
  equipment: { name: string; quality: QualityId; recycled?: boolean; uid?: string }[]
  /** 化尘所得的器灵尘(自动回收/满包化尘/腾位化掉的旧件;由 acquireEquipment 记账) */
  recycledDust: number
  /** 各地界的物产累计(灵草/玄铁/残页/器灵尘) */
  resources: { id: SuppressResource; name: string; amount: number }[]
}

export function settleSuppressedRegions(dt: number, service: RandomService = rng): SuppressedYield | null {
  const player = usePlayerStore()
  const resources = useResourcesStore()

  if (player.suppressedRegions.length === 0) return null

  const hours = dt / 3600
  const total: SuppressedYield = { stone: gnZero(), equipment: [], recycledDust: 0, resources: [] }
  const now = Date.now()

  // Phase 30.9:复苏判定 —— 镇压超过 72h 无活动,区域妖气再聚,自动解除镇压
  const revived: string[] = []
  for (const regionId of player.suppressedRegions) {
    if (isReviving(player.suppressedSince[regionId], now)) revived.push(regionId)
  }
  if (revived.length > 0) {
    for (const regionId of revived) player.unsuppressRegion(regionId)
    const names = revived.map(id => regionDef(id)?.name ?? id).join('、')
    useUiStore().toast(`${names}妖气复聚,镇压松动——此地重新成为历练之地`, 'info')
    // 复苏后本 tick 不再为这些区域结算
  }
  const active = player.suppressedRegions.filter(id => !revived.includes(id))
  if (active.length === 0) return null

  for (const regionId of active) {
    const region = regionDef(regionId)
    if (!region) continue

    // Phase 30.9:长期安稳 → 灵脉渐复(收益 99%);繁盛 → 商旅(100%)
    const recall = deriveProsperity({
      totalWins: player.regionStats[regionId]?.totalFights ?? 0,
      hasSuppressed: true,
      suppressedAt: player.suppressedSince[regionId],
      lastActivityAt: player.regionStats[regionId]?.lastUpdateAt ?? now,
      now
    })
    const yieldMult = prosperityYieldMult(recall.prosperity)

    // 灵石产出:基础倍率 × 区域阶位 × 时间 × 兴衰微调
    const stoneYield = stoneByTier(region.tier, SUPPRESS_YIELD_PER_HOUR.stoneMultiplier * hours * yieldMult)
    resources.addStone(stoneYield)
    total.stone = add(total.stone, stoneYield)

    // 物产:按地界气质给一份次级产出(灵材是小标量,随层级线性增长)
    const yieldDef = suppressYield(regionId)
    if (yieldDef) {
      const amount = Math.floor(yieldDef.perHour * hours * yieldMult)
      if (amount > 0) {
        if (yieldDef.id === 'herb') resources.addHerb(herbGradeOfMajor(region.minRealm), amount)
        else resources.addSmall(yieldDef.id, amount)
        const row = total.resources.find(r => r.id === yieldDef.id)
        if (row) row.amount += amount
        else total.resources.push({ id: yieldDef.id, name: yieldDef.name, amount })
      }
    }

    // 装备掉落:次数期望结算(0.4件/h × 时长)。不能用 Math.random()<equipChance:
    // hours>2.5 时概率>1 恒真,离线一晚上每区只掉 1 件,与在线 0.4/h 的线性产出
    // 差出好几倍。拆成「整数件 + 零头概率」:hours<1 时与原概率判定等价,长时离线才对齐
    const equipChance = SUPPRESS_YIELD_PER_HOUR.equipmentChance * hours
    // 零头与装备生成走同一个可注入随机源:从前这里裸调 Math.random(生成装备却用 rng),
    // 测试只能去 mock 全局 Math.random,而 rng 在构造时就把原函数抓走了 —— 注入才是可测的那条路
    const equipCount = Math.floor(equipChance) + (service.chance(equipChance - Math.floor(equipChance)) ? 1 : 0)
    for (let i = 0; i < equipCount; i += 1) {
      // 不传品质下限:传了(哪怕是 0)品质窗口就失效,镇压产出会比历练掉落更容易出低阶高品
      const equip = generateEquipment(region.tier, service, { luck: 0 })
      const res = acquireEquipment(equip, { quiet: true }) // quiet=true 避免镇压收益刷屏
      // 所得清单如实记下每一件产出:入包与否都列,未入包(自动回收/满包化尘)标注回收
      total.equipment.push({
        name: equipmentTemplate(equip.templateId)?.name ?? '未知',
        quality: equip.quality,
        recycled: !res.bagged,
        uid: res.bagged ? equip.uid : undefined
      })
      // 腾位时新件入了包、旧件化了尘:那份尘与那件旧物都要记上,只看 bagged 会漏报
      total.recycledDust += res.dust
    }
  }

  return total
}

// ============ 区域凭吊叙事(Phase 31.4)============

/** 凭吊触发概率(低,4%) */
export const MEMORIAL_CHANCE = 0.04

/**
 * 待念:进入已被你镇压的区域时,低概率触发一段"世界记得你"的叙事。
 * 纯文案,无奖励无属性。
 */
export function memorialLine(regionId: string, player: ReturnType<typeof usePlayerStore>): string | null {
  const since = player.suppressedSince[regionId]
  if (since === undefined) return null
  const region = regionDef(regionId)
  if (!region) return null
  const years = Math.max(1, Math.floor((Date.now() - since) / 31_536_000)) // 现实秒 → ~年
  return [
    `行至${region.name},山道两侧立着两块石碑——一块刻着你的道号,另一块是空的。`,
    `你镇压此地已逾${years}载,此方妖邪至今不敢再聚。`,
    `守道的山民见你,愣了愣,拱手道:「是你。上回一别,已是多年。」`
  ].join('')
}
