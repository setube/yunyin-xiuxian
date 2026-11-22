/** 全局类型定义:游戏领域模型集中于此 */

// ============ 大数 ============
/** 大数:value = m × 10^e,m ∈ [1,10) 或 0 */
export interface GNum {
  m: number
  e: number
}

// ============ 前期玩法 ============
/** 悟道顿悟类型 */
export type EnlightenmentType = 'cultivation' | 'combat' | 'breakthrough' | 'qi' | 'insight'

/** 悟道顿悟选项 */
export interface EnlightenmentOption {
  type: EnlightenmentType
  label: string
  desc: string
  /** 生效的 buff;无 buff 的选项走即时 reward */
  buffId?: string
  /** 持续时间(秒) */
  duration: number
  /** 即时奖励,不走 buff(悟道产出无速率词条可挂) */
  reward?: { type: 'wudao'; value: number }
}

/** 悟道顿悟实例(60秒窗口) */
export interface EnlightenmentEvent {
  id: string
  options: EnlightenmentOption[]
  triggeredAt: number
  /** 过期时间戳(triggeredAt + 60s) */
  expiresAt: number
}


/** 奇遇连锁状态(玩家已触发的连锁ID → 当前阶段) */
export type EventChainState = Record<string, number>

/** 洞府巡游小事件 */
export interface CaveEvent {
  id: string
  location: 'field' | 'furnace' | 'library' | 'array' | 'garden'
  title: string
  desc: string
  options: Array<{
    label: string
    effect: string
    /** 修为按等效闭关秒数(secs)计价,与丹药/际遇同尺,封顶不满一层;其余资源走固定 value */
    reward?:
      | { type: 'exp'; secs: number }
      | { type: 'stone' | 'herb' | 'wudao'; value: number }
      | { type: 'buff'; value: string }
    penalty?: { type: 'cultivationSpeed' | 'qiMax'; value: number; duration: number }
  }>
  triggeredAt: number
  expiresAt: number
}

/** 突破准备选项 */
export interface BreakthroughPrepOption {
  id: string
  label: string
  desc: string
  cost?: { stone?: number; pill?: string }
  bonusRate: number
  /** 耗时(秒),0表示立即 */
  duration: number
}

// ============ 五行灵根 ============
export type ElementId = 'metal' | 'wood' | 'water' | 'fire' | 'earth' | 'wind' | 'thunder' | 'ice' | 'light' | 'dark' | 'chaos'

export interface SpiritRoot {
  element: ElementId
  /** 资质 30~100 */
  aptitude: number
}

export interface LinggenProfile {
  roots: SpiritRoot[]
  gradeName: string
  /** 修炼速度总倍率 */
  growthMult: number
}

// ============ 属性系统 ============
/** 百分比类属性(0.12 = +12%) */
export type PercentStatKey =
  | 'attackPct'
  | 'defensePct'
  | 'maxHpPct'
  | 'critRate'
  | 'critDamage'
  | 'speed'
  | 'damageBonus'
  | 'damageReduction'
  | 'cultivationSpeed'
  | 'qiRegen'
  | 'breakthroughRate'
  | 'luck'
  | 'explorationSpeed'
  | 'lifespanPct'
  | 'spiritStoneGain'
  | 'dropRate'
  | 'expGain'
  | 'alchemyYield'
  | 'forgeDiscount'
  | 'qiCapPct'
  | 'beastPct'

/** 特殊词条(战斗/系统内特判) */
export type SpecialKey =
  | 'armorPen'
  | 'firstStrike'
  | 'counterRate'
  | 'lifesteal'
  | 'shieldOnStart'
  | 'executeDamage'
  | 'regenPerRound'
  | 'dodgeRate'
  /** 命中:与目标闪避按百分点直接相减,闪避不压成负数 */
  | 'accuracy'
  | 'lowHpReduction'
  | 'breakRefund'
  | 'doubleDropRate'
  | 'eventLuck'
  | 'tribulationResist'
  | 'comboRate'
  | 'stunRate'
  // ---- 流派条件型 ----
  | 'lowHpDamage'
  | 'fullHpDamage'
  | 'shieldPower'
  | 'comboDamage'
  | 'counterDamage'
  | 'overhealShield'

