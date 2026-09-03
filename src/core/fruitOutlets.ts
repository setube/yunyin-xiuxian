/**
 * 道果非效率出口空间审计
 *
 * 轮回线已收尾:根因是道果同时承担「战力」与「修炼速度」两个职责,
 * 而只有后者闭合了跨世正反馈。处理方式是断开速度职责 ——
 * 但**光断不补**会把道果变成「无限增长 → 只堆战力 → 制造膨胀」。
 * 所以断边必须与「建立非效率类消费出口」配套。
 *
 * 本模块只回答三个问题,不设计具体兑换、不改数值:
 *
 *   1. 哪些出口**绝对不能**再进效率链?
 *      —— 要做成可判定的约束,而不是一张凭感觉列的禁止清单。
 *      判据是图可达性:该出口发放的东西,经任意跳数能否到达「轮回速度」。
 *
 *   2. 「消耗型 / 永久型」与「可复利 / 不可复利」是**两个正交维度**,
 *      此前一直被当成一个。区分清楚才知道理想出口长什么样。
 *
 *   3. 道果该不该被花掉?零消费会让任何阈值型出口最终失去决策意义。
 */
import type { AnyStatKey } from '@/types'
import { fruitAtLife } from './compoundingAudit'

// ============ 一、效率链可达性 ============

/**
 * 一个属性键抵达「轮回速度」的路径。
 *
 * 终点定义:**重修到下一次轮回所需的时间**。
 * 任何能压缩它的东西都会重建正反馈,无论中间隔了几跳
 */
export interface ReachPath {
  key: AnyStatKey
  /** 到终点的跳数;1 表示直接影响耗时 */
  hops: number
  /** 路径描述 */
  via: string
}

/** 直接压缩重修耗时的键(fullSecondsForMajor 的四个因子) */
const DIRECT: readonly ReachPath[] = [
  { key: 'cultivationSpeed', hops: 1, via: '修为累积速度' },
  { key: 'expGain', hops: 1, via: '修为获取量' },
  { key: 'breakthroughRate', hops: 1, via: '突破成功率 → 失败重试次数' },
  { key: 'qiRegen', hops: 1, via: '灵气回复 → 突破前的等待' },
  { key: 'lifespanPct', hops: 1, via: '寿元 → 一世可用的修行时长' }
]

/** 经战斗力抵达的键 —— 战斗更顺则历练更快,修为与掉落都来得更快 */
const VIA_COMBAT: readonly AnyStatKey[] = [
  'attackPct',
  'defensePct',
  'maxHpPct',
  'critRate',
  'critDamage',
  'speed',
  'damageBonus',
  'damageReduction',
  'armorPen',
  'firstStrike',
  'counterRate',
  'lifesteal',
  'shieldOnStart',
  'executeDamage',
  'regenPerRound',
  'dodgeRate',
  'lowHpReduction',
  'tribulationResist',
  'comboRate',
  'stunRate',
  'lowHpDamage',
  'fullHpDamage',
  'shieldPower',
  'comboDamage',
  'counterDamage',
  'overhealShield'
]

/** 经资源抵达的键 —— 资源换装备/丹药/建筑,最终仍回到战力或速度 */
const VIA_RESOURCE: readonly { key: AnyStatKey; via: string }[] = [
  { key: 'luck', via: '幸运 → 掉落品质 → 装备 → 战力' },
  { key: 'dropRate', via: '掉落率 → 装备 → 战力' },
  { key: 'doubleDropRate', via: '双倍掉落 → 装备 → 战力' },
  { key: 'eventLuck', via: '事件运 → 奇遇收益 → 资源 → 战力' },
  { key: 'spiritStoneGain', via: '灵石 → 灵脉/建筑/强化 → 速度与战力' },
  { key: 'alchemyYield', via: '丹药产出 → 属性与修为' },
  { key: 'forgeDiscount', via: '强化省耗 → 同等灵石换更多战力' },
  { key: 'breakRefund', via: '突破返还 → 灵气成本 → 突破等待' },
  { key: 'explorationSpeed', via: '历练节奏 → 单位时间收益' }
]

/** 全部属性键到「轮回速度」的可达路径 */
export const EFFICIENCY_REACH: ReachPath[] = [
  ...DIRECT,
  ...VIA_COMBAT.map(key => ({ key, hops: 2, via: '战斗表现 → 历练效率 → 修为与掉落' })),
  ...VIA_RESOURCE.map(r => ({ key: r.key, hops: 3, via: r.via }))
]

/** 该属性键是否最终可达「轮回速度」 */
export function reachesEfficiency(key: AnyStatKey): boolean {
  return EFFICIENCY_REACH.some(r => r.key === key)
}

/**
 * 整个 StatMods 命名空间是否全部可达效率链。
 *
 * 这是本次审计最要紧的一条:**没有一个属性键是「安全」的**。
 * 因此禁止清单不该逐键去列,而应整类禁止 ——
 * 任何以 StatMods 形式发放的道果出口都会重建回路
 */
export function statModsAllReachable(all: readonly AnyStatKey[]): boolean {
  return all.every(k => reachesEfficiency(k))
}

/** 全部属性键(PercentStatKey + SpecialKey),用于整类判定 */
export const ALL_STAT_KEYS: readonly AnyStatKey[] = [
  ...DIRECT.map(d => d.key),
  ...VIA_COMBAT,
  ...VIA_RESOURCE.map(r => r.key)
]

// ============ 二、两个正交维度 ============

