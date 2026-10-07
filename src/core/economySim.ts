/**
 * 经济闭环审计(Phase 19)
 * 用真实公式与真实掉落生成,估算各境界时期「每小时生产 vs 每小时消耗」,
 * 找出瓶颈资源 / 死资源 / 纯 UI 噪音。
 *
 * 审计模型假设(集中声明,便于质疑与修正):
 * - 全程挂机历练,战斗间隔与胜率取典型值;
 * - 建筑等级随大境界成长(lv ≈ 2 + 2×境界,受各自上限约束);
 * - 消耗按「该时期内的总沉没成本 / 该时期时长」摊销。
 *
 * Phase 40 补全两处(见 ISS-209):
 * - **修为也进表**。它此前不在六条资源流里,而它恰是最大的一条收入 ——
 *   口径随 Phase 39 统一:一切即时修为 = 修速 × 一段等效闭关时长,故这一行
 *   量的是「等效闭关秒/小时」,收入 = 挂机 + 历练两条线(core/expIncome 同一把尺子),
 *   消耗 = 通关本境的修为需求。比值全程恒定,不随境界漂移 —— 这正是要守的性质。
 * - **界外十二境一并体检**(0~20 境,不再只跑人间界 0~8)。区域层级取自
 *   data/regions 的 maxTierForMajor —— 从前这里自写 `min(20, 2m+2)`,把界外
 *   十二境全压死在层级 20,收入那一半先错了 1.9^12。
 *
 * 读界外的表须知:那一段的**出口**多半不在建筑上(建筑早已封顶),而在天道熔炉
 * (玄铁/残页/器灵尘/灵石 → 道源)。熔炉已入模型(ISS-210 结清):材料与灵石按各自
 * 熔铸率折算成道源潜力,道源再凝道果,凝一枚的代价落在 daoCostHours(见界外每一行)。
 * 故界外读到的高闲置比值(动辄 10^5×)是**真实读数** —— 每境只凝一枚道果的终局需求
 * 本就远小于材料产出,不代表「这些资源真的没用」;真正该看的是 daoCostHours 是否随
 * 层级漂移(见 DAO_SOURCE_PER_FRUIT 与熔炉价那一段)。
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
  LIBRARY_WUDAO_PER_HOUR,
  PAGE_DROP_CHANCE
} from '@/data/constants'
import { buildingCost, gongfaUpCost, qiCap, baseQiRegen, stoneByTier, upgradeCost } from './formulas'
import { generateEquipment } from './equipGen'
import { secondsForMajor } from './progressionSim'
import { tripExpSecsPerHour, winsPerHour } from './expIncome'


// ---- 挂机行为假设 ----
const UPGRADES_PER_HOUR = 3
const CRAFTS_PER_HOUR = 2
const GONGFA_UPS_PER_ERA = 6
const REAL_TIME_FACTOR = 2 // 真实体感 ≈ 纯修炼估算 ×2
/** 沉没成本摊销的最小时长:早期时期极短,玩家实际用数小时慢慢补齐建筑 */
const MIN_AMORTIZE_HOURS = 2

export type AuditResource = 'stone' | 'herb' | 'ore' | 'page' | 'dust' | 'wudao' | 'exp' | 'daoSource'

export interface ResourceFlow {
  resource: AuditResource
  incomePerHour: number
  sinkPerHour: number
  ratio: number
  verdict: '瓶颈' | '健康' | '过剩' | '闲置'
  /**
   * 这条读数的口径附注 —— 只在"模型没把握"时出现。
   *
   * 审计的红线是"不许把没模型的地方算成健康,也不许算成事故":
   * 界外的悟道点就是这种情形(它的真出口是功法进修与法宝炼化,本模型没算全),
   * 于是这一栏明说「出口待补」,而不是让 ratio 报一个吓人的闲置数。
   */
  note?: string
}