export type AnyStatKey = PercentStatKey | SpecialKey
export type StatMods = Partial<Record<AnyStatKey, number>>

/** 汇总后的最终属性 */
export interface FinalStats {
  attack: GNum
  defense: GNum
  maxHp: GNum
  power: GNum
  mods: StatMods
  /**
   * 属性来源明细,面板读它,不另算。
   * onTop 条目(道果)不并入百分比,另乘在攻防血/修炼上,展示须标「另乘」。
   * 修炼速度明细已按软阈值折算(cultSpeedFactor 摊回各来源),明细之和 == 面板值(spec 钉:statBreakdown.spec)。
   */
  breakdown: StatSourceRow[]
  /** 修炼速度合计是否越过 CULT_SPEED_SOFT_CAP_T,展示层据此标「软」;与 SOFT_CAPS(只管战斗词条)无关 */
  cultSpeedSoftCapped: boolean
  /**
   * 修炼速度软阈值折算系数 = cultCapped / cultTotal;未越阈值恒为 1,已摊回 breakdown。
   * 单独引用的修炼速度份额须乘它才与面板一致。
   */
  cultSpeedFactor: number
}

/** 一条属性来源:谁给的、给了多少 */
export interface StatSourceRow {
  name: string
  mods: StatMods
  /** true = 不入百分比相加,另行乘算(目前只有道果) */
  onTop?: boolean
}

// ============ 品质 ============
export type QualityId = 'mortal' | 'fine' | 'excellent' | 'spirit' | 'profound' | 'earth' | 'heaven' | 'immortal' | 'divine'

export interface QualityDef {
  id: QualityId
  name: string
  /** 品质序号 0~8 */
  rank: number
  /** 数值倍率 */
  mult: number
  /** 词条数量范围 */
  affixes: [number, number]
  /** 现世层级窗口:本品质只在 [fromTier, toTier] 内正常掉落;窗口外留一线(QUALITY_OUT_OF_BAND,万分之几) */
  fromTier: number
  toTier: number
  /** 掉落权重 */
  weight: number
  /** css 颜色变量名 */
  color: string
}

// ============ 装备 ============
export type EquipSlot = 'weapon' | 'head' | 'body' | 'wrist' | 'belt' | 'boots' | 'necklace' | 'ring' | 'artifact' | 'talisman'

export interface EquipmentTemplate {
  id: string
  name: string
  slot: EquipSlot
  icon: string
  desc: string
  /** 基础属性权重(实际数值 = 权重 × 层级系数 × 品质倍率) */
  base: Partial<Record<'attack' | 'defense' | 'maxHp', number>>
  /** 模板固有百分比属性 */
  fixedMods?: StatMods
  /**
   * 所属层级,一阶一名。掉落池按它取(core/equipGen.templatesAtTier),地界只出同阶之物。
   * 与法宝 fromTier(累积池)不同。
   */
  tier: number
  /** 装备套装/共鸣组(同组多件触发机制效果,非数值堆叠) */
  set?: string
}

export type AffixRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface AffixDef {
  id: string
  name: string
  /** 描述模板,{v} 为数值占位 */
  desc: string
  key: AnyStatKey
  min: number
  max: number
  decimals: number
  weight: number
  /** 词条稀有度(影响重铸封存成本) */
  rarity: AffixRarity
  slots?: EquipSlot[]
  /** 出现所需最低品质序号 */
  minRank?: number
}

export interface AffixRoll {
  id: string
  /** 0~1 之间的随机档位 */
  roll: number
}

