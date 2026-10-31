/**
 * 经济闭环审计:用真实公式与真实掉落,估算各境界时期每小时生产 vs 消耗。
 * 模型假设:全程挂机历练,战斗间隔与胜率取典型值;建筑 lv ≈ 2 + 2×境界(受各自上限约束);
 * 消耗按该时期总沉没成本 / 该时期时长摊销。
 * 区域层级取 data/regions 的 maxTierForMajor;自写 `min(20, 2m+2)` 会把界外十二境全压死在层级 20。
 * 界外材料出口在天道熔炉,高闲置比值(动辄 10^5×)是真实读数;判据看 daoCostHours。
 */
import { toNum } from '@/utils/gnum'
import { mulberry32, RandomService } from '@/utils/random'
import { BUILDINGS } from '@/data/buildings'
import { PILLS } from '@/data/pills'
import { qualityDef } from '@/data/qualities'
import { MAX_MAJOR } from '@/data/realms'
import { WORLD_BREAK_MAJOR } from '@/data/realms'
import { maxTierForMajor } from '@/data/regions'
import {
  DAO_SOURCE_PER_FRUIT,
  FURNACE_RATES,
  FURNACE_STONE_DAO_SOURCE,
  FURNACE_STONE_TIER_AMOUNT
} from '@/data/endgame'
import {
  COMPREHEND_PAGE_COST,
  DECOMPOSE_DUST,
  EQUIP_DROP_CHANCE,
  FIELD_HERB_PER_HOUR,
  FIELD_ORE_PER_HOUR,
  HERB_DROP_CHANCE,
  LIBRARY_WUDAO_PER_HOUR,
  ORE_DROP_CHANCE,
  PAGE_DROP_CHANCE
} from '@/data/constants'
import { buildingCost, gongfaUpCost, qiCap, baseQiRegen, pillStoneCost, stoneByTier, upgradeCost } from './formulas'
import { generateEquipment } from './equipGen'
import { STONE_AMT_PER_BATTLE } from './pillValue'
import { secondsForMajor } from './progressionSim'
import { tripExpSecsPerHour, winsPerHour } from './expIncome'


// ---- 挂机行为假设 ----
const UPGRADES_PER_HOUR = 3
const CRAFTS_PER_HOUR = 2
const GONGFA_UPS_PER_ERA = 6
const REAL_TIME_FACTOR = 2 // 真实体感 ≈ 纯修炼估算 ×2
/** 沉没成本摊销下限(小时):早期时期极短,建筑实际用数小时补齐 */
const MIN_AMORTIZE_HOURS = 2

export type AuditResource = 'stone' | 'herb' | 'ore' | 'page' | 'dust' | 'wudao' | 'exp' | 'daoSource'

export interface ResourceFlow {
  resource: AuditResource
  incomePerHour: number
  sinkPerHour: number
  ratio: number
  verdict: '瓶颈' | '健康' | '过剩' | '闲置'
  /** 口径附注,只在模型没把握时出现。红线:不许把没模型的地方算成健康,也不许算成事故。 */
  note?: string
}

export interface EraAudit {
  major: number
  tier: number
  eraHours: number
  flows: ResourceFlow[]
  /** 界外专有:凝一枚道果所需材料产出小时数 = 道果价(道源) ÷ 熔炉潜力(道源/小时);须不随层级漂移。 */
  daoCostHours?: number
}

/** 该境界下建筑等级;未及 unlockRealm 按 0,提前计产出会高估早期经济、瓶颈报不出。 */
function buildingLevel(major: number, maxLevel: number, unlockRealm = 0): number {
  if (major < unlockRealm) return 0
  return Math.min(maxLevel, 2 + 2 * major)
}

function verdictOf(ratio: number): ResourceFlow['verdict'] {
  if (ratio < 0.7) return '瓶颈'
  if (ratio <= 3) return '健康'
  if (ratio <= 10) return '过剩'
  return '闲置'
}

