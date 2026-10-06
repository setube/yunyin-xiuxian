/**
 * 数值体系说明 —— 单一事实源
 *
 * 界面里要给玩家一个「这游戏怎么长」的可解释说明,但文案最容易与代码脱节:
 * 手写「每境 ×3.46」,回头把常数一改就成了谎话。故此处不写死数字,
 * 一律从 constants 里取真值,由 progressionDoc.spec 对着公式复核(改常数即同步)。
 *
 * 三条口径:
 *   1. 每个大境界的**数值**按复利增长(修为需求 / 灵气容量 / 灵气回复 / 战力)
 *   2. 每个大境界的**净耗时**增长慢于数值 —— 阶梯因此可达
 *   3. 修为与灵气可**积余**:卡在某一境时仍继续累积,越过需求的部分带走
 */
import {
  BUILDING_COST_GROWTH,
  COMBAT_MAJOR_GROWTH,
  CULT_MAJOR_SPEED_GROWTH,
  DIVINATION_COST,
  EXP_MAJOR_GROWTH,
  GONGFA_UP_GROWTH,
  LATE_COMBAT_GROWTH,
  LATE_CULT_SPEED_GROWTH,
  LATE_EXP_GROWTH,
  LATE_QI_CAP_GROWTH,
  LATE_QI_REGEN_GROWTH,
  MANSION_EVENT_LUCK,
  QI_BANK_MULT,
  QI_CAP_MAJOR_GROWTH,
  QI_REGEN_MAJOR_GROWTH,
  STONE_TIER_GROWTH,
  TRIBULATION_DIFFICULTY_CAP_MAJOR,
  UPGRADE_DUST_GROWTH
} from './constants'
import { LIFESPAN_WORLDS, REALMS, WORLDS, WORLD_BREAK_MAJOR } from './realms'
import { PALACES, STARS } from './ziwei'
import { GATES } from './qimen'
import { MANSIONS, IMAGES } from './xiangxiu'
import { TRIGRAMS, HEXAGRAMS, CHANGING_TIERS } from './yijing'

export interface ProgressionAxis {
  id: string
  name: string
  /** 人间界每境倍率 */
  mortal: number
  /** 界外每境倍率 */
  outer: number
  note: string
}

/** 各数值轴的真实复利倍率(直接取常数,不在文档里手写) */
export const PROGRESSION_AXES: ProgressionAxis[] = [
  {
    id: 'exp',
    name: '修为需求',
    mortal: EXP_MAJOR_GROWTH,
    outer: LATE_EXP_GROWTH,
    note: '突破所需修为。越过需求的部分存为积余,突破时随境界带走'
  },
  {
    id: 'qiCap',
    name: '灵气容量',
    mortal: QI_CAP_MAJOR_GROWTH,
    outer: LATE_QI_CAP_GROWTH,
    note: `标称容量。灵气可积到容量的 ${QI_BANK_MULT} 倍,不为卡境而空耗`
  },
  {
    id: 'qiRegen',
    name: '灵气回复',
    mortal: QI_REGEN_MAJOR_GROWTH,
    outer: LATE_QI_REGEN_GROWTH,
    note: '回复速率略慢于容量,故越往上越要「存」而不是「等」'
  },
  {
    id: 'attack',
    name: '战力(攻击/防御/生命)',
    mortal: COMBAT_MAJOR_GROWTH,
    outer: LATE_COMBAT_GROWTH,
    note: '与同期内容同速成长,只与「境界 + 构筑」对齐,不单方面膨胀'
  }
]

/** 净耗时倍率 = 修为需求 / 修炼速度:这才是玩家真正感受到的「难度」 */
export const MORTAL_TIME_PER_MAJOR = EXP_MAJOR_GROWTH / CULT_MAJOR_SPEED_GROWTH
export const OUTER_TIME_PER_MAJOR = LATE_EXP_GROWTH / LATE_CULT_SPEED_GROWTH

export interface CostCurve {
  id: string
  name: string
  /** 每单位(级 / 层)倍率 */
  growth: number
  /** 计量单位 */
  unit: '等级' | '层级'
  note: string
}

/** 各处花费同样是复利(不是线性),由 progressionDoc.spec 对着公式复核 */
export const COST_CURVES: CostCurve[] = [
  { id: 'building', name: '洞府建筑升级', growth: BUILDING_COST_GROWTH, unit: '等级', note: '每升一级,灵石开销 ×该倍率' },
  { id: 'gongfa', name: '功法参悟', growth: GONGFA_UP_GROWTH, unit: '等级', note: '每上一层,悟道点开销 ×该倍率' },
  { id: 'equipLevel', name: '装备强化', growth: UPGRADE_DUST_GROWTH, unit: '等级', note: '每强化一级,器灵尘开销 ×该倍率(灵石按层级另计)' },
  { id: 'stoneTier', name: '灵石掉落', growth: STONE_TIER_GROWTH, unit: '层级', note: '每上一层地界,灵石产出 ×该倍率,与花费同速' }
]

