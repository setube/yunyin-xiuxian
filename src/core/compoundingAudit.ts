/**
 * 跨世复利审计
 *
 * 指标换了。前几轮问的是「浅轮回能推进多少永久资产」,答案 44%/56% 已经
 * 验证了路线分离。但那张表把不同性质的东西混在一起数了 ——
 * `灵兽 +1` 是永久资产却不会让轮回越来越快,`资质地板 +5` 只是一个数字
 * 却持续作用于整个生命周期。
 *
 * 本轮问的是:**一次金丹轮回到底留下多少「可影响下一世效率」的永久增益?**
 *
 * 判据是一条硬链路:该资产是否最终汇入下一世的 `cultivationSpeed` 或战力,
 * 且**无需玩家额外操作**。汇入的才叫复利,否则只是收藏。
 *
 * 追出来的链路:
 *   轮回次数 → aptitudeFloorNow → rollLinggen 的 aptitude → growthMult
 *            → linggenMult → computeFinalStats 的 cultExtra
 *   道果     → effectiveDaoFruit → 同一个 cultExtra(另加战力乘区)
 *
 * 两者是**加法叠加进同一个口子**,所以可以放在同一把尺子上比。
 *
 * 口径承袭 rebirthRoi:绝对小时数不可信(见 saveCalibration),
 * 但全部读数都是同一把尺子下的比值,偏差在相除时抵消。
 */
import { daoFruitGain } from './formulas'
import { effectiveDaoFruit } from './statsCalc'
import { fullHoursToReach } from './rebirthRoi'
import { MANUAL_REBIRTH_MIN_MAJOR } from './reincarnation'
import { DAO_FRUIT_CULT_BONUS, REINCARNATE_APTITUDE_FLOOR } from '@/data/constants'

// ============ 一、复利的判定 ============

/** 一项永久资产的跨世复利性质 */
export type CompoundKind =
  /** 自动生效、无上限 —— 每轮回一次,下一世永远更快一点 */
  | 'auto-unbounded'
  /** 自动生效、会饱和 —— 涨到头就不再产生新的加速 */
  | 'auto-saturating'
  /** 要玩家额外操作才兑现 —— 不构成自动正反馈 */
  | 'manual'
  /** 不进效率链 —— 是收藏或历史,不是复利 */
  | 'inert'

export interface CompoundAsset {
  id: string
  name: string
  kind: CompoundKind
  /** 汇入效率的通道;inert 时为 null */
  channel: string | null
  /** 饱和条件(auto-saturating 时有意义) */
  saturateAt: string | null
  /** 是否在此前那张永久资产表里出现过 */
  inAssetTable: boolean
  evidence: string
}

/**
 * 金丹轮回一世留下的东西,按「会不会让下一世更快」重新归类。
 *
 * 注意最后两项:资质地板与称号**都不在此前的永久资产表里**,
 * 但两者都自动汇入 cultivationSpeed。漏掉它们,
 * 「浅轮回只剩四项」这个结论就把复利面低估了
 */
