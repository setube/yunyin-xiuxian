/**
 * 全局数值配置 —— 所有平衡参数集中管理,禁止在业务代码中出现魔法数字
 */

// ============ 引擎 ============
export const TICK_MS = 1000
/** 距上次心跳超过该秒数则走离线结算流程 */
export const OFFLINE_MIN_SECONDS = 120
/** 离线超过该秒数才弹出「归来」卷轴 */
export const OFFLINE_MODAL_MIN_SECONDS = 300
/** 洞府各级离线收益上限(小时),下标为洞府等级换挡 */
export const OFFLINE_CAP_HOURS = [8, 12, 24, 48, 72] as const
/** 离线收益效率 */
export const OFFLINE_EFFICIENCY = 0.9
/** lastActiveAt 写入节流(毫秒) */
export const ACTIVE_STAMP_MS = 5000

// ============ 寿元 ============
/** 每现实 1 小时增加的年龄(岁) */
export const AGE_YEARS_PER_HOUR = 1
export const START_AGE = 16
/** 寿元低于该比例提示告警 */
export const LIFESPAN_WARN_RATIO = 0.1

// ============ 修炼曲线 ============
/** 炼气一层突破需求 */
export const EXP_BASE = 40
/**
 * 每大境界需求倍率 / 基础速度倍率
 * 净耗时增长 ≈ 18 / 5.2 ≈ ×3.46 每大境界(经 progressionSim 审计,终局约 80~90 天在线等效)
 */
export const EXP_MAJOR_GROWTH = 18
/** 每小层需求倍率 */
export const EXP_SUB_GROWTH = 1.32
/** 基础修为/秒 */
export const CULT_BASE_SPEED = 1.6
/** 每大境界基础速度倍率 */
export const CULT_MAJOR_SPEED_GROWTH = 5.2
/** 每小层基础速度倍率 */
export const CULT_SUB_SPEED_GROWTH = 1.06
/** 小境界数量(9 层 + 圆满) */
export const SUB_LEVELS = 10

// ============ 灵气 ============
export const QI_BASE_CAP = 100
export const QI_CAP_MAJOR_GROWTH = 6
export const QI_CAP_SUB_GROWTH = 1.12
export const QI_BASE_REGEN = 1.2
export const QI_REGEN_MAJOR_GROWTH = 5.2
/** 灵气高于上限一半时,修炼速度额外加成 */
export const QI_RICH_BONUS = 0.15

// ============ 突破 ============
export const BT_SUB_BASE_RATE = 0.95
export const BT_SUB_DECAY = 0.03
export const BT_MAJOR_BASE_RATE = 0.78
export const BT_MAJOR_DECAY = 0.05
export const BT_MIN_RATE = 0.15
export const BT_MAX_RATE = 0.98
/** 突破失败损失修为比例 */
export const BT_FAIL_EXP_LOSS = 0.18
/** 突破消耗灵气(占上限比例) */
export const BT_QI_COST_RATIO = 0.4
/** 天劫波次基数(实际 = 基数 + 大境界序号) */
export const TRIBULATION_BASE_WAVES = 3

// ============ 战斗基础 ============
export const COMBAT_ATK_BASE = 12
export const COMBAT_DEF_BASE = 7
export const COMBAT_HP_BASE = 150
export const COMBAT_MAJOR_GROWTH = 3.4
export const COMBAT_SUB_GROWTH = 1.09
export const CRIT_BASE = 0.05
export const CRIT_DMG_BASE = 0.5
export const MAX_COMBAT_ROUNDS = 50
/** 流派阈值:低血/满血判定线 */
export const LOW_HP_THRESHOLD = 0.3
export const FULL_HP_THRESHOLD = 0.9
/** 护盾总量上限(占最大生命比例)——护体灵光有极限,防盾系滚雪球 */
export const SHIELD_CAP_RATIO = 0.5
/**
 * 词条叠加递减(Phase 19.5):同一条件/触发词条来自多个来源时,
 * 按贡献降序以 100%/75%/50%/25% 计入(第 5 个来源起均 25%)。
 * 目标:极端单词条堆叠边际递减,混合构筑相对更值;规则性加成(道途/剑意)不受此约束
 */