export interface EquipmentInstance {
  uid: string
  templateId: string
  quality: QualityId
  /** 掉落层级(决定基础数值量级) */
  tier: number
  /** 强化等级 */
  level: number
  affixes: AffixRoll[]
  locked?: boolean
  /** 已重铸次数(成本按次翻倍) */
  reforgeCount?: number
  /** 已封存的词条 id(重铸时不会被替换) */
  sealedAffixIds?: string[]
  /** 累计强化投入(分解时按八成返还;老档无此账,按标价补算) */
  invested?: { dust: number; stone: GNum }
  /** 玩家自定短标记,至多 4 个汉字;老档/未标记件为 undefined */
  note?: string
  /** 被转入词条的次数,只增不减;智能收纳据此视为有投入。老档/未转入件为 undefined */
  transferCount?: number
}

// ============ 法宝 ============
export type ArtifactEffect =
  | { type: 'damage'; mult: number }
  | { type: 'shield'; pctMaxHp: number }
  | { type: 'heal'; pctMaxHp: number }
  | { type: 'weaken'; pct: number }
  /** 震慑:敌人跳过下一次行动 */
  | { type: 'stun' }
  /** 破甲:敌人防御在本场余下回合按比例下降 */
  | { type: 'sunder'; pct: number }
  /**
   * 净念:自身将被震慑时以 pct 概率挣脱,照常出手。
   * 随身被动,不受 interval 节拍约束(数据里 interval 记 1,即常在)。
   */
  | { type: 'purge'; pct: number }
  /** 吸命:造成伤害,并把其中 healPct 回补自身 */
  | { type: 'drain'; mult: number; healPct: number }

export interface ArtifactDef {
  id: string
  name: string
  /** 风味一句,口径为凡品零重基线(见 data/artifacts.artifactValue) */
  desc: string
  icon: string
  /** 品阶:定掉落权重与数值倍率,口径在 data/artifacts */
  quality: QualityId
  /** 从这一阶起可现世(累积池:更高阶的地界也掉) */
  fromTier: number
  /** 被动,凡品零重基线;品阶与祭炼放大由 artifactValue 施加 */
  passive: StatMods
  active: {
    name: string
    /** 神通文案,凡品零重基线;展示走 artifactActiveText 现算 */
    desc: string
    /** 每隔几回合自动触发 */
    interval: number
    effect: ArtifactEffect
  }
}

export interface ArtifactOwned {
  defId: string
  level: number
}

// ============ 功法 ============
export type GongfaType = 'main' | 'sub' | 'secret'

export interface GongfaDef {
  id: string
  name: string
  type: GongfaType
  quality: QualityId
  desc: string
  element?: ElementId
  baseMods: StatMods
  perLevelMods: StatMods
  maxLevel: number
  /** 主修功法附带战斗技能 */
  skill?: { name: string; mult: number; rate: number }
  minRealm: number
}

// ============ 丹药 / Buff ============
/**
 * 丹药品阶。dao(道品)为丹药专属顶档,不入 QUALITIES,比神品高半档(混沌海,境界 18-20)。
 * rank/名/色解析一律走 data/pills.ts 的 pillRank/pillQualityName/pillQualityColor。
 */
export type PillQuality = QualityId | 'dao'

export interface PillDef {
  id: string
  name: string
  desc: string
  icon: string
  quality: PillQuality
  kind: 'instant' | 'buff'
  instant?: {
    /**
     * 等效闭关秒数:修为 += 服丹者当下修炼速度 × 本秒数,封顶不满一层(core/pillService、INSTANT_EXP_LAYER_CAP)。
     * 改回 `expReqPct`(按当前一层需求百分比)会让囤丹抹平境界壁垒。
     */
    expSecs?: number
    /** 固定修为点数(低品质丹药,与境界无关) */
    expFixed?: number
    /** 灵气回满比例(上限的五成/十成);容量与回速同阶,故用百分比 */
    qiPct?: number
    lifespanYears?: number
    wudao?: number
  }
  buffId?: string
  /** 炼丹配方(灵草数量,灵石按境界层级换算) */
  recipe?: { herb: number; stoneBase: number }
  /** 配方解锁所需炼丹炉等级 */
  alchemyLevel?: number
  minRealm: number
}

export interface BuffDef {
  id: string
  name: string
  desc: string
  icon: string
  durationSec: number
  mods: StatMods
  kind: 'pill' | 'injury' | 'blessing'
}

