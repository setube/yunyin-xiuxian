/** 区域镇压:对某区域形成绝对优势后,该区域退出主动玩法,转为被动收益源。 */

import { usePlayerStore } from '@/stores/player'
import { useResourcesStore } from '@/stores/resources'
import { regionDef } from '@/data/regions'
import { herbGradeOfMajor, HERB_GRADE_SHORT } from '@/data/herbGrades'
import type { HerbGrade } from '@/data/herbGrades'
import { stoneByTier } from '@/core/formulas'
import { generateEquipment } from '@/core/equipGen'
import { acquireEquipment } from '@/core/loot'
import { rng, type RandomService } from '@/utils/random'
import { gnZero, add, isZero, mulN, gn } from '@/utils/gnum'
import { formatGN } from '@/utils/format'
import type { GNum, QualityId, RegionRecall } from '@/types'
import { equipmentTemplate } from '@/data/equipment'
import { deriveProsperity, prosperityYieldMult, regionReviveClock, regionWinsOfThisLife, REVIVE_AFTER_HOURS } from './worldMemory'
import { settleRegionRevivals } from './regionRevival'
import { AGE_YEARS_PER_HOUR } from '@/data/constants'

/** 区域统计数据(指数移动平均) */
export interface RegionStats {
  /** 只记胜场:在线 `runBattle` 的 `updateRegionStats` 位于 `if (result.win)` 内。字段名沿用旧档 */
  totalFights: number
  avgRounds: number          // 指数移动平均回合数
  avgDamageTakenPct: number  // 指数移动平均受伤百分比
  consecutiveWins: number
  lastUpdateAt: number
  /**
   * 战绩所属世号,与 `player.suppressLife` 同一把世号。
   * 战绩跨世保留,镇压判据只认本世战绩(否则新世打赢一场即按旧世战绩自动重新镇压);
   * 老档无此栏按当前世认(不追溯没收)。
   */
  life?: number
}

/** 镇压判定阈值;界面规则说明同源 */
export const SUPPRESS_THRESHOLDS = {
  minWins: 20,                // 最少胜场(败场不计)
  maxAvgRounds: 3,            // 平均回合数上限
  maxAvgDamageTaken: 0.10,    // 平均受伤百分比上限
}

/** 镇压收益(每小时基础倍率) */
const SUPPRESS_YIELD_PER_HOUR = {
  stoneMultiplier: 150,       // 灵石倍率
  equipmentChance: 0.4,       // 装备期望件数/时
}

/** 镇守道韵:每镇压一区,修为按挂机修速 +8%;封顶 +40%(5 区) */
export const SUPPRESS_EXP_PER_REGION = 0.08
export const SUPPRESS_EXP_MAX = 0.4

/** 老镇压区装备运气:每镇满一天 +0.1,封顶 +0.8 */
export const SUPPRESS_EQUIP_LUCK_CAP = 0.8
export const SUPPRESS_EQUIP_LUCK_PER_DAY = 0.1

/** 镇守道韵倍率:乘在挂机曲线(cultPerSec × 时长)上,与境界无关 */
export function suppressionExpRate(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0
  return Math.min(count * SUPPRESS_EXP_PER_REGION, SUPPRESS_EXP_MAX)
}

/** 老镇压区的装备运气;坏档(非有限、未来时刻)夹到 0,防负运气或 NaN 进品质权重 */
export function suppressionEquipmentLuck(sinceMs: number, nowMs: number): number {
  const days = Math.floor(Math.max(0, nowMs - sinceMs) / 86_400_000)
  if (!Number.isFinite(days)) return 0
  return Math.min(SUPPRESS_EQUIP_LUCK_CAP, days * SUPPRESS_EQUIP_LUCK_PER_DAY)
}

