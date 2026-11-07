/**
 * 丹药价值模型:全部丹药折成同一口径比较。不改数值;校准落在 data/pills.ts,定价法则由 pillValue.spec.ts 守。
 *
 * 药力(gainSec)= 等效挂机秒数。随境界:expSecs 恒定(封顶一层);expFixed 每大境界 ÷5.2;
 * qiPct 近乎恒定;lifespanYears 绝对值恒定、相对寿限急剧贬值;wudao 恒定(功法升级开销指数增长)。
 * 一层耗时 = 25 × 3.4615^m × 1.2453^s 秒。
 *
 * 代价:掉落品按稀有度(期望多少场遭遇见一枚),可炼品按灵草、灵石、炸炉赔料;两线跨线只比药力绝对值。
 *
 * 局限:跨族不可比(量纲不同),只在族内比;寿元按绝对秒数计,被高估;
 * 一场战斗折 12 秒未扣战斗自身产出,高估取得代价(保守方向)。
 */
import type { PillDef } from '@/types'
import { PILLS, pillQualityName, pillRank } from '@/data/pills'
import { buffDef } from '@/data/buffs'
import { recipeCraft } from '@/data/crafting'
import { maxTierForMajor } from '@/data/regions'
import {
  AGE_YEARS_PER_HOUR,
  EXPLORE_BATTLE_INTERVAL,
  LIBRARY_WUDAO_PER_HOUR,
  PILL_DROP_CHANCE,
  INSTANT_EXP_LAYER_CAP
} from '@/data/constants'
import { toNum } from '@/utils/gnum'
import { baseCultPerSec, baseQiRegen, expRequirement, qiCap, stoneByTier } from './formulas'
import { bearableRank, bonusChanceOf, composeSuccessRate } from './craftability'
import { salvageRatio } from './pillService'

// ============ 审计基准 ============

/** 折算取值的小层:第五层(共十层),代表大境界常态 */
export const AUDIT_SUB = 5

/**
 * 基准手艺:熟练度 60(「娴熟」,约 900 点累积经验)、丹方烂熟、方中灵材全通晓。
 * 不取满值:熟练度双曲饱和够不到 100,取极限会系统性低估取得代价。
 */
export const AUDIT_SKILL = 60
const AUDIT_MASTERY = 1
const AUDIT_MATERIAL_LORE = 1

/** 一场战斗的期望灵草产出(同源 core/loot.ts afterWin:五成概率掉 1~3 株) */
const HERB_PER_BATTLE = 0.5 * 2
/** 一场战斗的期望灵石产出系数(rng.float(0.8,1.2) 的均值为 1.0) */
export const STONE_AMT_PER_BATTLE = 10

/**
 * 掉落品的药力上限:同族同规格可炼品的六成。
 * 取自寿元线(凤髓膏对千年延寿丹、蟠桃对万寿金丹均为五成),红线放到六成留余量。
 */
export const DROP_CRAFT_RATIO = 0.6

// ============ 分族 ============

/** 丹药的计价轴。state 族(战斗/气运/突破增益)折不成时间,只审规格一致性 */
export type PillFamily = 'exp' | 'qi' | 'lifespan' | 'wudao' | 'tempo' | 'state'

/** 取得方式:炼出来的 / 捡到的 */
export type PillLine = 'craft' | 'drop'

/**
 * 状态类丹药里唯一折成时间的一份:修炼速度。
 * expGain、explorationSpeed 是另两条产出渠道,与挂机秒数不同量纲,不并入。
 */
function tempoRateOf(def: PillDef): number {
  if (def.kind !== 'buff' || !def.buffId) return 0
  const mods = buffDef(def.buffId)?.mods
  if (!mods) return 0
  /*
   * 灵气回复按 0.3 折算成修炼加速。
   *
   * 突破不吃灵气,灵气只用于战斗消耗与灵气条充盈,所以回复加快的价值低于等量的
   * 修炼加速 —— 0.3 是保守取法,只求把「带 qiRegen 的丹」从口径外拉回可比口径,
   * 不追求精确等价。全库只有混天丹一味带 qiRegen;不收进来时它的每-成本
   * 看上去比 18 境的本源丹还差 78%,而同品草带内本应越晚越划算。
   */
  const speed = mods.cultivationSpeed ?? 0
  const regen = (mods.qiRegen ?? 0) * 0.3
  return Math.max(0, speed + regen)
}

