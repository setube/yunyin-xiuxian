/**
 * 全局类型定义 —— 所有游戏领域模型集中于此
 */

// ============ 大数 ============
/** 大数:value = m × 10^e,m ∈ [1,10) 或 0 */
export interface GNum {
  m: number
  e: number
}

// ============ Phase 28 前期玩法 ============
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
  /** 即时奖励(不走 buff,如"灵机一动"直接给悟道点——悟道产出无速率词条可挂) */
  reward?: { type: 'wudao'; value: number }
}

/** 悟道顿悟实例(60秒窗口) */
export interface EnlightenmentEvent {
  id: string
  options: EnlightenmentOption[]
  /** 触发时间戳 */
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
    /** 奖励或惩罚 */
    reward?: { type: 'exp' | 'stone' | 'herb' | 'wudao' | 'buff'; value: number | string }
    penalty?: { type: 'cultivationSpeed' | 'qiMax'; value: number; duration: number }
  }>
  /** 触发时间戳 */
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
  /**
   * 命中:抵掉目标的闪避(两个百分点直接相减,不会把闪避压成负数)。
   *
   * 补它的理由与「净念」同源:闪避型首领(蜃楼之主幻境 55%、冰魄化身 50%、
   * 大罗化身 48%……)此前是**无解**的 —— 玩家没有命中这个属性,面对幻影
   * 只能靠运气,而战后分析照样会说「N 次出手落空,连击与暴击难以衔接」。
   * 报得出病因、给不出药,就是内容缺口。
   */
  | 'accuracy'
  | 'lowHpReduction'
  | 'breakRefund'
  | 'doubleDropRate'
  | 'eventLuck'
  | 'tribulationResist'
  | 'comboRate'
  | 'stunRate'
  // ---- 流派条件型(Phase 15) ----
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
   * 属性来源明细 —— 面板上「这个数从哪来」读它,不另算一遍。
   *
   * onTop 的那几条(道果)不并入百分比,而是单独乘在攻防血/修炼上:
   * 故面板展示时要说清「另乘」,否则明细之和会对不上玩家看到的值。
   */
  breakdown: StatSourceRow[]
}

/** 一条属性来源:谁给的、给了多少 */
export interface StatSourceRow {
  name: string
  mods: StatMods
  /** true = 不在百分比里相加,而是另行乘算(目前只有道果) */
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
  /**
   * 现世层级窗口 —— 这一档品质只在 [fromTier, toTier] 这段内容里**正常**掉落。
   *
   * 行业里叫「物品等级带」:稀有度不是纯运气,而是内容深度的函数 ——
   * 神品该从神界/混沌海长出来,不是青云山麓抽奖抽到的。
   * 窗口外仍留一线(QUALITY_OUT_OF_BAND),给际遇与图鉴留门,但那是万分之几。
   */
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
   * 本件所属的层级 —— **一阶一名**:名字负责区分,数字只让人看得更快。
   *
   * 掉落池按它取(见 core/equipGen.templatesAtTier):13 阶的地界只出 13 阶之物,
   * 所以「星辰冠」永远只可能是 8 阶,看到名字就知道是哪一阶的东西。
   * (法宝的 fromTier 是另一回事:那一头仍是「从这一阶起可现世」的累积池。)
   */
  tier: number
  /** Phase 31.0 S5:装备套装/共鸣组(同组多件触发机制效果,非数值堆叠) */
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
  /** 词条稀有度(影响重铸封存成本,Phase 30.5) */
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
  /** 已重铸次数(Phase 30.1,成本按次翻倍) */
  reforgeCount?: number
  /** 已封存的词条 id(重铸时不会被替换) */
  sealedAffixIds?: string[]
  /** 累计强化投入(分解时按八成返还;老档无此账,按标价补算) */
  invested?: { dust: number; stone: GNum }
  /**
   * 玩家自定的短标记(玩家反馈:「同名装备想按不同流派区分」)。
   * 至多 4 个汉字,详情弹窗里改;格卡与部位行都带出。老档/未标记件为 undefined。
   */
  note?: string
}