/**
 * 地界物产:灵石之外的次级产出。
 * 按标签优先表顺序逐条匹配(与地界自身标签顺序无关);产量随层级线性放大,不走灵石的指数口径。
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
  const perHour = Math.round(hit.perHour * (1 + region.tier * 0.15))
  // 灵草名带品阶:结算按 region.minRealm 的品入账;其余物产无品
  const name =
    hit.resource === 'herb'
      ? `${HERB_GRADE_SHORT[herbGradeOfMajor(region.minRealm)]}灵草`
      : RESOURCE_NAMES[hit.resource]
  return { id: hit.resource, name, perHour }
}

/** 判定玩家是否已镇压某区域:胜 ≥20 场、平均回合 ≤3、平均受伤 ≤10%(只数胜场) */
export function checkSuppression(player: ReturnType<typeof usePlayerStore>, regionId: string): boolean {
  if (player.suppressedRegions.includes(regionId)) return false

  const p = suppressionProgress(player.regionStats[regionId], currentLifeOf(player))
  return p.winsOk && p.roundsOk && p.damageOk
}

/** 此刻的世号:`suppressLife` 落笔镇压时才盖章,未镇压过时为哨兵 −1,不能当世号读 */
export function currentLifeOf(player: ReturnType<typeof usePlayerStore>): number {
  return player.suppressLife >= 0 ? player.suppressLife : player.reincarnation.count
}

/**
 * 镇压资格进度:三条判据各差多少,供界面指出未达标项。
 * `wins` 读 `RegionStats.totalFights`(只记胜场);离线败场写进地界账会给挂机开出镇压捷径。
 */
export interface SuppressionProgress {
  wins: number
  needWins: number
  /** 指数移动平均回合数;无战绩时为 Infinity */
  avgRounds: number
  maxAvgRounds: number
  /** 指数移动平均受伤百分比(0~1);无战绩时为 1 */
  avgDamagePct: number
  maxAvgDamagePct: number
  winsOk: boolean
  roundsOk: boolean
  damageOk: boolean
  /** 是否已有战绩 */
  hasStats: boolean
  /** 三条判据是否全部满足(不含「是否已镇压」) */
  qualified: boolean
}

export function suppressionProgress(
  stats: RegionStats | undefined,
  life?: number
): SuppressionProgress {
  // 只认本世战绩;无世号(老档、未传 life、哨兵 <0)按本世认,不追溯没收
  const knownLife = life !== undefined && life >= 0 ? life : undefined
  const fromThisLife = knownLife === undefined || stats?.life === undefined || stats.life < 0 || stats.life === knownLife
  const src = fromThisLife ? stats : undefined
  const wins = Math.max(0, src?.totalFights ?? 0)
  const hasStats = wins > 0
  const avgRounds = src ? src.avgRounds : Number.POSITIVE_INFINITY
  const avgDamagePct = src ? src.avgDamageTakenPct : 1
  const winsOk = wins >= SUPPRESS_THRESHOLDS.minWins
  const roundsOk = avgRounds <= SUPPRESS_THRESHOLDS.maxAvgRounds
  const damageOk = avgDamagePct <= SUPPRESS_THRESHOLDS.maxAvgDamageTaken
  return {
    wins,
    needWins: SUPPRESS_THRESHOLDS.minWins,
    avgRounds,
    maxAvgRounds: SUPPRESS_THRESHOLDS.maxAvgRounds,
    avgDamagePct,
    maxAvgDamagePct: SUPPRESS_THRESHOLDS.maxAvgDamageTaken,
    winsOk,
    roundsOk,
    damageOk,
    hasStats,
    qualified: winsOk && roundsOk && damageOk
  }
}

/** 某地界镇压每小时速率(灵石 + 物产);界面与结算同口径 */
export interface SuppressRate {
  stonePerHour: GNum
  resource: { id: SuppressResource; name: string; perHour: number } | null
}

/** 镇守道韵文案,与结算同走 `suppressionExpRate`;单位是修速倍率,不是绝对点数 */
export function suppressDaoText(count: number): string {
  const rate = suppressionExpRate(count)
  if (rate <= 0) return '—'
  return `修为 +${Math.round(rate * 100)}%/时`
}

/** 某地界基础镇压速率(未乘兴衰系数);速率只此一份实现 */
export function suppressRateFor(regionId: string): SuppressRate | null {
  const region = regionDef(regionId)
  if (!region) return null
  return {
    stonePerHour: stoneByTier(region.tier, SUPPRESS_YIELD_PER_HOUR.stoneMultiplier),
    resource: suppressYield(regionId)
  }
}

