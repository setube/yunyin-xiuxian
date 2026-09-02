/**
 * 丹药价值模型(Phase 32.6)—— 把三十二味丹放进同一张表
 *
 * ## 这个文件回答的那个问题
 *
 * 玩家看见「灵乳回满灵气」时的抱怨不是"这个数太大",而是"凭什么"。
 * 凭什么一味白捡的丹,比一炉四十味灵草炼出来的还管用?这问题问的是**价值预算**:
 * 每一味丹凭它的规格、成本、门槛、稀有度,该值多少。
 *
 * 本文件不改任何数值,只提供把它们摆到一起比较的口径。校准结果落在 data/pills.ts,
 * 定价法则由 pillValue.spec.ts 守住。
 *
 * ## 折算口径:一切归于「等效挂机秒数」
 *
 * 药力(gainSec)问的是"这一枚替我省下多少挂机时间"。五条计价轴的换算各不相同,
 * 而这正是价值预算失控的根源 —— 它们随境界的走势完全不同:
 *
 * | 轴            | 换算                          | 随境界 |
 * |---------------|-------------------------------|--------|
 * | expReqPct     | pct × 一层耗时                | 恒定   |
 * | expFixed      | 点数 ÷ 修炼速度               | 每大境界 ÷5.2,指数贬值 |
 * | qiPct         | pct × 灵气上限 ÷ 灵气回速     | 近乎恒定 |
 * | lifespanYears | 年数 × 3600(每现实小时老一岁) | 绝对值恒定,相对寿限急剧贬值 |
 * | wudao         | 点数 ÷ 藏经阁产出             | 恒定(但功法升级开销指数增长) |
 *
 * 一层耗时 = expReq(m,s) / cultPerSec(m,s) = 25 × 3.4615^m × 1.2453^s 秒。
 * 校验:炼气五层约 75 秒,金丹五层约 900 秒,真仙五层约 87 天 —— 与终局节奏吻合。
 *
 * ## 两条线各算各的账
 *
 * **掉落品是白捡的**,它的"代价"不是时间(你打怪本来就要打),而是**稀有度**:
 * 期望多少场遭遇才见一枚。**可炼品的代价才是真代价**:灵草、灵石、炸炉赔的料。
 * 所以两条线不共用性价比公式,跨线只比**药力绝对值** —— 这也正是玩家真正在比的东西。
 *
 * ## 已知的局限(读表时须知)
 *
 * 1. **跨族不可比**。寿元丹动辄折算出十万秒,修为丹只有几百秒,因为寿元的产出速率
 *    (1 年/小时)与修炼速率不在一个量纲上。只在族内横向比较才有意义。
 * 2. **寿元被高估**。境界寿限从 150 涨到 9999 万,同样的「延寿百载」在化神期近乎无感,
 *    本模型按绝对秒数计,读表时须自行折价。
 * 3. **一场战斗折 12 秒是低估**。战斗本身产出修为、灵石、材料,把整场时间记到丹药头上
 *    会**高估**取得代价。这是保守方向:若在此口径下某味丹仍显得过强,结论只会更硬。
 */
import type { PillDef } from '@/types'
import { PILLS } from '@/data/pills'
import { qualityDef } from '@/data/qualities'
import { buffDef } from '@/data/buffs'
import { recipeCraft } from '@/data/crafting'
import { AGE_YEARS_PER_HOUR, EXPLORE_BATTLE_INTERVAL, LIBRARY_WUDAO_PER_HOUR, PILL_DROP_CHANCE } from '@/data/constants'
import { toNum } from '@/utils/gnum'
import { baseCultPerSec, baseQiRegen, expRequirement, qiCap, stoneByTier } from './formulas'
import { bearableRank, composeSuccessRate } from './craftability'
import { salvageRatio } from './pillService'

// ============ 审计基准 ============

/**
 * 折算取值的小层。取第五层(共十层)的中位处 —— 取第一层会把一整个大境界的
 * 起步阶段当成代表,取第九层则偏向临界突破,五层是这个大境界的常态。
 */
export const AUDIT_SUB = 5

/**
 * 基准手艺:熟练度 60(「娴熟」)、丹方烂熟、方中灵材全通晓。
 *
 * 不取满值 —— 熟练度双曲饱和,永远够不到 100,拿理论极限当基准会让所有丹的
 * 取得代价被系统性低估。60 对应约 900 点累积经验,是一个认真炼过几十炉的人。
 */
export const AUDIT_SKILL = 60
const AUDIT_MASTERY = 1
const AUDIT_MATERIAL_LORE = 1

/** 一场战斗的期望灵草产出(见 core/loot.ts:afterWin —— 五成概率掉 1~3 株) */
const HERB_PER_BATTLE = 0.5 * 2
/** 一场战斗的期望灵石产出系数(rng.float(0.8,1.2) 的均值为 1.0) */
const STONE_AMT_PER_BATTLE = 10