export interface BuffInstance {
  defId: string
  endsAt: number
  /** 累积时长(毫秒):每次施加累加单份时长,UI 据此报「已叠 N 份」(单看 endsAt 算不出);旧档缺省 */
  added?: number
}

// ============ 境界 ============
/** 界域 —— 人间界 / 仙界 / 神界 / 混沌海 */
export type WorldId = 'mortal' | 'immortal' | 'god' | 'chaos'

export interface RealmDef {
  id: string
  name: string
  world: WorldId
  lifespanYears: number
  /** 该境界主题描述 */
  desc: string
  /** 命名出处(内丹术 / 道教仙阶 / 佛教 / 道家宇宙论 / 网文常用)与排在上一境之后的理由 */
  lore: string
  basis: RealmBasis
}

/** 境界命名的主要出处类别 */
export type RealmBasis = '内丹' | '佛道' | '道教仙阶' | '网文' | '道家本源'

// ============ 敌人 ============
export interface EnemySkill {
  name: string
  mult: number
  rate: number
  /** multi=多段(触发反击类流派) pierce=真伤(无视护盾与减伤) */
  effect?: 'stun' | 'bleed' | 'drain' | 'shield' | 'multi' | 'pierce'
}

/** Boss 机制家族:定义 Boss 的核心战斗身份 */
export type BossArchetype =
  | 'berserk' // 狂暴型:半血一档增伤并换招
  | 'counter' // 反制型:受击按概率反击(连击追击不触发)
  | 'truedmg' // 真伤型:关键真伤窗口
  | 'antiheal' // 吸血型:吸血自补(id 是旧称,已存路线节点在用,不改)
  | 'spellbane' // 吞法型:固定减伤,半血加深
  | 'evasive' // 闪避型:高闪避+命中检查
  | 'attrition' // 消耗型:长战压迫
  | 'threshold' // 门槛型:护盾在身(开战即有,或招式凝起)

/** Boss 战斗阶段配置:随 HP 百分比触发状态变化 */
export interface BossPhase {
  /** HP 阈值(0~1),跌破此值进入该阶段 */
  hpThreshold: number
  /** 该阶段新增/修改的词条 */
  modChanges?: Partial<StatMods>
  /** 该阶段新增/替换的技能 */
  skillChanges?: EnemySkill[]
  /** 阶段标识(可选,用于战报展示) */
  label?: string
}

/**
 * 敌人与灵宠的族类:一族一形,异族不共形。
 * 形由 data/beastFamilies.ts 给出,数据只写 family,不写 icon。
 */
export type BeastFamily =
  | 'beast'
  | 'winged'
  | 'piscine'
  | 'chelonian'
  | 'serpent'
  | 'dragon'
  | 'verdant'
  | 'aqueous'
  | 'undead'
  | 'ghost'
  | 'armored'
  | 'construct'
  | 'blade'
  | 'demon'
  | 'immortal'
  | 'deity'
  | 'spirit'
  | 'astral'
  | 'mirage'
  | 'outsider'
  | 'treasure'

export interface EnemyDef {
  id: string
  name: string
  family: BeastFamily
  element?: ElementId
  tier: number
  hpMult: number
  atkMult: number
  defMult: number
  speed: number
  skills: EnemySkill[]
  /** 敌人自带词条(闪避/减伤等,用于流派克制) */
  mods?: StatMods
  isBoss?: boolean
  /** Boss 机制家族(仅 Boss 使用) */
  archetype?: BossArchetype
  /** Boss 战斗阶段(仅 Boss 使用) */
  phases?: BossPhase[]
}

// ============ 区域 ============
export type ExploreMode = 'normal' | 'deep' | 'risky' | 'prolonged' | 'marathon' | 'deepExpedition'

export interface RegionDef {
  id: string
  name: string
  desc: string
  icon: string
  /** 决定敌人与掉落量级 */
  tier: number
  /** 推荐大境界序号 */
  minRealm: number
  danger: 1 | 2 | 3 | 4 | 5
  enemies: string[]
  boss: string
  eventTags: string[]
  /** 需要通关(击败首领)的前置区域 */
  requireCleared?: string
}