// ============ 法宝 ============
export type ArtifactEffect =
  | { type: 'damage'; mult: number }
  | { type: 'shield'; pctMaxHp: number }
  | { type: 'heal'; pctMaxHp: number }
  | { type: 'weaken'; pct: number }
  /**
   * 震慑:打断敌人下一手(跳过它的这一次行动)。
   *
   * 与「削弱」不同 —— 削弱是接下来几回合的攻势打折扣,震慑是**这一手根本不出**。
   * 在高界尤其要紧:敌手的一次大招被掐掉,往往比少吃几成伤害更值。
   */
  | { type: 'stun' }
  /**
   * 破甲:撕开敌人的护体,其防御在**本场余下回合**里按比例下降。
   *
   * 与削弱(压其攻势)相对:一个是让它打不动你,一个是让你打得动它。
   * 对高防敌手(天界那些护体厚重的)尤其值。
   */
  | { type: 'sunder'; pct: number }
  /**
   * 净念:防身型 —— 每当自身要被震慑,以 pct 的概率当场挣脱,那一手照出。
   *
   * 前面那些效果说的都是「我怎么打你」,这是第一件「我扛得住你的阴招」。
   * 补它的理由不是对称好看,而是此前**玩家对震慑毫无还手之力**:十三种敌人
   * 会摄魂(音波 / 魅惑 / 石化凝视 / 九霄神雷……),中了就是白丢一回合,而战后
   * 分析只会说一句「N 个回合被震慑打断,节奏尽失」—— 说了病因,却没有一味药。
   * 故它是随身被动:不受 interval 的节拍约束(数据里 interval 记 1,即常在)。
   */
  | { type: 'purge'; pct: number }
  /**
   * 吸命:造成伤害,并把其中 healPct 回补自身。
   *
   * 与「打出伤害」+「回复生命」分开写不同:它的回复**挂在伤害上** ——
   * 打得越狠,回得越多。于是高界法宝里终于有了一件同时管输出与续航的,
   * 而不必让两个法宝位去凑一件事(位只有两个,凑它就是放弃另一种手艺)。
   */
  | { type: 'drain'; mult: number; healPct: number }