/**
 * 掉落品的药力上限:同族同规格可炼品的六成。
 *
 * 这个比例不是拍脑袋定的,是从游戏自己的数据里读出来的 —— 寿元线上,
 * 凤髓膏(玄品掉落)100 载对千年延寿丹(玄品可炼)200 载,蟠桃(地品掉落)500 载
 * 对万寿金丹(地品可炼)1000 载,两处都恰好是五成。红线放到六成留出余量。
 */
export const DROP_CRAFT_RATIO = 0.6

// ============ 分族 ============

/** 丹药的计价轴。state 族(战斗/气运/突破增益)折不成时间,只审规格一致性 */
export type PillFamily = 'exp' | 'qi' | 'lifespan' | 'wudao' | 'tempo' | 'state'

/** 取得方式:炼出来的 / 捡到的 */
export type PillLine = 'craft' | 'drop'

/**
 * 状态类丹药里唯一能折成时间的那一份:修炼速度。
 *
 * expGain(战斗所得修为)与 explorationSpeed(历练速度)不并入 —— 它们提升的是
 * 另外两条产出渠道,与挂机秒数不同量纲。把三者相加会让「历练提速 30%」看起来
 * 等于「修炼提速 30%」,那是假的可比性。
 */
function tempoRateOf(def: PillDef): number {
  if (def.kind !== 'buff' || !def.buffId) return 0
  return Math.max(0, buffDef(def.buffId)?.mods.cultivationSpeed ?? 0)
}

export function pillFamily(def: PillDef): PillFamily {
  const i = def.instant
  if (def.kind === 'instant' && i) {
    if (i.expReqPct || i.expFixed) return 'exp'
    if (i.qiPct) return 'qi'
    if (i.lifespanYears) return 'lifespan'
    if (i.wudao) return 'wudao'
  }
  return tempoRateOf(def) > 0 ? 'tempo' : 'state'
}

export function pillLine(def: PillDef): PillLine {
  return def.recipe ? 'craft' : 'drop'
}

// ============ 药力折算 ============

/** 在某境界修满一小层所需的时间(秒)—— 一切折算的标尺 */
export function layerSeconds(major: number): number {
  const m = Math.max(0, major)
  return toNum(expRequirement(m, AUDIT_SUB)) / baseCultPerSec(m, AUDIT_SUB)
}

/**
 * 一枚丹的药力,折成等效挂机秒数,**在指定境界取值**。
 *
 * 必须指定境界:同一枚聚气丹在炼气期抵半层修为,在化神期连一次呼吸都不到。
 * 跨丹比较时务必统一境界,否则比的是境界差,不是丹药差。
 */
export function pillGainSecAt(def: PillDef, major: number): number {
  const m = Math.max(0, major)
  const i = def.instant
  if (def.kind === 'instant' && i) {
    if (i.expReqPct) return i.expReqPct * layerSeconds(m)
    // gainExp 封顶于当前一层的需求,固定点数给不满一层
    if (i.expFixed) return Math.min(i.expFixed, toNum(expRequirement(m, AUDIT_SUB))) / baseCultPerSec(m, AUDIT_SUB)
    if (i.qiPct) return (i.qiPct * qiCap(m, AUDIT_SUB)) / baseQiRegen(m)
    if (i.lifespanYears) return (i.lifespanYears * 3600) / AGE_YEARS_PER_HOUR
    if (i.wudao) return (i.wudao * 3600) / LIBRARY_WUDAO_PER_HOUR
  }
  const rate = tempoRateOf(def)
  if (rate > 0 && def.buffId) return (buffDef(def.buffId)?.durationSec ?? 0) * rate
  return 0
}

/** 在自身准入境界处的药力 —— 这味丹刚进入玩家视野时值多少 */
export function pillGainSec(def: PillDef): number {
  return pillGainSecAt(def, def.minRealm)
}

// ============ 取得代价:可炼品 ============

/** 基准手艺下开一炉的成功率(超规格按准入境界计,见 craftability.ts) */
export function auditCraftRate(def: PillDef): number {
  const craft = recipeCraft(def)
  if (!craft) return 1
  const over = Math.max(0, craft.rank - bearableRank(def.minRealm))
  return composeSuccessRate(AUDIT_MASTERY, AUDIT_MATERIAL_LORE, AUDIT_SKILL, over)
}

/** 基准手艺下的期望出丹数(见 craftability.ts 的 bonusChance) */
export function auditYield(def: PillDef): number {
  if (!def.recipe) return 1
  return 1 + Math.min(0.5, AUDIT_MASTERY * 0.18 + AUDIT_SKILL / 500)
}

/**
 * 炼成一枚的期望代价,折成战斗场次。
 *
 * 含三笔:灵草、灵石、以及炸炉赔进去的料。失手时灵石全损、灵草按技艺保下一部分
 * (见 pillService.salvageRatio),所以期望开炉次数越多,灵草与灵石的账越不对称。
 */