// ============ 事件 ============
export type EventCond = { type: 'realm'; min: number } | { type: 'stone'; tierAmount: number } | { type: 'element'; el: ElementId }

export type EventEffect =
  | { type: 'stone'; tierAmount: number }
  /**
   * 修为奖励,单位:等效闭关秒数,与丹药、遭遇同尺。
   * 改回 reqPct(当前一层需求的百分比)会让际遇价值随境界指数上涨。
   */
  | { type: 'exp'; secs: number }
  | { type: 'material'; id: 'herb' | 'ore' | 'page' | 'dust' | 'wudao'; amount: number }
  | { type: 'equipment'; minQualityRank?: number }
  | { type: 'pill'; id?: string; count: number }
  | { type: 'gongfa'; id?: string }
  | { type: 'artifact'; id?: string }
  | { type: 'buff'; id: string }
  | { type: 'lifespan'; years: number }
  | { type: 'pet'; id?: string }
  | { type: 'nothing' }

export interface EventOutcome {
  weight: number
  text: string
  effects: EventEffect[]
}

export interface EventChoice {
  label: string
  hint?: string
  cond?: EventCond
  outcomes: EventOutcome[]
  isDefault?: boolean
  /** 选此项即断所属奇缘(后续几程不再出现);仅对奇缘阶段事件有意义 */
  endsChain?: boolean
}

/** 区域兴衰状态:混乱 → 稳定 → 繁盛 */
export type RegionProsperity = 'chaos' | 'stable' | 'flourish'

/** 区域兴衰状态详情(派生 + 可写入) */
export interface RegionRecall {
  prosperity: RegionProsperity
  /** 本次状态自何时起 */
  since: number
  /** 区域累计胜场(用于派生状态) */
  totalWins: number
  hasSuppressed: boolean
  /** 镇压时间戳(仍处镇压中) */
  suppressedAt?: number
}

/** 宿敌记录:同一敌人败我 ≥3 次 */
export interface NemesisRecord {
  enemyId: string
  enemyName: string
  regionId: string
  /** 玩家被击败次数 */
  lossCount: number
  /** 最后一次败北时间 */
  lastLossAt: number
  /** 首次雪耻时间(击败宿敌) */
  avengedAt?: number
}

/** 世界事件记忆:已完事件的结果记录 */
export interface EventMemory {
  eventId: string
  /** 完成次数 */
  times: number
  /** 最近一次完成时间 */
  lastAt: number
  /** 最近一次的选择索引 */
  lastChoiceIdx: number
}

export interface EventDef {
  id: string
  title: string
  text: string
  tags: string[]
  minRealm?: number
  once?: boolean
  weight: number
  choices: EventChoice[]
  /** 元素倾向:同源灵根更易撞见,不是门槛 */
  element?: ElementId
}

// ============ 资源 ============
export type SmallResourceId = 'wudao' | 'herb' | 'ore' | 'page' | 'dust'

// ============ 洞府建筑 ============
export type BuildingId = 'mansion' | 'array' | 'alchemy' | 'forge' | 'field' | 'library' | 'beast'

export interface BuildingDef {
  id: BuildingId
  name: string
  desc: string
  icon: string
  maxLevel: number
  unlockRealm: number
  /** 升级灵石成本基数(随等级指数增长) */
  costBase: number
  costOre: number
  /** 每级效果文案 */
  effectText: (lv: number) => string
  mods?: (lv: number) => StatMods
}

// ============ 天赋 / 称号 / 灵兽 ============
export interface TalentDef {
  id: string
  name: string
  desc: string
  /** 1~4 品阶 */
  grade: 1 | 2 | 3 | 4
  mods: StatMods
  weight: number
}

export interface TitleDef {
  id: string
  name: string
  desc: string
  mods: StatMods
}