export const DIMINISH_WEIGHTS = [1, 0.75, 0.5, 0.25] as const
export const DIMINISH_KEYS = [
  'lowHpDamage',
  'lowHpReduction',
  'fullHpDamage',
  'firstStrike',
  'executeDamage',
  'shieldOnStart',
  'shieldPower',
  'overhealShield',
  'counterRate',
  'counterDamage',
  'comboRate',
  'comboDamage',
  'lifesteal',
  'regenPerRound',
  'stunRate',
  'critRate',
  'critDamage',
  'dodgeRate',
  'armorPen'
] as const
/** 战报播放基础间隔(毫秒),实际 = 基础 / 播放倍速 */
export const COMBAT_PLAYBACK_BASE_MS = 460
export const COMBAT_PLAYBACK_MIN_MS = 90

// ============ Phase 30.4 属性软阈值 ============
/**
 * 第二道防线(第一道是 DIMINISH 同键多来源递减):
 * 合计值越过 cap 后,超出部分按 diminish 折算。
 * cap 取在"正常构筑达不到、极端堆叠才触及"的位置,不影响现行生态。
 */
export const SOFT_CAPS: Partial<Record<import('@/types').AnyStatKey, { cap: number; diminish: number }>> = {
  critRate: { cap: 0.75, diminish: 0.5 },
  dodgeRate: { cap: 0.55, diminish: 0.4 },
  damageReduction: { cap: 0.55, diminish: 0.4 },
  shieldOnStart: { cap: 0.8, diminish: 0.5 }
}

// ============ Phase 30.3 洞府灵脉投资 ============
/** 灵脉总容量(点) */
export const VEIN_TOTAL_CAPACITY = 100
/** 主脉容量(独占) */
export const VEIN_MAIN_CAPACITY = 70
/** 副脉单条上限 */
export const VEIN_SIDE_CAP = 30
/** 每点投资灵石倍率(stoneByTier 按玩家层级) */
export const VEIN_POINT_STONE = 25
/** 灵脉开放境界(金丹) */
export const VEIN_UNLOCK_MAJOR = 2

// ============ Phase 30.1 装备重铸与词条封存 ============
/** 单件装备重铸次数上限 */
export const REFORGE_MAX_COUNT = 10
/** 重铸基础灵石(stoneByTier 倍率),每次重铸后 ×2 */
export const REFORGE_STONE_BASE = 40
/** 重铸器灵尘消耗 = 基础 + 次数 × 步进 */
export const REFORGE_DUST_BASE = 30
export const REFORGE_DUST_STEP = 15
/** 封存一个词条的灵石倍率(第 n 次封存 ×n) */
export const SEAL_STONE_BASE = 200

/**
 * 敌人相对玩家裸装的补偿系数:随层级指数跟随。
 *
 * Phase 33.2:原为 0.9 + 0.18×(tier-1) 且封顶 2.2,tier 9 之后完全冻结——
 * 玩家装备乘区(品质 1.0→9.5 × 强化 +120%)一路涨到 20.9 倍,敌人却只涨 2.44 倍,
 * 后 12 个层级是单方面碾压,这是「炼虚推完全图」的结构性成因(见 inflationAudit)。
 * 改为指数跟随后,敌人补偿与玩家装备成长走同一条逻辑,全程不脱节。
 * 增速刻意低于玩家(玩家仍能靠构筑取得优势),但不再有封顶的断崖
 */
export const ENEMY_GEAR_BASE = 0.9
export const ENEMY_GEAR_GROWTH = 1.105
/** 防御减伤上限 */
export const MITIGATION_CAP = 0.75
/** 减伤公式系数:red = def / (def + atk × K) */
export const MITIGATION_K = 1.15
/** 伤害随机浮动 ±10% */
export const DAMAGE_VARIANCE = 0.1

// ============ 装备 ============
/** 每掉落层级数值倍率 */
export const EQUIP_TIER_GROWTH = 2.05
/**
 * 装备基础属性整体系数(Phase 33.2:1.0 → 0.6)。
 *
 * 九个槽位的平铺权重相加约为 40,而玩家境界基础攻击只有 COMBAT_ATK_BASE=12,
 * 装备平铺因此一项独占战力 57~65%,突破带来的境界成长反被稀释到个位数百分比。
 * 降低整体系数是把战力权重还给「境界 + 构筑」,不是削弱装备本身——
 * 装备的词条、套装、法宝一律未动,它依然是构筑的核心载体
 */
export const EQUIP_BASE_FACTOR = 0.6
/**
 * 品质对「平铺数值」的放大指数(Phase 33.2)。
 *
 * 品质倍率 q.mult 从凡品 1.0 到神品 9.5,原样乘进平铺后,装备平铺一项就占了
 * 玩家战力的 57~65%,远超 40% 的单一来源危险线,境界基础反被稀释到 4.4%
 * (见 inflationAudit)。玩家于是只需刷装备,不必观察生态、调整构筑。
 *
 * 这里把品质对平铺的影响压成 q.mult^0.6(神品 9.5→3.77),而词条数量与词条数值
 * 完全不动——高品质依旧珍贵,但珍贵在「多一条词条、多一种构筑可能」,
 * 而不是「平铺数值再翻一倍」。这是把成长从数值转换成构筑,不是砍数值
 */