/** 道果是否会被花掉 */
export type SpendMode =
  /** 花掉:余额减少 */
  | 'consume'
  /** 不花:达到阈值即永久生效 */
  | 'permanent'

/** 发放物的类别 */
export type PayloadKind =
  /** 属性修正(StatMods) */
  | 'stats'
  /** 资源(灵石/材料/丹药) */
  | 'resource'
  /** 内容准入(命题、规则、世界入口) */
  | 'access'
  /** 知识与记录(认知、图鉴、历史) */
  | 'record'

export interface OutletCandidate {
  id: string
  name: string
  spend: SpendMode
  payload: PayloadKind
  /** 是否重建效率回路 */
  rebuildsLoop: boolean
  /** 是否已在项目里存在可挂载的系统 */
  hasHost: boolean
  note: string
}

/**
 * 候选出口。
 *
 * 注意 `rebuildsLoop` 与 `spend` 不相关 —— 这正是两个维度正交的证据:
 * 「一次性花掉」并不保证安全,若买到的是永久属性,回路照样闭合
 */
export const OUTLETS: OutletCandidate[] = [
  {
    id: 'permStat',
    name: '兑换永久属性',
    spend: 'consume',
    payload: 'stats',
    rebuildsLoop: true,
    hasHost: true,
    note: '反例:花掉道果买 +5% 修炼速度 —— 花掉了,但回路原样闭合'
  },
  {
    id: 'resourcePack',
    name: '兑换资源礼包',
    spend: 'consume',
    payload: 'resource',
    rebuildsLoop: true,
    hasHost: true,
    note: '反例:灵石/丹药最终换成战力与速度,只是把回路拉长一跳'
  },
  {
    id: 'themeUnlock',
    name: '命题资格',
    spend: 'consume',
    payload: 'access',
    rebuildsLoop: false,
    hasHost: true,
    note: 'lifeThemes 已存在且按阶位开放;命题奖励是宿慧与叙事,不进 StatMods'
  },
  {
    id: 'ruleCarry',
    name: '携带规则入世',
    spend: 'consume',
    payload: 'access',
    rebuildsLoop: false,
    hasHost: true,
    note: 'mutators/pacts 已有完整规则库与三重审计门,但目前只用于天界'
  },
  {
    id: 'worldEntry',
    name: '特殊世界入口',
    spend: 'consume',
    payload: 'access',
    rebuildsLoop: false,
    hasHost: true,
    note: 'worldGen 已能生成带平衡门的世界;入口本身不给属性'
  },
  {
    id: 'loreResearch',
    name: '高阶认知研究',
    spend: 'consume',
    payload: 'record',
    rebuildsLoop: false,
    hasHost: true,
    note: 'lore store 已存在;但须注意认知会经 craftability 间接影响战力,属于慢速通道'
  },
  {
    id: 'history',
    name: '历史与纪念',
    spend: 'permanent',
    payload: 'record',
    rebuildsLoop: false,
    hasHost: true,
    note: '图鉴与履历;不进任何计算,是最安全但也最弱的出口'
  },
  {
    id: 'irreversible',
    name: '不可逆的人生选择',
    spend: 'consume',
    payload: 'access',
    rebuildsLoop: false,
    hasHost: false,
    note: '尚无宿主系统;须新建。参照师承的「拿一次锁死」写法'
  }
]

/** 合格出口:不重建效率回路 */
export function qualifiedOutlets(): OutletCandidate[] {
  return OUTLETS.filter(o => !o.rebuildsLoop)
}

/** 被否决的出口 */
export function rejectedOutlets(): OutletCandidate[] {
  return OUTLETS.filter(o => o.rebuildsLoop)
}

export interface Quadrant {
  spend: SpendMode
  loops: boolean
  label: string
  verdict: string
}

/** 两个维度交叉出的四个象限 */
export const QUADRANTS: Quadrant[] = [
  { spend: 'permanent', loops: true, label: '不花 + 进效率链', verdict: '现状,最差:无限积累且自动加速' },
  { spend: 'consume', loops: true, label: '花掉 + 进效率链', verdict: '看似有决策,回路仍在,只是延后' },
  { spend: 'permanent', loops: false, label: '不花 + 不进效率链', verdict: '安全但无决策:纯收藏' },
  { spend: 'consume', loops: false, label: '花掉 + 不进效率链', verdict: '理想:第一次产生真正的资源决策' }
]

export function idealQuadrant(): Quadrant {
  return QUADRANTS.find(q => q.spend === 'consume' && !q.loops)!
}

// ============ 三、零消费的后果 ============

export interface BudgetRow {
  life: number
  balance: number
  /** 相对一个定价 P 的出口,余额是它的几倍 */
  timesPrice: number
}

/**
 * 零消费下的余额曲线。
 *
 * 道果只进不出,余额随世代线性增长。任何**阈值型**出口
 * (「300 道果解锁 X」)在余额远超定价之后就不再构成选择 ——
 * 玩家不必权衡,只需等待
 */
export function budgetCurve(price: number, lives = 30): BudgetRow[] {
  const out: BudgetRow[] = []
  for (let life = 1; life <= lives; life += 1) {
    const balance = fruitAtLife(life)
    out.push({ life, balance, timesPrice: price > 0 ? balance / price : 0 })
  }
  return out
}

/** 一个定价 P 的阈值型出口,在第几世后余额超过它 n 倍(即失去权衡意义) */
export function trivialAtLife(price: number, times = 3, maxLives = 200): number {
  for (let life = 1; life <= maxLives; life += 1) {
    if (fruitAtLife(life) >= price * times) return life
  }
  return -1
}

export { fruitAtLife }
