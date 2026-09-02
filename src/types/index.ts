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
  buffId: string
  /** 持续时间(秒) */
  duration: number
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

/** 探索路线类型 */
export type ExplorationRoute = 'safe' | 'risky' | 'dangerous'

/** 探索路线配置 */
export interface RouteConfig {
  label: string
  desc: string
  safeMod: number
  rewardMod: number
  eventMod: number
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

/** 灵兽陪行功能类型 */
export type BeastCompanionType = 'event' | 'safety' | 'loot'

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
  /** 出现的最低掉落层级 */
  minTier: number
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
}

// ============ 法宝 ============
export type ArtifactEffect =
  | { type: 'damage'; mult: number }
  | { type: 'shield'; pctMaxHp: number }
  | { type: 'heal'; pctMaxHp: number }
  | { type: 'weaken'; pct: number }

export interface ArtifactDef {
  id: string
  name: string
  desc: string
  icon: string
  quality: QualityId
  minTier: number
  passive: StatMods
  active: {
    name: string
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
    /** 按当前突破需求百分比给予修为(高品质丹药) */
    expReqPct?: number
    /** 固定修为点数(低品质丹药,与境界无关) */
    expFixed?: number
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
export interface RealmDef {
  id: string
  name: string
  lifespanYears: number
  /** 大境界突破是否需渡天劫 */
  tribulation: boolean
  /** 该境界主题描述 */
  desc: string
}

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
export type ExploreMode = 'normal' | 'deep' | 'risky'

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
  | { type: 'exp'; reqPct: number }
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
export type BigResourceId = 'spiritStone'
export type SmallResourceId = 'wudao' | 'herb' | 'ore' | 'page' | 'dust'
export type ResourceId = BigResourceId | SmallResourceId

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

export interface PetDef {
  id: string
  name: string
  desc: string
  icon: string
  quality: QualityId
  mods: StatMods
  /** Phase 31.0 S4:灵兽性格(贪宝/慢稳/好战/谨慎),影响探索行为倾向 */
  personality: 'greedy' | 'steady' | 'fierce' | 'cautious'
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
  hidden?: boolean
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

export interface CombatantSnap {
  name: string
  icon: string
  isPlayer: boolean
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
  herb: number
  ore: number
  wudao: number
  battles: number
  wins: number
  events: number
  equipment: { name: string; quality: QualityId }[]
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