/** 灵兽性格,单一定义:petPersonality 行为表与 PETS 数据共用 */
export type PetPersonality = 'greedy' | 'steady' | 'fierce' | 'cautious'

export interface PetDef {
  id: string
  name: string
  desc: string
  family: BeastFamily
  quality: QualityId
  mods: StatMods
  /** 灵兽性格(贪宝/慢稳/好战/谨慎),影响历练行为倾向 */
  personality: PetPersonality
}

// ============ 成就 / 任务 ============
/**
 * 计数器的键。**唯一事实源是运行时那个数组** —— 类型由它推导。
 *
 * 原先这里是一串手写的联合字面量,运行时一个字都不剩:读档自愈要判断
 * 「这个键认不认得」时无从下手,于是坏档能塞任意多键(实测十万个野键 → 3.18MB)。
 * 而另写一份运行时数组又会与这串字面量各走各的 —— 增删一个键忘了同步,
 * 那个计数就会在读档时被当野键清掉,且没有任何报错。
 *
 * 改成「数组在前、类型由 typeof 推导」:加键只改数组一处,两边永远一致。
 * 计数器的键不多(十九个)且都只在本仓出现,数组直白列出即可。
 */
export const COUNTER_KEYS = [
  'kills',
  'battles',
  'breakthroughs',
  'breakthroughFails',
  'explores',
  'events',
  'equipsGained',
  'upgrades',
  'pillsUsed',
  'pillsCrafted',
  'pillsFailed',
  'gongfaLearned',
  'reincarnations',
  'tribulations',
  'decomposed',
  'soulsRefined',
  'offlineClaims',
  'bossKills',
  'buildingUpgrades'
] as const

export type CounterKey = (typeof COUNTER_KEYS)[number]

export type AchvCond =
  | { type: 'counter'; key: CounterKey; value: number }
  | { type: 'realm'; major: number }
  | { type: 'quality'; rank: number }
  | { type: 'custom'; key: string }

export interface RewardBundle {
  stoneTier?: number
  wudao?: number
  herb?: number
  ore?: number
  page?: number
  dust?: number
  titleId?: string
  pillId?: string
}

export interface AchievementDef {
  id: string
  name: string
  desc: string
  cond: AchvCond
  reward?: RewardBundle
}

export interface QuestDef {
  id: string
  name: string
  desc: string
  cond: AchvCond
  reward: RewardBundle
}

// ============ 战斗 ============
export interface CombatSkill {
  name: string
  mult: number
  rate: number
  effect?: string
}

/** 敌人加成来源中的一项;×1 的项不列 */
export interface FoeOriginPart {
  /** 来源名,如「层级补偿」「危地」「道之理解」 */
  label: string
  /** 三维倍率 */
  ratio: number
}

/**
 * 敌人额外加成的来源,战后分析照读。
 * 凡界:层级补偿、危地;天界:道之理解、境界压制。生成方(makeEnemySnap / worldFoeSnap)须写明。
 */
export interface FoeOrigin {
  /** 来源名,如「层级补偿」「道之理解 / 境界压制」 */
  label: string
  /** 三维总倍率(≥1;1 = 无额外加成) */
  ratio: number
  /** 敌人增伤(0 = 无) */
  damageBonus: number
  /** 敌人减伤(0 = 无) */
  damageReduction: number
  /** 各项来源的倍率 */
  parts: FoeOriginPart[]
  /** 状态短注(「无额外加成」「无额外判定」「弱于本层」;有加成时留空,账在 parts);界面只读它 */
  note: string
}

export interface CombatantSnap {
  name: string
  icon: string
  isPlayer: boolean
  origin?: FoeOrigin
  attack: GNum
  defense: GNum
  maxHp: GNum
  speed: number
  mods: StatMods
  skills: CombatSkill[]
  /** 随身法宝(元婴起可佩两件) */
  artifacts?: { def: ArtifactDef; level: number }[]
  /** 已激活的流派组合技(见 data/comboArts.ts) */
  comboArt?: string
  /** Boss 战斗阶段(仅 Boss 携带) */
  phases?: BossPhase[]
  archetype?: BossArchetype
  /** 铁壁共鸣未用标记(首次致命伤保留 1 点气血) */
  ironwallBrace?: boolean
}