export const COMPOUND_ASSETS: CompoundAsset[] = [
  {
    id: 'daoFruit',
    name: '道果',
    kind: 'auto-unbounded',
    channel: 'effectiveDaoFruit → cultExtra + 战力乘区',
    saturateAt: null,
    inAssetTable: true,
    evidence: `computeFinalStats:cultExtra += fruit^0.9 × ${DAO_FRUIT_CULT_BONUS};同一个 fruit 还进 attack/defense/maxHp 的乘区`
  },
  {
    id: 'aptitudeFloor',
    name: '资质地板',
    kind: 'auto-saturating',
    channel: 'aptitudeFloorNow → growthMult → linggenMult → cultExtra',
    saturateAt: '地板 ≥ 60 时任何 roll 都顶到 100',
    inAssetTable: false,
    evidence: `rollLinggen:aptitude = min(100, rng.int(40,100) + floor);floor = max(次数×${REINCARNATE_APTITUDE_FLOOR}, 宿慧/12)`
  },
  {
    id: 'title',
    name: '称号',
    kind: 'auto-saturating',
    channel: 'titleMods → mergeMods → cultivationSpeed',
    saturateAt: '装上最优的一个即止(titleId 单值)',
    inAssetTable: false,
    evidence: '成就可发 titleId,称号带 cultivationSpeed/attackPct;confirmReincarnation 不重置 titleId'
  },
  {
    id: 'pet',
    name: '灵兽',
    kind: 'auto-saturating',
    channel: 'petMods → mergeMods → cultivationSpeed',
    saturateAt: '装上最优的一只即止(petId 单值)',
    inAssetTable: true,
    evidence: 'PETS 带 cultivationSpeed 0.08 等 mods,但 petId 单值 —— 收集更多只是多备选,不叠加'
  },
  {
    id: 'lore',
    name: '基础认知',
    kind: 'manual',
    channel: 'craftability(炼制成功率与品质)',
    saturateAt: null,
    inAssetTable: true,
    evidence: '认知走 craftability 而非 cultivationSpeed;要玩家真去炼才兑现,不自动加速'
  },
  {
    id: 'achievements',
    name: '成就与图鉴',
    kind: 'inert',
    channel: null,
    saturateAt: null,
    inAssetTable: true,
    evidence: 'RewardBundle 只有 stoneTier/herb/ore/pill 等资源(轮回清零)与 titleId;复利部分已计入「称号」一行'
  }
]

/** 自动生效的复利项 —— 只有这些构成正反馈 */
export function autoCompounding(): CompoundAsset[] {
  return COMPOUND_ASSETS.filter(a => a.kind === 'auto-unbounded' || a.kind === 'auto-saturating')
}

/** 此前那张永久资产表漏掉的复利项 */
export function missedByAssetTable(): CompoundAsset[] {
  return autoCompounding().filter(a => !a.inAssetTable)
}

// ============ 二、资质地板的期望值 ============

/** 灵根条数权重(rollLinggen 的 COUNT_WEIGHTS) */
const COUNT_W: readonly { n: number; w: number; f: number }[] = [
  { n: 1, w: 12, f: 1.6 },
  { n: 2, w: 30, f: 1.35 },
  { n: 3, w: 34, f: 1.15 },
  { n: 4, w: 16, f: 1.0 },
  { n: 5, w: 8, f: 0.9 }
]
/** 特殊灵根替换概率与倍率 */
const SPECIAL_P = 0.1
const SPECIAL_F = 1.2
/** rollLinggen 的 aptitude 区间 */
const APT_LO = 40
const APT_HI = 100

/**
 * 给定资质地板,单根资质的期望。
 *
 * aptitude = min(100, U(40,100) + floor) —— 截断使它在 floor≥60 时完全饱和
 */
export function expectedAptitude(floor: number): number {
  const f = Math.max(0, floor)
  if (f >= APT_HI - APT_LO) return APT_HI
  const span = APT_HI - APT_LO
  // 未被截断的那一段:U(40+f, 100),占比 (span-f)/span,均值 (40+f+100)/2
  const pUnder = (span - f) / span
  return pUnder * ((APT_LO + f + APT_HI) / 2) + (1 - pUnder) * APT_HI
}

/** 条数因子与特殊灵根的期望(与资质地板无关,可提出来) */
const EXPECTED_FACTOR =
  (COUNT_W.reduce((s, c) => s + c.w * c.f, 0) / COUNT_W.reduce((s, c) => s + c.w, 0)) *
  (SPECIAL_P * SPECIAL_F + (1 - SPECIAL_P))

/** 给定资质地板的期望成长倍率(rollLinggen 的 growthMult) */
export function expectedGrowthMult(floor: number): number {
  return (expectedAptitude(floor) / 60) * EXPECTED_FACTOR
}

/** 第 life 世开局的资质地板(life 从 1 起;第一世尚未轮回,count=0) */
export function floorAtLife(life: number): number {
  return REINCARNATE_APTITUDE_FLOOR * Math.max(1, life)
}

/** 资质地板饱和于第几世 */
export function saturationLife(): number {
  for (let life = 1; life <= 200; life += 1) {
    if (floorAtLife(life) >= APT_HI - APT_LO) return life
  }
  return -1
}