/** 镇压产出行文案(灵石/时 · 物产,乘兴衰系数);界面与「镇压达成」回执共用 */
export function suppressRateLine(regionId: string, prosperity: RegionRecall['prosperity']): string {
  const rate = suppressRateFor(regionId)
  if (!rate) return '—'
  const mult = prosperityYieldMult(prosperity)
  const stone = `${formatGN(mulN(rate.stonePerHour, mult))}灵石/时`
  if (!rate.resource) return stone
  const perHour = Math.max(1, Math.round(rate.resource.perHour * mult))
  return `${stone} · ${rate.resource.name}${perHour}/时`
}

/** 镇压被动收益累计;GameEngine 每 tick 结算,也供离线结算展示 */
export interface SuppressedYield {
  stone: GNum
  /** 镇守道韵折算的修为点数 */
  expGain: GNum
  equipment: { name: string; quality: QualityId; recycled?: boolean; uid?: string }[]
  /** 化尘所得器灵尘(自动回收/满包化尘/腾位旧件;acquireEquipment 记账) */
  recycledDust: number
  /** 物产累计;灵草按品分账,grade 标明品阶 */
  resources: { id: SuppressResource; name: string; amount: number; grade?: HerbGrade }[]
  /** 本段妖气复聚的地界(core/regionRevival);归来卷轴据此入账 */
  revived: string[]
  /** 本段被妖气复聚松开的镇压(资格仍在,收益停下);与 `revived`(首领复出)分开记 */
  loosened: string[]
}

/**
 * @param dt 本段时长(秒);收益按它结(离线受洞府离线上限约束,见 offline.ts)
 * @param service 可注入随机源
 * @param worldAt 本段结束时世界推进到的时刻(毫秒),默认此刻;妖气复聚按它判,不受离线上限截断
 * 在线路径两个时刻相同(`gameNow()`)
 */