export interface CombatLogEntry {
  t: 'atk' | 'skill' | 'crit' | 'shield' | 'heal' | 'dodge' | 'proc' | 'info' | 'win' | 'lose'
  side: 'p' | 'e' | 'sys'
  text: string
  dmg?: string
  /** 该条目后双方血量百分比(供播放动画) */
  php: number
  ehp: number
}

/** 单方战斗遥测(供战后分析与硬核数据面板) */
export interface CombatSideStats {
  dealt: GNum
  taken: GNum
  /** 真伤承伤 */
  pierceTaken: GNum
  /** 单次最大承伤 */
  biggestHitTaken: GNum
  healed: GNum
  shieldAbsorbed: GNum
  /** 自身闪避次数 */
  dodges: number
  /** 出手被闪次数 */
  missedHits: number
  hitsLanded: number
  counters: number
  combos: number
  crits: number
  skillCasts: number
  artifactProcs: number
  stunnedTurns: number
}

export interface CombatResult {
  win: boolean
  log: CombatLogEntry[]
  rounds: number
  playerHpPct: number
  /** 敌人的加成来源(仅敌方) */
  foeOrigin?: FoeOrigin
  /** 先手判定及所用两数;阈值判定(1 + 先手判定修正 ≥ 对手速度),非连续收益,战后分析据此报差距 */
  firstMove?: { playerFirst: boolean; playerSpeed: number; enemySpeed: number }
  /** 战斗遥测(旧存档可能缺失) */
  stats?: { player: CombatSideStats; enemy: CombatSideStats }
}

/** 战斗规则修正:道途与特殊世界的载体,只改本场规则参数,不改引擎逻辑 */
export interface CombatRules {
  /** 覆盖回合上限 */
  maxRounds?: number
  playerAtkMult?: number
  enemyAtkMult?: number
  enemyHpMult?: number
  /** 治疗效率(吸血/回复/法宝治疗) */
  healMult?: number
  /** 覆盖护盾上限比例 */
  shieldCapRatio?: number
  playerExtraMods?: StatMods
  enemyExtraMods?: StatMods
  /** 玩家开场气血比例(试炼用) */
  playerStartHpPct?: number
  /** 长生印(道途深化):每隔若干回合玩家得恢复与护盾,敌人攻势渐涨 */
  perRounds?: {
    interval: number
    playerHealPct: number
    playerShieldPct: number
    enemyAtkGrowth: number
  }
}

// ============ 真仙终局 ============
export type DaoPathId = 'sword' | 'longevity' | 'fate' | 'slaughter'

export interface DaoPathDef {
  id: DaoPathId
  name: string
  seal: string
  desc: string
  /** 规则文案 */
  ruleText: string[]
  /** 此道在世时对一切战斗生效的规则 */
  rules: CombatRules
  /** 道途深化文案 */
  deepText: string[]
}

/** 天界敌人形状:相对参照属性的比例(数值成长在天界互相抵消) */
export interface WorldFoeShape {
  name: string
  icon: string
  atkR: number
  defR: number
  hpR: number
  speed: number
  skills: CombatSkill[]
  mods?: StatMods
}

/** 路线节点:远征每层二择其一 */
export interface WorldRouteNode {
  id: string
  name: string
  desc: string
  foe: WorldFoeShape
  /** 节点附加规则(与世界/道途/契约规则合并) */
  rules?: CombatRules
  /** 走此节点的额外道源 */
  bonus: number
  riskText: string
}

export interface CelestialWorldDef {
  id: string
  name: string
  seal: string
  /** 本界锚点层级:敌人按此层级曲线的绝对三维定标(core/gauntlet.celestialAnchor);未及者受境界压制 */
  anchorTier: number
  desc: string
  ruleText: string[]
  rules: CombatRules
  /** 入场道源 */
  entryCost: number
  /** 连战场数(含界主) */
  fights: number
  /** 场间恢复比例 */
  healBetweenPct: number
  foes: WorldFoeShape[]
  guardian: WorldFoeShape
  rewardDaoSource: number
  /** 路线树:每层两个节点,逐层择路(入界战 → 各层 → 界主) */
  routes: [WorldRouteNode, WorldRouteNode][]
}