// ============ 三、复利曲线 ============

/** 金丹圆满转世一次凝的道果 */
export const FRUIT_PER_GOLD_LIFE = daoFruitGain(MANUAL_REBIRTH_MIN_MAJOR, 9)

/** 第 life 世开局时的累计道果(前 life-1 次轮回的产物) */
export function fruitAtLife(life: number): number {
  return Math.max(0, life - 1) * FRUIT_PER_GOLD_LIFE
}

export interface LifeRow {
  life: number
  floor: number
  linggenMult: number
  fruit: number
  /** 灵根贡献的 cultivationSpeed 增量 */
  cultFromLinggen: number
  /** 道果贡献的 cultivationSpeed 增量 */
  cultFromFruit: number
  /** 重修到金丹圆满的相对耗时(小时,仅供比值) */
  hours: number
  /** 相对第一世的耗时比 */
  vsFirst: number
}

/**
 * 逐世的复利表。
 *
 * `only` 用于拆分归因:
 *   'both'    两条通道都开
 *   'linggen' 只让资质地板增长,道果固定为零
 *   'fruit'   只让道果增长,灵根固定为第一世的水平
 */
export function lifeTable(lives: number, only: 'both' | 'linggen' | 'fruit' = 'both'): LifeRow[] {
  const base = expectedGrowthMult(floorAtLife(1))
  const out: LifeRow[] = []
  let first = 0
  for (let life = 1; life <= lives; life += 1) {
    const floor = floorAtLife(life)
    const linggenMult = only === 'fruit' ? base : expectedGrowthMult(floor)
    const fruit = only === 'linggen' ? 0 : fruitAtLife(life)
    // 目标境界 = 金丹圆满,故修满 major 0..MANUAL_REBIRTH_MIN_MAJOR
    const hours = fullHoursToReach(MANUAL_REBIRTH_MIN_MAJOR + 1, fruit, { linggenMult, talentCultBonus: 0 })
    if (life === 1) first = hours
    out.push({
      life,
      floor,
      linggenMult,
      fruit,
      cultFromLinggen: linggenMult - 1,
      cultFromFruit: effectiveDaoFruit(fruit) * DAO_FRUIT_CULT_BONUS,
      hours,
      vsFirst: hours / first
    })
  }
  return out
}

/** 复利强度:第 life 世重修到金丹比第一世快多少倍 */
export function speedupAt(life: number, only: 'both' | 'linggen' | 'fruit' = 'both'): number {
  const t = lifeTable(life, only)
  return 1 / t[t.length - 1]!.vsFirst
}

export interface Attribution {
  life: number
  /** 两条通道全开的提速倍数 */
  both: number
  /** 只有资质地板的提速倍数 */
  linggenOnly: number
  /** 只有道果的提速倍数 */
  fruitOnly: number
  /** 资质地板在总提速里占的份额 */
  linggenShare: number
}

/** 归因:两条自动通道各贡献了多少提速 */
export function attributionAt(life: number): Attribution {
  const both = speedupAt(life, 'both')
  const linggenOnly = speedupAt(life, 'linggen')
  const fruitOnly = speedupAt(life, 'fruit')
  // 以「超出 1 倍的部分」计份额,避免把基准也算进贡献
  const lg = linggenOnly - 1
  const fr = fruitOnly - 1
  return { life, both, linggenOnly, fruitOnly, linggenShare: lg + fr > 0 ? lg / (lg + fr) : 0 }
}

/**
 * 边际提速:第 life 世相对第 life-1 世又快了多少。
 *
 * 这才是玩家真正感受到的「再轮回一次值不值」。
 * 若它长期不趋零,浅轮回就存在持续的正反馈
 */
export function marginalSpeedup(lives: number): { life: number; gain: number }[] {
  const t = lifeTable(lives)
  const out: { life: number; gain: number }[] = []
  for (let i = 1; i < t.length; i += 1) {
    out.push({ life: t[i]!.life, gain: t[i - 1]!.hours / t[i]!.hours - 1 })
  }
  return out
}

export { MANUAL_REBIRTH_MIN_MAJOR, REINCARNATE_APTITUDE_FLOOR }