export function pillFamily(def: PillDef): PillFamily {
  const i = def.instant
  if (def.kind === 'instant' && i) {
    if (i.expSecs || i.expFixed) return 'exp'
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

/** 某境界修满一小层的秒数,一切折算的标尺 */
export function layerSeconds(major: number): number {
  const m = Math.max(0, major)
  return toNum(expRequirement(m, AUDIT_SUB)) / baseCultPerSec(m, AUDIT_SUB)
}

/** 一枚丹在指定境界的药力(等效挂机秒)。跨丹比较须统一境界。 */
export function pillGainSecAt(def: PillDef, major: number): number {
  const m = Math.max(0, major)
  const i = def.instant
  if (def.kind === 'instant' && i) {
    // expSecs 即等效秒数,与境界无关;上限「不满一层」(INSTANT_EXP_LAYER_CAP)只在低境界起作用
    if (i.expSecs) return Math.min(i.expSecs, layerSeconds(m) * INSTANT_EXP_LAYER_CAP)
    // 固定点数同封顶「不满一层」
    if (i.expFixed) return Math.min(i.expFixed, toNum(expRequirement(m, AUDIT_SUB)) * INSTANT_EXP_LAYER_CAP) / baseCultPerSec(m, AUDIT_SUB)
    if (i.qiPct) return (i.qiPct * qiCap(m, AUDIT_SUB)) / baseQiRegen(m)
    if (i.lifespanYears) return (i.lifespanYears * 3600) / AGE_YEARS_PER_HOUR
    if (i.wudao) return (i.wudao * 3600) / LIBRARY_WUDAO_PER_HOUR
  }
  const rate = tempoRateOf(def)
  if (rate > 0 && def.buffId) return (buffDef(def.buffId)?.durationSec ?? 0) * rate
  return 0
}

/** 自身准入境界处的药力 */
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
  return 1 + bonusChanceOf(AUDIT_MASTERY, AUDIT_SKILL)
}

/**
 * 炼成一枚的期望代价,折成战斗场次:灵草、灵石、炸炉赔料。
 * 失手灵石全损,灵草按 pillService.salvageRatio 保下一部分。
 */
export function craftBattlesOf(def: PillDef): number {
  if (!def.recipe) return 0
  // 层级单一事实源:区域表(与 pillService.pillCraftCost 同口径)
  const tier = maxTierForMajor(def.minRealm)
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

/** 掉落权重,须与 core/loot.ts 的 randomDropPill 同口径 */
export function dropWeightOf(def: PillDef): number {
  return 100 / (1 + pillRank(def) * 2)
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

/** 期望多少场遭遇才见一枚 */
export function dropBattlesOf(def: PillDef): number {
  const share = dropShareAt(def, def.minRealm)
  return share > 0 ? 1 / (PILL_DROP_CHANCE * share) : Infinity
}

// ============ 跨线对照 ============

/**
 * 一味掉落品的可炼对照:同族、规格不低于它、且品质最接近的那一味。
 * 该族可炼线够不到它时返回 null:内容缺口,不是数值异常。
 */
export function craftPeerOf(def: PillDef): PillDef | null {
  const fam = pillFamily(def)
  const rank = pillRank(def)
  let best: PillDef | null = null
  for (const p of PILLS) {
    if (!p.recipe || pillFamily(p) !== fam) continue
    const pr = pillRank(p)
    if (pr < rank) continue
    if (best === null || pr < pillRank(best)) best = p
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
    quality: pillQualityName(def),
    qualityRank: pillRank(def),
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