/** 天道契约:玩家自选的不公平规则,风险换道源 */
export interface PactDef {
  id: string
  name: string
  seal: string
  desc: string
  ruleText: string
  rules?: CombatRules
  /** 特殊约束:soloArtifact=仅携一件法宝;endHp80=每场战后气血须 ≥80%;sealCore=主流派核心词条封印 */
  special?: 'soloArtifact' | 'endHp80' | 'sealCore'
  /** 道源倍率 */
  sourceMult: number
}

/** 天道变数:随机规则条目 */
export interface MutatorDef {
  id: string
  name: string
  text: string
  rules: CombatRules
}

export interface TrialDef {
  id: string
  name: string
  seal: string
  /** 同 CelestialWorldDef.anchorTier:本试炼的锚点层级 */
  anchorTier: number
  desc: string
  ruleText: string[]
  rules: CombatRules
  entryCost: number
  fights: number
  healBetweenPct: number
  /** 每场敌人强度递增系数 */
  escalation: number
  rewardDaoSource: number
}

/** 忆战快照:重现此战所需的最小冻结状态 */
export interface MarkReplay {
  mods: StatMods
  attack: GNum
  defense: GNum
  maxHp: GNum
  speed: number
  skills: CombatSkill[]
  artifacts: { defId: string; level: number }[]
  comboArt?: string
  pactId: string | null
}

/** 道痕环境上下文:挑战书/变数类道痕的历史环境,供忆战与重写 */
export interface MarkContext {
  worldId?: string
  mutatorIds?: string[]
  /** 当年入界所择之门(奇门遁甲;旧档缺失即未择门) */
  gateId?: string
}

/** 道痕:一世修行的终局履历 */
export interface DaoMark {
  life: number
  daoPathId: DaoPathId | null
  /** 记录时的大境界,忆战/重写据此还原境界压制(旧档缺失回退 MAX) */
  major?: number
  /** 世界或试炼 id */
  targetId: string
  targetName: string
  cleared: boolean
  rounds: number
  buildName: string
  powerText: string
  at: number
  /** 规则纪元(旧档缺失) */
  ruleset?: string
  /** 忆战快照(旧档缺失则不可重现) */
  replay?: MarkReplay
  context?: MarkContext
}

// ============ 离线结算 ============
export interface OfflineSummary {
  seconds: number
  cappedSeconds: number
  capped: boolean
  exp: GNum
  stone: GNum
  /** 灵气回充量(受上限约束,记实际差额) */
  qi: number
  herb: number
  /** 离线逐品灵草净增(仅列 >0 的品);灵田可前瞻产当前/高一档,故逐品记 */
  herbByGrade: { grade: 1 | 2 | 3 | 4 | 5; amount: number }[]
  ore: number
  wudao: number
  /** 离线期间流逝的寿元(年) */
  ageYears: number
  battles: number
  wins: number
  events: number
  /** 产出装备清单;回收件(自动回收/满包化尘)标 recycled。入包件带 uid(归来弹窗据此打开详情),化尘件无 uid */
  equipment: { name: string; quality: QualityId; recycled?: boolean; uid?: string }[]
  /** 期间化尘所得的器灵尘总量(自动回收/满包化尘/腾位化掉的旧件) */
  recycledDust: number
  /** 智能收纳为新件腾位化掉的旧件数(不在 equipment 清单里) */
  evicted: number
  notes: string[]
}

// ============ 历练会话 ============
export interface AdventureSession {
  regionId: string
  mode: ExploreMode
  startedAt: number
  endsAt: number
  nextBattleAt: number
  wins: number
  losses: number
  events: number
  /** 累计掉落摘要 */
  stoneGain: GNum
  expGain: GNum
  itemGain: number
}