export interface EraAudit {
  major: number
  tier: number
  eraHours: number
  flows: ResourceFlow[]
  /**
   * 界外专有:凝一枚道果需要多少小时的材料产出(道果价 ÷ 熔炉潜力)。
   *
   * 这是终局的进度杠杆 —— 应当**不随层级漂移**;漂移即有人把某一段价格冻死了。
   */
  daoCostHours?: number
}

function buildingLevel(major: number, maxLevel: number): number {
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

/** 单个境界时期的资源流审计 */
export function auditEra(major: number): EraAudit {
  const tier = maxTierForMajor(major)
  const eraHours = (secondsForMajor(major, 0) / 3600) * REAL_TIME_FACTOR || 0.1
  const amortizeHours = Math.max(eraHours, MIN_AMORTIZE_HOURS)
  /**
   * 遭遇速率取自 core/expIncome —— 那是"一次遭遇值多少"的唯一口径所在地,
   * 这里再写一遍就会出现两个「全时历练 = ×N」的说法(本审计第一版正是如此:
   * 一处按全胜算、一处按 0.85 胜率算,同一句话读出 1.64 与 1.51 两个数)。
   */
  const winsThisHour = winsPerHour()
  const dropsPerHour = winsThisHour * EQUIP_DROP_CHANCE

  const fieldLv = buildingLevel(major, 15)
  const libLv = buildingLevel(major, 12)

  // ---- 生产 ----
  const stoneIncome = winsThisHour * toNum(stoneByTier(tier, 10))
  const herbIncome = winsThisHour * 0.5 * 2 + fieldLv * FIELD_HERB_PER_HOUR
  const oreIncome = winsThisHour * 0.35 * 1.5 + fieldLv * FIELD_ORE_PER_HOUR
  const pageIncome = winsThisHour * PAGE_DROP_CHANCE * 1.5
  const dustIncome = dropsPerHour * avgDustPerDrop(tier)
  const wudaoIncome = libLv * LIBRARY_WUDAO_PER_HOUR
  /**
   * 修为收入 = 挂机(底:1.0× 修速 = 3600 等效秒/小时)+ 历练(战斗胜场与际遇),
   * 两条线都随修速缩放,故这一行的比值在任何境界都该是同一个数 —— 判据据此断。
   * 速率与时长都取自 core/expIncome(同一把尺子)。
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
  // 炼丹(取该时期可炼配方的平均成本)
  const recipes = PILLS.filter(p => p.recipe && p.minRealm <= major)
  const avgHerbCost = recipes.length ? recipes.reduce((s, p) => s + p.recipe!.herb, 0) / recipes.length : 0
  const avgPillStone = recipes.length
    ? recipes.reduce((s, p) => s + toNum(stoneByTier(maxTierForMajor(p.minRealm), p.recipe!.stoneBase / 10)), 0) / recipes.length
    : 0
  // 装备强化
  const up = upgradeCost(3, tier, 3, 0)
  const dustSinkHour = UPGRADES_PER_HOUR * up.dust
  const stoneSinkHour = UPGRADES_PER_HOUR * toNum(up.stone) + CRAFTS_PER_HOUR * avgPillStone + stoneSinkEra / amortizeHours
  const herbSinkHour = CRAFTS_PER_HOUR * avgHerbCost
  /**
   * 修为消耗 = 通关本境所需的等效闭关秒 ÷ 本境时长。
   *
   * 这里**不套 MIN_AMORTIZE_HOURS**:那道下限是给建筑的(「玩家用数小时慢慢补齐」),
   * 而修为需求本来就摊在本境这一段时长里,早期一境只有十几分钟也照摊。
   */
  const expSinkHour = secondsForMajor(major, 0) / eraHours

  /**
   * 界外的出口:天道熔炉。
   *
   * 人间界的四样材料都有别的去处(建筑、炼丹、参悟、强化),界外没有 ——
   * 建筑早封顶、玄铁的消耗项归零,于是审计在这里读出 ∞ 与「闲置十万倍」。
   * 那不是"材料没用",是**模型缺了出口**:终局的玄铁/残页/灵草/器灵尘(以及灵石)
   * 都投进天道熔炉换道源,道源再凝道果(终局唯一的数值出口)。
   *
   * 这里的建模口径(与终局玩法同源,数字全部取自 data/endgame):
   *   潜力 = Σ 各材料产出 ÷ 该材料的熔铸率 + 灵石产出 ÷ 灵石熔铸价 × 每次道源数
   *   需求 = 每境凝一枚道果(DAO_SOURCE_PER_FRUIT / 本境时长)
   *
   * 但**别把这个比值当健康判据** —— 它主要是"这一境有多长"的函数(一境越长,
   * 摊出来的需求越小)。真正有意义的是速率与价格那条:**凝一枚道果要多少小时的材料产出**
   * (见 daoCostHours),它才是终局的进度杠杆,而且必须**不随层级漂移** ——
   * 漂移就说明有人把某一段的价格又冻死了(ISS-214 的旧病)。
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
    /**
     * 灵石熔铸:一份灵石换 FURNACE_STONE_DAO_SOURCE 缕道源。
     *
     * 价格按**这一境的层级**折算 —— 与 endgameService.furnaceStoneCost 同一口径。
     * 从前两边都写死第 20 层:灵石收入按 1.9^层级 涨,价格却不动,
     * 于是到混沌海一条石脉就能换来满地道果(ISS-214)。
     */
    const stonePerDao = toNum(stoneByTier(tier, FURNACE_STONE_TIER_AMOUNT))
    if (stonePerDao > 0) potential += (stoneIncome / stonePerDao) * FURNACE_STONE_DAO_SOURCE
    return { potential, demand: DAO_SOURCE_PER_FRUIT / Math.max(eraHours, 1) }
  })()

  /**
   * 界外的材料按「有什么投什么」分摊熔炉需求:每样材料的有效出口
   * = 自己的道源潜力 × (需求 / 总潜力)。故四者与道源流的比值是同一个数 ——
   * 它说的正是「材料总量是终局需求的几倍」。
   */
  const furnaceShare = furnace && furnace.potential > 0 ? Math.min(1, furnace.demand / furnace.potential) : 0

  /**
   * 凝一枚道果要多少小时的材料产出 = 道果价(道源) ÷ 熔炉潜力(道源/小时)。
   * 这是终局的进度杠杆:它是常数,说明"材料 → 道果"的换算在整条长尾上同一个价。
   */
  const daoCostHours = furnace && furnace.potential > 0 ? DAO_SOURCE_PER_FRUIT / furnace.potential : 0

  const make = (resource: AuditResource, income: number, sink: number, note?: string): ResourceFlow => {
    const ratio = sink > 0 ? income / sink : Infinity
    return { resource, incomePerHour: income, sinkPerHour: sink, ratio, verdict: verdictOf(ratio), note }
  }

  /** 界外:这几样材料的出口改认熔炉(人间界照旧走各自的去处) */
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
       * 灵石一行与其它四样不同:它在界外仍保留「强化/炼丹/建筑」这些人间界式的去处
       * (stoneSinkHour),不像玄铁/残页/灵草/器灵尘那样经 withFurnace 整体改认熔炉。
       * 故这里在人间界式去向**之上追加**熔炉口的灵石消耗:
       * 实际被熔炉吃掉的灵石 = 灵石投入熔炉的炉次 × 分摊比例
       *   = (stoneIncome / stonePerDao) × stonePerDao × furnaceShare
       *   = stoneIncome × furnaceShare   (stonePerDao 约去)。
       * 道源潜力那一侧(见上 furnace)仍计入灵石贡献,两端同认「灵石投熔炉」这一去向。
       * 终局道果需求故意很小,故这一项量级极小(≈0.02 比值点)——修正的是记账一致性。
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

/** 灵气结构体检:回满时长(秒) */
export function qiFillSeconds(major: number): number {
  return qiCap(major, 0) / baseQiRegen(major)
}