export interface LifespanCurve {
  world: string
  /** 该界域起点的寿元(跨界即一次大跃) */
  base: number
  /** 界域内每境倍率 */
  growth: number
}

/** 寿元曲线:界域内复利,跨界为大跃(取自 LIFESPAN_WORLDS,不另写数字) */
export const LIFESPAN_CURVES: LifespanCurve[] = WORLDS.map(w => ({
  world: w.name,
  base: LIFESPAN_WORLDS[w.id].base,
  growth: LIFESPAN_WORLDS[w.id].growth
}))

/** 供界面展示的固定说明(不含可变数字) */
export const PROGRESSION_NOTES = {
  worldBreakMajor: WORLD_BREAK_MAJOR,
  tribulationCapMajor: TRIBULATION_DIFFICULTY_CAP_MAJOR,
  banking: [
    '修为不封顶:卡在某一境(等突破、等灵气、渡劫失败)时,修为仍继续增长',
    '突破只扣「刚走完那一境」的需求,积余带入下一境 —— 等待不是浪费',
    `灵气可越过标称容量,积到容量的 ${QI_BANK_MULT} 倍;负伤时还能耗灵气当场疗伤(修复)`
  ],
  basis: [
    '人间界九境取内丹术与佛道之序:炼气、筑基、金丹、元婴、化神、炼虚、合体、大乘、渡劫',
    '仙界五境取道教仙阶:真仙、玄仙、金仙、太乙、大罗',
    '神界四境取网文常用神阶:神人、神将、神王、神帝',
    '混沌海三境取道家宇宙论:混沌真灵、混沌神魔、混沌道祖'
  ],
  breakthrough: [
    '小进阶的成功率不随境界无限下降 —— 那是惩罚,不是难度;难度体现在修为需求与天劫上',
    `大关须渡天劫:成败看劫型与你的解法空间(护持/续航/抗性/爆发),天劫难度在「${
      REALMS[WORLD_BREAK_MAJOR]!.name
    }」处封顶`,
    '飞升不例外:真仙、神人、混沌真灵三个跨界入口同样是天劫 —— 大关没有免劫的先例',
    '突破失败损失部分修为(可被「护道」类词条减免),但已积余的部分仍留在账上'
  ]
}

/**
 * 术数四门 —— 四层「时机」各占一层,不是四份加成叠着发。
 *
 * 说明页最容易被忽略的一段:玩家会问"这些是干什么的、会不会互相顶替"。
 * 故这里把四门的**节奏**与**代价**摆出来,数字一律取自各自模块
 * (问卦耗多少悟道点、卦管多久、星象加成几成、奇门几门),不手写。
 */
export interface SorceryLayer {
  id: 'gong' | 'ming' | 'xiang' | 'men'
  name: string
  /** 节奏:多快轮换一次 */
  cadence: string
  /** 代价 */
  cost: string
  /** 管什么 */
  note: string
}

export const SORCERY_LAYERS: SorceryLayer[] = [
  {
    id: 'gong',
    name: '周易 · 问卦',
    cadence: `一时之机 · 卦管 ${CHANGING_TIERS[0]!.minutes}~${CHANGING_TIERS[CHANGING_TIERS.length - 1]!.minutes} 分钟`,
    cost: `悟道点 ${DIVINATION_COST} · 一事不二卜`,
    note: `${TRIGRAMS.length} 卦为体、${HEXAGRAMS.length} 卦为用;动爻越多,卦力越盛而时限越短`
  },
  {
    id: 'ming',
    name: '紫微 · 命格',
    cadence: '一世之格 · 常驻',
    cost: '免费(转世重掷灵根即重排)',
    note: `${PALACES.length} 宫 ${STARS.length} 主星定底色;力薄而常驻,不受时限,也不与卦叠加同类效果`
  },
  {
    id: 'xiang',
    name: '星象 · 值日',
    cadence: `${MANSIONS.length} 日一轮 · ${IMAGES.length} 象配四界`,
    cost: '免费、被动',
    note: `只利所配界域:其地际遇 +${Math.round(MANSION_EVENT_LUCK * 100)}%,他处不加`
  },
  {
    id: 'men',
    name: '奇门 · 择门',
    cadence: '一趟远征一择',
    cost: '免费',
    note: `${GATES.length} 门各有打法(续航/抢攻/守拙/速决);不碰道源倍数 —— 那是天道契约的事`
  }
]

/** 术数四门的分工一句话(展示层用,避免把四层说成一锅加成) */
export const SORCERY_SUMMARY =
  '天时管全境之气,星象管一方界域,问卦管自己一时的机,命格定一世之格,择门定一趟的打法 —— 五层各占一层,互不顶替。'