export const EQUIP_QUALITY_FLAT_EXP = 0.6
/** 每强化一级基础属性 +12% */
export const EQUIP_LEVEL_BONUS = 0.12
export const EQUIP_MAX_LEVEL_BASE = 10
/** 炼器台每 2 级提高强化上限 1 */
export const FORGE_LEVEL_PER_CAP = 2
/** 强化成本:灵尘 */
export const UPGRADE_DUST_BASE = 4
export const UPGRADE_DUST_GROWTH = 1.5
/** 强化成本:灵石(按层级换算) */
export const UPGRADE_STONE_TIER_BASE = 15
/** 分解所得灵尘(按品质序号) */
export const DECOMPOSE_DUST = [1, 2, 4, 8, 16, 32, 64, 128, 256] as const
export const BAG_CAPACITY = 120

// ============ 掉落 ============
/** 品质基础权重(凡→神) */
export const QUALITY_WEIGHTS = [5000, 3000, 1500, 400, 80, 15, 4, 1, 0.2] as const
/** 层级每 +1,高品质权重乘数 */
export const QUALITY_TIER_SHIFT = 1.18
export const EQUIP_DROP_CHANCE = 0.3
export const PILL_DROP_CHANCE = 0.08
export const PAGE_DROP_CHANCE = 0.12
export const ARTIFACT_DROP_CHANCE = 0.015
/** 战斗灵石基础掉落(按层级指数放大) */
export const STONE_DROP_BASE = 12
export const STONE_TIER_GROWTH = 1.9
/** 战斗修为奖励占当前需求比例 */
export const BATTLE_EXP_REQ_PCT = 0.012

// ============ 探索 ============
export const EXPLORE_BATTLE_INTERVAL = 12
export const EXPLORE_EVENT_CHANCE = 0.16
/** 事件搁置超过该秒数后自动按默认选项处理 */
export const EVENT_AUTO_RESOLVE_SECONDS = 120
export const EXPLORE_MODES = {
  normal: { name: '寻常游历', durationSec: 1800, rewardMult: 1, dangerMult: 1 },
  deep: { name: '深入探寻', durationSec: 3600, rewardMult: 1.4, dangerMult: 1.45 },
  risky: { name: '涉险求机', durationSec: 7200, rewardMult: 1.9, dangerMult: 2.1 }
} as const
/** 战败重伤 Buff 持续秒数 */
export const INJURY_DURATION = 150

// ============ 炼丹 / 藏经阁 ============
/** 灵田每级每小时产灵草 */
export const FIELD_HERB_PER_HOUR = 6
/** 灵田每级每小时产玄铁 */
export const FIELD_ORE_PER_HOUR = 2.4
/** 藏经阁每级每小时产悟道点 */
export const LIBRARY_WUDAO_PER_HOUR = 1.5
/** 藏经阁参悟功法消耗残页 */
export const COMPREHEND_PAGE_COST = 12
/** 功法升级基础悟道点 */
export const GONGFA_UP_WUDAO_BASE = 4
export const GONGFA_UP_GROWTH = 1.45

// ============ 建筑 ============
export const BUILDING_COST_GROWTH = 2.3

// ============ 转世 ============
/** 每达成一个大境界积累道果 = (序号+1) × 系数 */
export const DAO_FRUIT_PER_MAJOR = 3
/** 每颗有效道果永久加成 */
export const DAO_FRUIT_CULT_BONUS = 0.03
export const DAO_FRUIT_COMBAT_BONUS = 0.015
/** 道果收益软上限指数(有效道果 = 道果^该指数),抑制多周目无限加速 */
export const DAO_FRUIT_SOFT_EXP = 0.9
/** 转世天赋抽取数 = 1 + floor(major / 2) */
export const TALENT_DRAW_DIV = 2
/** 转世后灵根资质保底提升 */
export const REINCARNATE_APTITUDE_FLOOR = 5
/** 转世后已习功法层数折半(向下取整,至少 1 层) */
export const REBIRTH_GONGFA_LEVEL_DIV = 2

// ============ 离线首领 ============
/** 离线自动挑战区域首领的收益折损系数 */
export const OFFLINE_BOSS_REWARD_MULT = 0.75

// ============ 创角 ============
export const CREATE_REROLL_LIMIT = 8