export function craftBattlesOf(def: PillDef): number {
  if (!def.recipe) return 0
  const tier = Math.max(1, def.minRealm * 2 + 1)
  const stoneCost = toNum(stoneByTier(tier, def.recipe.stoneBase / 10))
  const stonePerBattle = toNum(stoneByTier(tier, STONE_AMT_PER_BATTLE))
  const opens = 1 / auditCraftRate(def)
  const fails = opens - 1
  const herbSpent = def.recipe.herb * (1 + fails * (1 - salvageRatio(AUDIT_SKILL)))
  const stoneSpent = stoneCost * opens
  const battles = herbSpent / HERB_PER_BATTLE + stoneSpent / stonePerBattle
  return battles / auditYield(def)
}

// ============ 取得代价:掉落品 ============

/** 掉落权重 —— 与 core/loot.ts 的 randomDropPill 同一口径:品质越高越罕见 */
export function dropWeightOf(def: PillDef): number {
  return 100 / (1 + qualityDef(def.quality).rank * 2)
}

/** 某大境界能掉出的丹药池 */
export function dropPoolAt(major: number): PillDef[] {
  return PILLS.filter(p => !p.recipe && p.minRealm <= major)
}

/** 这一味丹在某境界掉落池里的占比 */
export function dropShareAt(def: PillDef, major: number): number {
  if (def.recipe) return 0
  const pool = dropPoolAt(major)
  const total = pool.reduce((s, p) => s + dropWeightOf(p), 0)
  return total > 0 ? dropWeightOf(def) / total : 0
}

/** 期望多少场遭遇才见一枚 —— 掉落品的"代价"是稀有度,不是时间 */
export function dropBattlesOf(def: PillDef): number {
  const share = dropShareAt(def, def.minRealm)
  return share > 0 ? 1 / (PILL_DROP_CHANCE * share) : Infinity
}

// ============ 跨线对照 ============

/**
 * 一味掉落品的可炼对照:同族、规格不低于它、且品质最接近的那一味。
 *
 * 只取"规格不低于它"的 —— 拿玄品掉落丹去比良品可炼丹,比出来的是品质差不是定价差。
 * 若该族可炼线的最高品质都够不到它,返回 null:这不是数值异常,是内容缺口
 * (该族顶端尚无可炼品),须另行补内容而非砍数值。
 */
export function craftPeerOf(def: PillDef): PillDef | null {
  const fam = pillFamily(def)
  const rank = qualityDef(def.quality).rank
  let best: PillDef | null = null
  for (const p of PILLS) {
    if (!p.recipe || pillFamily(p) !== fam) continue
    const pr = qualityDef(p.quality).rank
    if (pr < rank) continue
    if (best === null || pr < qualityDef(best.quality).rank) best = p
  }
  return best
}

/** 某族某线在指定境界的药力之冠 */
export function familyPeakGain(family: PillFamily, line: PillLine, at: number): number {
  let peak = 0
  for (const p of PILLS) {
    if (pillFamily(p) !== family || pillLine(p) !== line) continue
    peak = Math.max(peak, pillGainSecAt(p, at))
  }
  return peak
}

// ============ 价值表 ============

export interface PillValueRow {
  id: string
  name: string
  quality: string
  qualityRank: number
  minRealm: number
  family: PillFamily
  line: PillLine
  /** 准入境界处的药力(等效挂机秒) */
  gainSec: number
  /** 可炼品:炼成一枚的期望战斗场次 */
  craftBattles: number
  /** 可炼品:基准手艺下的开炉成功率 */
  craftRate: number
  /** 掉落品:期望多少场遭遇见一枚 */
  dropBattles: number
  /** 掉落品:在准入境界掉落池里的占比 */
  dropShare: number
  /** 可炼品的性价比 = 药力 / 取得代价(同族内才可比) */
  ratio: number
}

export function pillValueRow(def: PillDef): PillValueRow {
  const line = pillLine(def)
  const gainSec = pillGainSec(def)
  const craftBattles = craftBattlesOf(def)
  const costSec = craftBattles * EXPLORE_BATTLE_INTERVAL
  return {
    id: def.id,
    name: def.name,
    quality: qualityDef(def.quality).name,
    qualityRank: qualityDef(def.quality).rank,
    minRealm: def.minRealm,
    family: pillFamily(def),
    line,
    gainSec,
    craftBattles,
    craftRate: line === 'craft' ? auditCraftRate(def) : 0,
    dropBattles: line === 'drop' ? dropBattlesOf(def) : 0,
    dropShare: line === 'drop' ? dropShareAt(def, def.minRealm) : 0,
    ratio: costSec > 0 ? gainSec / costSec : 0
  }
}

/** 完整价值表,按族 → 线 → 品质排序 */
export function pillValueTable(): PillValueRow[] {
  const FAMILY_ORDER: PillFamily[] = ['exp', 'qi', 'lifespan', 'wudao', 'tempo', 'state']
  return PILLS.map(pillValueRow).sort((a, b) => {
    const fa = FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family)
    if (fa !== 0) return fa
    if (a.line !== b.line) return a.line === 'craft' ? -1 : 1
    if (a.qualityRank !== b.qualityRank) return a.qualityRank - b.qualityRank
    return a.minRealm - b.minRealm
  })
}