export interface ArtifactDef {
  id: string
  name: string
  /** 风味一句。与下面的数值一样,写的是「凡品零重基线」的口径(见 data/artifacts.artifactValue) */
  desc: string
  icon: string
  /** 品阶:既定掉落权重,也定数值倍率 —— 两处的口径都在 data/artifacts */
  quality: QualityId
  /** 从这一阶起可现世(累积池:更高阶的地界也掉得出它) */
  fromTier: number
  /** 被动。表里写的是**凡品零重基线**,品阶与祭炼两条放大由 artifactValue 施加 */
  passive: StatMods
  active: {
    name: string
    /** 神通文案(同样是凡品零重基线:玩家看到的是 artifactActiveText 现算的那一份) */
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
export interface PillDef {
  id: string
  name: string
  desc: string
  icon: string
  quality: QualityId
  kind: 'instant' | 'buff'
  instant?: {
    /**
     * 等效闭关秒数 —— 修为丹的药力单位(Phase 39)。
     *
     * 结算口径:修为 += 服丹者当下的修炼速度 × 本秒数,再封顶到「不满一层」
     * (见 core/pillService 与 INSTANT_EXP_LAYER_CAP)。
     *
     * 从前这里是 `expReqPct`(按当前一层需求的百分比给修为)。那个口径看着"自平衡",
     * 实则把**指数增长的需求墙**整段搬给了玩家:同一枚金丹期的丹留到混沌海服用,
     * 药力跟着需求一起涨到万亿倍,而它的成本仍冻结在金丹期 —— 于是后面的境界壁垒、
     * 破界的艰难,全都能靠囤丹抹平。改按"一段写死的闭关时长"结算之后,
     * 丹药在任何境界值多少都是常量,囤到高境界只会显得它更弱(这是对的)。
     */
    expSecs?: number
    /** 固定修为点数(低品质丹药,与境界无关) */
    expFixed?: number
    /** 灵气回满比例(上限的五成/十成)—— 容量与回速同阶,折成时间近乎恒定,故保留百分比 */
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
}

// ============ 境界 ============
/** 界域 —— 人间界 / 仙界 / 神界 / 混沌海 */
export type WorldId = 'mortal' | 'immortal' | 'god' | 'chaos'

export interface RealmDef {
  id: string
  name: string
  /** 所属界域 */
  world: WorldId
  lifespanYears: number
  /** 该境界主题描述 */
  desc: string
  /**
   * 可解释性:这一境的命名出处与承接理由。
   * 依次说明它取自哪一路数(内丹术 / 道教仙阶 / 佛教 / 道家宇宙论 / 网文常用),
   * 以及它为何排在上一境之后 —— 境界名不是随手堆的字。
   */
  lore: string
  /** 出处类别(便于审计与检索) */
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
  | 'berserk' // 狂暴型:高爆发,越战越强
  | 'counter' // 反制型:受连击触发反击
  | 'truedmg' // 真伤型:关键真伤窗口
  | 'antiheal' // 治疗压制型:降低治疗效率
  | 'spellbane' // 吞法型:神通越多越强
  | 'evasive' // 闪避型:高闪避+命中检查
  | 'attrition' // 消耗型:长战压迫
  | 'threshold' // 门槛型:特定属性要求

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

export interface EnemyDef {
  id: string
  name: string
  icon: string
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
export type ExploreMode = 'normal' | 'deep' | 'risky' | 'prolonged'

export interface RegionDef {
  id: string
  name: string
  desc: string
  icon: string
  /** 1~20,决定敌人与掉落量级 */
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
   * 修为奖励 —— **等效闭关秒数**(Phase 39:与丹药、一场遭遇同一把尺子)。
   *
   * 从前这里是 reqPct(当前一层需求的百分比):一层耗时每境 ×3.65,
   * 于是同一次际遇的价值随境界指数上涨 —— 真仙期一次际遇抵十几个时辰闭关。
   * 现在写死成一段时长(60~240 秒),它认的是玩家的修速,不认那道墙。
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
  /** 选了此项,所属奇缘就此断掉(后续几程不会再出现);仅对奇缘阶段事件有意义 */
  endsChain?: boolean
}

/** 区域兴衰状态(Phase 30.9 S1):混乱 → 稳定 → 繁盛 */
export type RegionProsperity = 'chaos' | 'stable' | 'flourish'

/** 区域兴衰状态详情(派生 + 可写入) */
export interface RegionRecall {
  /** 状态 */
  prosperity: RegionProsperity
  /** 本次状态自何时起 */
  since: number
  /** 区域累计胜场(用于派生状态) */
  totalWins: number
  /** 是否曾被镇压过(镇压史) */
  hasSuppressed: boolean
  /** 镇压时间戳(仍处镇压中) */
  suppressedAt?: number
}

/** 宿敌记录(Phase 30.9 S2):同一敌人败我 ≥3 次 */
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

/** 世界事件记忆(Phase 30.9 S3):已完事件的结果记录 */
export interface EventMemory {
  eventId: string
  /** 完成次数 */
  times: number
  /** 最近一次完成时间 */
  lastAt: number
  /** 最近一次的选择索引 */
  lastChoiceIdx: number
  /** 若事件有后续(余波)变体,标记已触发 */
  aftermathSeen: boolean
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
  /**
   * 机缘的元素倾向(Phase 32.2)。
   * 同源灵根更容易撞见,但无此灵根者照样能遇到——是倾向,不是门槛。
   */
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

/** 灵兽性格 —— 定义在此处(petPersonality 行为表与 PETS 数据同源,不再各写一份联合类型) */
export type PetPersonality = 'greedy' | 'steady' | 'fierce' | 'cautious'

export interface PetDef {
  id: string
  name: string
  desc: string
  icon: string
  quality: QualityId
  mods: StatMods
  /** Phase 31.0 S4:灵兽性格(贪宝/慢稳/好战/谨慎),影响历练行为倾向 */
  personality: PetPersonality
}

// ============ 成就 / 任务 ============
export type CounterKey =
  | 'kills'
  | 'battles'
  | 'breakthroughs'
  | 'breakthroughFails'
  | 'explores'
  | 'events'
  | 'equipsGained'
  | 'upgrades'
  | 'pillsUsed'
  | 'pillsCrafted'
  | 'pillsFailed'
  | 'gongfaLearned'
  | 'reincarnations'
  | 'tribulations'
  | 'decomposed'
  | 'soulsRefined'
  | 'offlineClaims'
  | 'bossKills'
  | 'buildingUpgrades'

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

/**
 * 敌人加成来源里的一项 —— 「哪件事,把它乘大了多少倍」。
 * 只列真正乘过的项(×1 的不列:没做的事不必占字数)。
 */
export interface FoeOriginPart {
  /** 来源名,如「层级补偿」「危地」「道之理解」 */
  label: string
  /** 三维倍率 */
  ratio: number
}

/**
 * 敌人身上的额外加成**从哪来** —— 由生成方写明,战后分析照读。
 *
 * 敌人的三维里从来不只是「它自己」:凡界有层级补偿与危地,天界有道之理解与境界压制。
 * 这些乘区若只在数值里生效、不给出来源,玩家遇到「怎么忽然变强了」就只能猜 ——
 * 既不知道该削哪一项,也不知道该往哪一境走。故生成方**必须**把它写下来
 * (makeEnemySnap / worldFoeSnap 各有一份),战斗结果带着它走,分析面板照着讲。
 */
export interface FoeOrigin {
  /** 一句话来源名,如「层级补偿」「道之理解 / 境界压制」 */
  label: string
  /** 三维总倍率(≥1;1 表示这只敌人没有额外加成) */
  ratio: number
  /** 敌人增伤(0 = 无) */
  damageBonus: number
  /** 敌人减伤(0 = 无) */
  damageReduction: number
  /** 拆开讲:每一项来源各自的倍率 */
  parts: FoeOriginPart[]
  /** 这是什么、该怎么办 —— 界面读它,不再另编一套说法 */
  note: string
}

export interface CombatantSnap {
  name: string
  icon: string
  isPlayer: boolean
  /**
   * 这只敌人身上的**额外加成来自哪里** —— 由生成方写明,供战后分析归因。
   *
   * 敌人的三维里从来不只是「它自己」:凡界有层级补偿与危地,天界有道之理解与境界压制。
   * 这些乘区若只在数值里生效、不给出来源,玩家遇到「怎么忽然变强了」就只能猜。
   */
  origin?: FoeOrigin
  attack: GNum
  defense: GNum
  maxHp: GNum
  speed: number
  mods: StatMods
  skills: CombatSkill[]
  /** 随身法宝(元婴起可佩两件) */
  artifacts?: { def: ArtifactDef; level: number }[]
  /** 已激活的流派组合技(Phase 21,见 data/comboArts.ts) */
  comboArt?: string
  /** Boss 战斗阶段(Phase 30.7,仅 Boss 携带) */
  phases?: BossPhase[]
  /** Boss 机制家族(Phase 30.7) */
  archetype?: BossArchetype
  /** Phase 31.0 S5:铁壁共鸣(首次致命伤保留 1 点气血,未用标记) */
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
  /** 敌人的加成来源(玩家侧没有:它就是玩家自己)—— 战后分析据此把账算清 */
  foeOrigin?: FoeOrigin
  /**
   * 先手判定 —— 谁先出手,以及那次判定用的两个数。
   *
   * 这是一条**阈值**判定(1 + 先手判定修正 ≥ 对手速度),不是连续收益:
   * 差一点就是完全没抢先。故把两个数如实记下来,交给战后分析讲清楚
   * 「你差多少」,而不是让玩家对着「出手速度 +6%」猜自己为什么还是后手。
   */
  firstMove?: { playerFirst: boolean; playerSpeed: number; enemySpeed: number }
  /** 战斗遥测(旧存档可能缺失) */
  stats?: { player: CombatSideStats; enemy: CombatSideStats }
}

/**
 * 战斗规则修正(Phase 20)——道途与特殊世界的载体
 * 不改变引擎逻辑,只改变本场战斗的规则参数
 */
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
  /** 长生印(Phase 21 道途深化):每隔若干回合玩家得恢复与护盾,敌人攻势渐涨 */
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
  /** 道途深化文案(Phase 21) */
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

/** 路线节点(Phase 21):远征每层二择其一 */
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
  /**
   * 本界锚点层级 —— 敌人按这条层级曲线的绝对三维定标(见 core/gauntlet.celestialAnchor)。
   * 它同时是「这一界该有的境界」:未及者受境界压制,已过者自然是压着打。
   */
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

/** 天道契约(Phase 21):玩家自选的不公平规则,风险换道源 */
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

/** 天道变数(Phase 21):随机规则条目 */
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

/** 忆战快照(Phase 25):重现此战所需的最小冻结状态 */
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

/** 道痕环境上下文(Phase 28):挑战书/变数类道痕的完整历史环境,使其可忆可重写 */
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
  /** 世界或试炼 id */
  targetId: string
  targetName: string
  cleared: boolean
  rounds: number
  buildName: string
  powerText: string
  at: number
  /** 规则纪元(Phase 25;旧档缺失) */
  ruleset?: string
  /** 忆战快照(旧档缺失则不可重现) */
  replay?: MarkReplay
  /** 环境上下文(Phase 28;挑战书/变数道痕的历史环境) */
  context?: MarkContext
}

// ============ 离线结算 ============
export interface OfflineSummary {
  seconds: number
  cappedSeconds: number
  capped: boolean
  exp: GNum
  stone: GNum
  /** 灵气回充量(受上限约束,故记实际差额) */
  qi: number
  herb: number
  ore: number
  wudao: number
  /** 离线期间流逝的寿元(年)—— 是代价,不是收益,但玩家该知道 */
  ageYears: number
  battles: number
  wins: number
  events: number
  /** 产出装备清单;回收(自动回收/满包化尘)的件以 recycled 标注 */
  equipment: { name: string; quality: QualityId; recycled?: boolean }[]
  /** 期间未入包装备化作的器灵尘总量 */
  recycledDust: number
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