export function settleSuppressedRegions(
  dt: number,
  service: RandomService = rng,
  worldAt: number = Date.now()
): SuppressedYield | null {
  const player = usePlayerStore()
  const resources = useResourcesStore()

  const total: SuppressedYield = {
    stone: gnZero(),
    expGain: gnZero(),
    equipment: [],
    recycledDust: 0,
    resources: [],
    revived: [],
    loosened: []
  }
 const now = Date.now()

  // 本段起点(由终点倒推),复聚边界用
  const from = worldAt - dt * 1000
  const active = [...new Set(player.suppressedRegions)]
  // 无镇压仍要跑复聚:已靖平未镇压的地界也会到钟;两样都没有才返回 null
  if (active.length === 0) {
    const revival = settleRegionRevivals(worldAt)
    total.revived = revival.returned
    total.loosened = revival.loosened
    return total.revived.length + total.loosened.length > 0 ? total : null
  }

  /** 某片本段内镇压仍生效的秒数:收益只结到复聚那一刻,越界部分不计 */
  const heldSecOf = (regionId: string): number => {
    const clock = regionReviveClock(regionId)
    if (!(clock > 0)) return dt
    const remain = (clock + REVIVE_AFTER_HOURS * 3600_000 - from) / 1000
    return Math.max(0, Math.min(dt, remain))
  }

  /*
   * ---- 镇守道韵:按「总速率封顶」摊到各区 ----
   * 单位是「挂机产出的百分比」:界面报「修为 +8%/时」,指这一小时按挂机所得的 8% 另结。
   * 故取 cultPerSec × 秒数 × 倍率 —— 除以 3600 会把「一小时」算成「一秒」的量(少 3600 倍)。
   * 逐区各发 8% 时第 6 区起越过封顶(7 区实得 56%);摊成「总速率 ÷ 区数」后:
   * 5 区以内与旧口径逐字相同,6 区起总量停在 40%;某区提前复聚只少自己的那份。
   */
  const perRegionRate = active.length > 0 ? suppressionExpRate(active.length) / active.length : 0
  for (const regionId of active) {
    const heldSec = heldSecOf(regionId)
    if (heldSec <= 0) continue
    const expGain = mulN(gn(player.cultPerSec), perRegionRate * heldSec)
    if (isZero(expGain)) continue
    player.gainExp(expGain)
    total.expGain = add(total.expGain, expGain)
  }

  for (const regionId of active) {
    const region = regionDef(regionId)
    if (!region) continue
    const heldSec = heldSecOf(regionId)
    if (heldSec <= 0) continue
    const hours = heldSec / 3600

    const recall = deriveProsperity({
      // 与界面(`regionRecallFor`)同一把尺:只认本世胜场,不读 `totalFights`
      totalWins: regionWinsOfThisLife(player, regionId),
      hasSuppressed: true,
      suppressedAt: player.suppressedSince[regionId],
      lastActivityAt: player.regionStats[regionId]?.lastUpdateAt ?? now,
      now
    })
    const yieldMult = prosperityYieldMult(recall.prosperity)

    const stoneYield = stoneByTier(region.tier, SUPPRESS_YIELD_PER_HOUR.stoneMultiplier * hours * yieldMult)
    resources.addStone(stoneYield)
    total.stone = add(total.stone, stoneYield)

    const yieldDef = suppressYield(regionId)
    if (yieldDef) {
      // 零头按区域攒进 suppressFrac,够一件才入账;逐 tick floor 会让在线产出恒为 0
      const amount = player.takeSuppressResource(regionId, yieldDef.perHour * hours * yieldMult)
      if (amount > 0) {
        if (yieldDef.id === 'herb') {
          // 灵草按品分账:同品聚一行
          const grade = herbGradeOfMajor(region.minRealm)
          resources.addHerb(grade, amount)
          const row = total.resources.find(r => r.id === 'herb' && r.grade === grade)
          if (row) row.amount += amount
          else total.resources.push({ id: 'herb', name: `${HERB_GRADE_SHORT[grade]}灵草`, amount, grade })
        } else {
          resources.addSmall(yieldDef.id, amount)
          const row = total.resources.find(r => r.id === yieldDef.id)
          if (row) row.amount += amount
          else total.resources.push({ id: yieldDef.id, name: yieldDef.name, amount })
        }
      }
    }

    // 装备按期望件数结算(整数件 + 零头概率);单次概率判定在 hours>2.5 时恒真,长时离线会少掉
    const equipChance = SUPPRESS_YIELD_PER_HOUR.equipmentChance * hours
    // 零头走同一可注入随机源,不裸调 Math.random:rng 构造时已抓走原函数,测试 mock 不到
    const equipCount = Math.floor(equipChance) + (service.chance(equipChance - Math.floor(equipChance)) ? 1 : 0)
    const since = player.suppressedSince[regionId]
    const tenureLuck = since === undefined ? 0 : suppressionEquipmentLuck(since, now)
    for (let i = 0; i < equipCount; i += 1) {
      // 不传品质下限:传了(哪怕是 0)品质窗口就失效,低阶高品更易出
      const equip = generateEquipment(region.tier, service, { luck: tenureLuck })
      const res = acquireEquipment(equip, { quiet: true }) // 免刷屏
      // 入包与否都列;未入包标注回收
      total.equipment.push({
        name: equipmentTemplate(equip.templateId)?.name ?? '未知',
        quality: equip.quality,
        recycled: !res.bagged,
        uid: res.bagged ? equip.uid : undefined
      })
      // 腾位时旧件化尘也要记,只看 bagged 会漏报
      total.recycledDust += res.dust
    }
  }

  // 复聚须在收益结清之后:先跑会在开头松开镇压,整段收益归零
  const revival = settleRegionRevivals(worldAt)
  total.revived = revival.returned
  total.loosened = revival.loosened

  return total
}

// ============ 区域凭吊叙事 ============

/** 凭吊触发概率 */
export const MEMORIAL_CHANCE = 0.04

/** 进入已镇压区域时低概率触发的凭吊叙事;纯文案,无奖励无属性 */
export function memorialLine(
  regionId: string,
  player: ReturnType<typeof usePlayerStore>,
  now: number = Date.now()
): string | null {
  const since = player.suppressedSince[regionId]
  if (since === undefined) return null
  const region = regionDef(regionId)
  if (!region) return null
  // 与寿元同一把尺:现实 1 小时 = AGE_YEARS_PER_HOUR 岁
  const years = Math.max(1, Math.floor(((now - since) / 3_600_000) * AGE_YEARS_PER_HOUR))
  return [
    `行至${region.name},山道两侧立着两块石碑,一块刻着你的道号,另一块是空的。`,
    `你镇压此地已逾${years}载,妖邪至今不敢再聚。`,
    `守道的山民见你,愣了愣,拱手道:「是你。」`
  ].join('')
}