/** 该层级掉落装备的平均分解灵尘(真实生成取样) */
export function avgDustPerDrop(tier: number, samples = 200): number {
  const rng = new RandomService(mulberry32(tier * 131))
  let total = 0
  for (let i = 0; i < samples; i += 1) {
    const inst = generateEquipment(tier, rng)
    total += DECOMPOSE_DUST[qualityDef(inst.quality).rank] ?? 1
  }
  return total / samples
}

/** 该层级掉落装备的平均品质阶(与 avgDustPerDrop 同一采样/种子) */
export function avgQualityRank(tier: number, samples = 200): number {
  const rng = new RandomService(mulberry32(tier * 131))
  let total = 0
  for (let i = 0; i < samples; i += 1) {
    const inst = generateEquipment(tier, rng)
    total += qualityDef(inst.quality).rank
  }
  return total / samples
}

/** 单个境界时期的资源流审计 */
export function auditEra(major: number): EraAudit {
  const tier = maxTierForMajor(major)
  const eraHours = (secondsForMajor(major, 0) / 3600) * REAL_TIME_FACTOR || 0.1
  const amortizeHours = Math.max(eraHours, MIN_AMORTIZE_HOURS)
  // 遭遇速率唯一口径:core/expIncome;此处另算会出现两套「全时历练 = ×N」读数
  const winsThisHour = winsPerHour()
  const dropsPerHour = winsThisHour * EQUIP_DROP_CHANCE

  const fieldLv = buildingLevel(major, 15, 0) // 灵田
  const libLv = buildingLevel(major, 12, 1) // 藏经阁:筑基(境 1)起

  // ---- 生产 ----
  const stoneIncome = winsThisHour * toNum(stoneByTier(tier, STONE_AMT_PER_BATTLE))
  const herbIncome = winsThisHour * HERB_DROP_CHANCE * 2 + fieldLv * FIELD_HERB_PER_HOUR
  const oreIncome = winsThisHour * ORE_DROP_CHANCE * 1.5 + fieldLv * FIELD_ORE_PER_HOUR
  const pageIncome = winsThisHour * PAGE_DROP_CHANCE * 1.5
  const dustIncome = dropsPerHour * avgDustPerDrop(tier)
  const wudaoIncome = libLv * LIBRARY_WUDAO_PER_HOUR
  /**
   * 修为收入(单位:等效闭关秒/小时)= 挂机 3600(1.0× 修速)+ 历练;速率与时长取自 core/expIncome。
   * 两条线都随修速缩放,本行比值须各境恒定。
   * 镇压红利(core/suppress)未入:属挂机线固定倍数,不改比值恒定。
   */
  const expIncome = 3600 + tripExpSecsPerHour()

  // ---- 消耗(时期总量摊销到每小时) ----
  let stoneSinkEra = 0
  let oreSinkEra = 0
  for (const b of BUILDINGS) {
    const from = buildingLevel(major, b.maxLevel)
    const to = buildingLevel(major + 1, b.maxLevel)
    for (let lv = from; lv < to; lv += 1) {
      stoneSinkEra += toNum(buildingCost(b.costBase, lv))
      oreSinkEra += b.costOre * (lv + 1)
    }
  }
  // 功法进修
  const wudaoSinkEra = GONGFA_UPS_PER_ERA * gongfaUpCost(2, 3 + major) + 8
  const pageSinkEra = COMPREHEND_PAGE_COST + GONGFA_UPS_PER_ERA * (3 + major)
  // 炼丹
  const recipes = PILLS.filter(p => p.recipe && p.minRealm <= major)
  const avgHerbCost = recipes.length ? recipes.reduce((s, p) => s + p.recipe!.herb, 0) / recipes.length : 0
  const avgPillStone = recipes.length
    ? recipes.reduce((s, p) => s + toNum(pillStoneCost(p)), 0) / recipes.length
    : 0
  // 强化耗尘按该层级真实平均品阶,与分解收入同尺;固定玄品(rank 3)会把低阶耗尘估高
  const up = upgradeCost(3, tier, avgQualityRank(tier), 0)
  const dustSinkHour = UPGRADES_PER_HOUR * up.dust
  const stoneSinkHour = UPGRADES_PER_HOUR * toNum(up.stone) + CRAFTS_PER_HOUR * avgPillStone + stoneSinkEra / amortizeHours
  const herbSinkHour = CRAFTS_PER_HOUR * avgHerbCost
  // 修为消耗不套 MIN_AMORTIZE_HOURS,按本境实际时长摊
  const expSinkHour = secondsForMajor(major, 0) / eraHours

  /**
   * 界外出口:天道熔炉,数字同源 data/endgame。材料与灵石按熔铸率折道源潜力;需求 = 每境凝一枚道果。
   * 潜力/需求比值主要随本境时长变,不作健康判据。
   */
  const furnace = ((): { potential: number; demand: number } | null => {
    if (major < WORLD_BREAK_MAJOR) return null
    const byResource: Partial<Record<AuditResource, number>> = {
      ore: oreIncome,
      page: pageIncome,
      herb: herbIncome,
      dust: dustIncome
    }
    let potential = 0
    for (const rate of FURNACE_RATES) {
      const income = byResource[rate.resource as AuditResource]
      if (income) potential += income / rate.per
    }
    // 灵石熔铸价按本境层级折算,须与 endgameService.furnaceStoneCost 同口径;
    // 写死层级则价格跟不上按 1.9^层级 涨的灵石收入
    const stonePerDao = toNum(stoneByTier(tier, FURNACE_STONE_TIER_AMOUNT))
    if (stonePerDao > 0) potential += (stoneIncome / stonePerDao) * FURNACE_STONE_DAO_SOURCE
    return { potential, demand: DAO_SOURCE_PER_FRUIT / Math.max(eraHours, 1) }
  })()

  // 熔炉需求按道源潜力占比分摊到各材料:四样材料与道源流比值相同
  const furnaceShare = furnace && furnace.potential > 0 ? Math.min(1, furnace.demand / furnace.potential) : 0

  const daoCostHours = furnace && furnace.potential > 0 ? DAO_SOURCE_PER_FRUIT / furnace.potential : 0

  const make = (resource: AuditResource, income: number, sink: number, note?: string): ResourceFlow => {
    const ratio = sink > 0 ? income / sink : Infinity
    return { resource, incomePerHour: income, sinkPerHour: sink, ratio, verdict: verdictOf(ratio), note }
  }

  /** 界外:材料出口改认熔炉 */
  const withFurnace = (resource: AuditResource, income: number, baseSink: number): ResourceFlow => {
    if (!furnace) return make(resource, income, baseSink)
    const rate = FURNACE_RATES.find(r => r.resource === resource)!
    return make(resource, income, (income / rate.per) * furnaceShare)
  }

  return {
    major,
    tier,
    eraHours,
    ...(furnace ? { daoCostHours } : {}),
    flows: [
      /**
       * 灵石界外仍保留人间界去处(stoneSinkHour),不经 withFurnace;熔炉消耗追加其上:
       * (stoneIncome / stonePerDao) × stonePerDao × furnaceShare = stoneIncome × furnaceShare。
       * 与 furnace 潜力侧计入的灵石贡献对应。
       */
      make('stone', stoneIncome, stoneSinkHour + (furnace ? stoneIncome * furnaceShare : 0)),
      withFurnace('herb', herbIncome, herbSinkHour),
      withFurnace('ore', oreIncome, oreSinkEra / amortizeHours),
      withFurnace('page', pageIncome, pageSinkEra / amortizeHours),
      withFurnace('dust', dustIncome, dustSinkHour),
      make(
        'wudao',
        wudaoIncome,
        wudaoSinkEra / amortizeHours,
        furnace ? '界外出口(功法进修 / 法宝炼化)未入模型 —— 读数待补' : undefined
      ),
      make('exp', expIncome, expSinkHour),
      ...(furnace
        ? [make('daoSource', furnace.potential, furnace.demand)]
        : [])
    ]
  }
}

export function fullEconomyAudit(): EraAudit[] {
  const out: EraAudit[] = []
  for (let m = 0; m <= MAX_MAJOR; m += 1) out.push(auditEra(m))
  return out
}

/** 灵气回满时长(秒) */
export function qiFillSeconds(major: number): number {
  return qiCap(major, 0) / baseQiRegen(major)
}
