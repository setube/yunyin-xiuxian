/** 全局平衡参数集中于此;业务代码禁止魔法数字 */

// ============ 引擎 ============
export const TICK_MS = 1000
/** 距上次心跳超过该秒数走离线结算 */
export const OFFLINE_MIN_SECONDS = 120
/** 离线超过该秒数才弹出「归来」卷轴 */
export const OFFLINE_MODAL_MIN_SECONDS = 300
/** 离线收益上限(小时),下标按洞府等级换挡 */
export const OFFLINE_CAP_HOURS = [8, 12, 24, 48, 72] as const
export const OFFLINE_EFFICIENCY = 0.9
/** lastActiveAt 写入节流(毫秒) */
export const ACTIVE_STAMP_MS = 5000

// ============ 寿元 ============
/** 每现实 1 小时增加的年龄(岁) */
export const AGE_YEARS_PER_HOUR = 1
export const START_AGE = 16
/** 寿元低于该比例显示告警色 */
export const LIFESPAN_WARN_RATIO = 0.15
/** 寿元低于该比例记为「寿元低位」(成就口径) */
export const LIFESPAN_CRITICAL_RATIO = 0.1

// ============ 修炼曲线 ============
/** 炼气一层突破需求 */
export const EXP_BASE = 40
/**
 * 每大境界需求倍率。每境净耗时 ≈ 需求倍率 / 基础速度倍率 = 19 / 5.2 ≈ ×3.65;只动一边会改曲线形状(前期秒过、后期陡崖)。
 * 终局口径见 progressionSim 的里程碑与长尾两条
 */
export const EXP_MAJOR_GROWTH = 19
/** 每小层需求倍率 */
export const EXP_SUB_GROWTH = 1.32
/** 基础修为/秒 */
export const CULT_BASE_SPEED = 1.3
/** 每大境界基础速度倍率 */
export const CULT_MAJOR_SPEED_GROWTH = 5.2
/** 每小层基础速度倍率 */
export const CULT_SUB_SPEED_GROWTH = 1.06

/**
 * 界外(仙界/神界/混沌海,即 major > WORLD_BREAK_MAJOR)每境倍率:
 *   修为需求 ×4.6 · 修炼 ×3.2 · 战力 ×4.6 · 灵气上限 ×4.0 · 灵气回复 ×3.2;净耗时 4.6 / 3.2 ≈ ×1.44
 * 人间界曲线不外推:外推到 21 境终局需求不可达。
 * 判据(progressionSim.spec):每境增幅 <2 倍、长尾相对真仙有界
 */
export const LATE_EXP_GROWTH = 4.6
export const LATE_CULT_SPEED_GROWTH = 3.2
export const LATE_COMBAT_GROWTH = 4.6
export const LATE_QI_CAP_GROWTH = 4.0
export const LATE_QI_REGEN_GROWTH = 3.2

/**
 * 跨界(人间→仙界、仙界→神界、神界→混沌海)修为需求倍率,只抬界末境界的圆满那一层。
 * 跨界那一劫另有加难:TRIB_WORLD_STEP_STAT_FOLD
 */
export const WORLD_STEP_EXP_MULT = 2
/** 灵气「积余」上限(标称容量的倍数):卡境时灵气可越过标称容量继续累积到此 */
export const QI_BANK_MULT = 10
/** 小境界数量(9 层 + 圆满) */
export const SUB_LEVELS = 10

// ============ 灵气 ============
export const QI_BASE_CAP = 100
export const QI_CAP_MAJOR_GROWTH = 6
export const QI_CAP_SUB_GROWTH = 1.12
/** 基础灵气回复/秒 */
export const QI_BASE_REGEN = 0.9
export const QI_REGEN_MAJOR_GROWTH = 5.2
/** 灵气高于上限一半时修炼速度额外加成 */
export const QI_RICH_RATIO = 0.5
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
/**
 * 天劫单波伤害(占最大生命) = TRIB_WAVE_BASE + TRIB_WAVE_MAJOR × 境界(封顶) + TRIB_WAVE_STEP × 第几道。
 * 单一事实源:core/formulas 与 core/tribulationDecision 同读;须与 docs/superpowers/specs/2026-09-17-* 一致
 */
export const TRIB_WAVE_BASE = 0.155
export const TRIB_WAVE_MAJOR = 0.02
export const TRIB_WAVE_STEP = 0.031
/**
 * 跨界那一劫的三维折算系数;0 = 折算作废,只认词条与准备。
 * 参考构筑只带词条、不吃折算,本值不挤 tribulationSpace.spec 的解题空间
 */
export const TRIB_WORLD_STEP_STAT_FOLD = 0
/**
 * 天劫三维折算,尺子 = 本境裸修为(realmScale × COMBAT_*_BASE,即 baseCombatStats,与 statsCalc 同源,不另写曲线):
 *   防御 → 天劫抗性:超出部分每倍折 4%,上限 18%
 *   气血 → 开劫水位:超出部分每倍折 4%,上限 +35%
 * 两条封顶:三维只兜底,不替代准备(抗性/减伤/恢复/护持)
 */
export const TRIB_DEF_RESIST_PER_SURPLUS = 0.04
export const TRIB_DEF_RESIST_CAP = 0.18
export const TRIB_HP_GUARD_PER_SURPLUS = 0.04
export const TRIB_HP_GUARD_CAP = 0.35
/** 天劫减伤与濒危减伤的同一封顶;结算(waveDamage)与渡劫台账(CultivationView,经 tribulationDecision)同源 */
export const TRIB_REDUCTION_CAP = 0.6
/**
 * 天劫抗性总值封顶(词条抗性 + 灵根折算 + 三维折算的加法项之和)。
 * 高于减伤封顶:TRIB_REDUCTION_CAP 管「单条减伤词条」,本条管「抗性合起来最多能到多少」。
 * 原为 tribulationDecision 里的裸 0.8,与同函数上两行的 TRIB_REDUCTION_CAP 用法不一致,故提到此处。
 */
export const TRIB_RESIST_CAP = 0.8
/**
 * 天劫难度(伤害与波次)的境界封顶点:高于此境沿用此境难度。
 * 不封顶则减伤类词条撞绝对上限,神帝以上参考构筑(tribulationSpace.spec 的 maxed)0/5 可渡。
 * 伤害曲线已到上限:再加 4% 参考构筑在雷鸣/逆流劫下不渡。
 * 须过 tribulationSpace.spec 五道门(四维皆优必可渡、每境每种劫型留一条非满配之路)
 */
export const TRIBULATION_DIFFICULTY_CAP_MAJOR = 9

// ============ 问卦 / 星象 ============
/** 问卦耗悟道点 */
export const DIVINATION_COST = 2
/** 值日之宿所利界域的际遇加成(乘在际遇概率上) */
export const MANSION_EVENT_LUCK = 0.1
/** 星象值日定向(改今日所利界域)每次所费灵石(见 core/astronomy) */
export const MANSION_REDIRECT_COST = 300
/** 星象值日定向每游戏日次数上限(达上限当日回落到天数派生) */
export const MANSION_REDIRECT_MAX = 2
/** 命格「点化主星」耗灵石(见 core/fate 的 fateFocusMods) */
export const STAR_FOCUS_COST_BASE = 500
/** 点化主星放大倍率:选中主星 ×本值,其余十三颗不变 */
export const STAR_FOCUS_MULT = 2

// ============ 战斗基础 ============
export const COMBAT_ATK_BASE = 12
export const COMBAT_DEF_BASE = 7
export const COMBAT_HP_BASE = 150
export const COMBAT_MAJOR_GROWTH = 3.8
export const COMBAT_SUB_GROWTH = 1.09
export const CRIT_BASE = 0.05
export const CRIT_DMG_BASE = 0.5
export const MAX_COMBAT_ROUNDS = 50
/** 流派阈值:低血/满血判定线 */
export const LOW_HP_THRESHOLD = 0.3
export const FULL_HP_THRESHOLD = 0.9
/** 功法/敌方神通命中后的附加;战斗与战前情报同读 */
export const SKILL_STUN_CHANCE = 0.5
export const SKILL_DRAIN_HP = 0.06
export const SKILL_SHIELD_HP = 0.1
export const SKILL_BLEED_ATK = 0.3
export const SKILL_MULTI_HITS = 2
export const SKILL_MULTI_RATIO = 0.45
/** 战斗技能威力倍率上限,只防坏档(手改存档),不参与平衡;现有技能最高约 4.2 */
export const SKILL_MULT_CAP = 10
/** 战斗技能可执行的附加效果;存档里认不出的 effect 一律丢弃 */
export const COMBAT_SKILL_EFFECTS = ['stun', 'bleed', 'drain', 'shield', 'multi', 'pierce'] as const
/** 护盾总量上限(占最大生命比例) */
export const SHIELD_CAP_RATIO = 0.5
/**
 * 词条叠加递减:同一条件/触发词条多来源时,按贡献降序以 100%/75%/50%/25% 计入(第 5 个起均 25%)。
 * 规则性加成(道途/剑意)不受此约束
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
  'accuracy',
  'armorPen'
] as const
/** 战报播放基础间隔(毫秒),实际 = 基础 / 播放倍速 */
export const COMBAT_PLAYBACK_BASE_MS = 460
export const COMBAT_PLAYBACK_MIN_MS = 90

// ============ 属性软阈值 ============
/** 合计越过 cap 的部分按 diminish 折算(在 DIMINISH 同键多来源递减之后);cap 取在正常构筑达不到处 */
export const SOFT_CAPS: Partial<Record<import('@/types').AnyStatKey, { cap: number; diminish: number }>> = {
  critRate: { cap: 0.75, diminish: 0.5 },
  dodgeRate: { cap: 0.55, diminish: 0.4 },
  // 与闪避对称
  accuracy: { cap: 0.55, diminish: 0.4 },
  damageReduction: { cap: 0.55, diminish: 0.4 },
  shieldOnStart: { cap: 0.8, diminish: 0.5 }
}

/**
 * 修炼速度软阈值:合计越过 CULT_SPEED_SOFT_CAP_T 的部分按 CULT_SPEED_SOFT_CAP_DIMINISH 折算。
 * 单世满配天花板实测约 4.4(realPacing 满配档),阈值须高于它,只拦多轮回堆叠
 */
export const CULT_SPEED_SOFT_CAP_T = 5.0
export const CULT_SPEED_SOFT_CAP_DIMINISH = 0.5

// ============ 洞府灵脉投资 ============
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

// ============ 装备重铸与词条封存 ============
// 重铸不限次数,成本只看装备阶数(stoneByTier,与强化/封存同一条经济)与封存词条数;
// 每次重铸都可能重掷词条条数(见 core/reforge.reforgeEquipment)
/** 重铸基础灵石(stoneByTier 倍率,按装备阶数) */
export const REFORGE_STONE_BASE = 40
/** 每封存一个词条,重铸成本上浮的份额 */
export const REFORGE_SEAL_LOAD = 0.6
/** 重铸器灵尘消耗 = 基础 × (1 + 封存数),不叠阶数 */
export const REFORGE_DUST_BASE = 30
/** 封存一个词条的灵石倍率(第 n 次封存 ×n) */
export const SEAL_STONE_BASE = 200

/**
 * 词条转移定价:在目标件上「保留其余词条、把这一条洗出来」的期望花费 × 此率。
 * 单次 = 无封存重铸(灵石按目标阶 REFORGE_STONE_BASE,尘 REFORGE_DUST_BASE),保留 n 条时 ×(1 + REFORGE_SEAL_LOAD × n);
 * 次数由 reforge.expectedRollsToHit 解析求得;词条数值高低不进价。
 * 判据:转移价落在期望价 0.4~1.1 倍(affixTransferEconomy.spec 用真重铸对账)。
 * 灵石只按目标阶计,按源件阶计可套利
 */
export const TRANSFER_PRICE_RATE = 0.6

/**
 * 敌人相对玩家裸装的补偿系数,随层级指数跟随(不封顶),增速低于玩家;玩家装备乘区变陡时须同步变陡。
 * 判据(contentCoverageAudit):① 常规档全程无内容死亡点(死亡点 = 自此每境可达区域全被压制的最早境界)② 顶区战力比全程 < 12。
 * 1.18 同时满足两条;1.13 会让常规档在真仙推完全图。玩家/敌人装备对称比读数见 inflationAudit.ts 的 gearAsymmetry()
 */
export const ENEMY_GEAR_BASE = 0.9
export const ENEMY_GEAR_GROWTH = 1.18
/** 防御减伤上限 */
export const MITIGATION_CAP = 0.75
/** 减伤公式系数:red = def / (def + atk × K) */
export const MITIGATION_K = 1.15
/** 伤害随机浮动 ±10% */
export const DAMAGE_VARIANCE = 0.1

// ============ 装备 ============
/**
 * 装备基础属性整体系数 = 装备来源的总预算;品质间差距归 EQUIP_QUALITY_FLAT_EXP。
 * 九槽攻击权重合计 16~33(COMBAT_ATK_BASE=12),放大则装备独占战力(见 inflationAudit 的来源结构);品质那一侧调高须同步收它
 */
export const EQUIP_BASE_FACTOR = 0.5
/**
 * 品质对平铺数值的放大指数:平铺倍率 = mult^本值(mult 凡 1.0 → 神 9.5,每档 ×1.33)。
 * 1.8 时神品平铺 ≈ 凡品 58 倍,每档 ×1.5~1.8;实测五阶神品 ÷ 七阶天品 ≈ 0.85。
 * 0.6 时品质失去意义(五阶神品不敌七阶良品);每档 ×1.9 起阶位只剩准入券。
 * 稀有度由 QUALITY_WEIGHTS 与 QUALITY_OUT_OF_BAND 承担;总预算归 EQUIP_BASE_FACTOR
 */
export const EQUIP_QUALITY_FLAT_EXP = 1.8
/**
 * 品质窗口(data/qualities 的 fromTier/toTier)外掉落权重的衰减底数:每离窗口一档 ×本值。
 * 不取 0:图鉴须补得齐
 */
export const QUALITY_OUT_OF_BAND = 0.1
/** 每强化一级基础属性 +12% */
export const EQUIP_LEVEL_BONUS = 0.12
export const EQUIP_MAX_LEVEL_BASE = 10

/**
 * 装备「已重铸 / 已转移」计数的读档上界。
 *
 * 这两个数只用于界面显示(「已重铸 N 次」),而那两处是裸插值、没有格式化兜底 ——
 * 坏档写 `1e300` 会印成「已重铸 1e+300 次」。取一万:一次游戏里重铸几千次已极罕见,
 * 到不了的必定是坏档。与 `EQUIP_LEVEL_SANITIZE_CAP` 同一条思路(上界只为拦坏档)。
 */
export const EQUIP_COUNTER_MAX = 10_000
/** 炼器台每 2 级提高强化上限 1 */
export const FORGE_LEVEL_PER_CAP = 2
/** 强化成本:灵尘 */
export const UPGRADE_DUST_BASE = 4
export const UPGRADE_DUST_GROWTH = 1.5
/** 强化成本:灵石(按层级换算) */
export const UPGRADE_STONE_TIER_BASE = 15
/** 分解所得灵尘(按品质序号) */
export const DECOMPOSE_DUST = [1, 2, 4, 8, 16, 32, 64, 128, 256] as const
/** 分解/回收时返还强化投入的比例(尘与灵石同率) */
export const DECOMPOSE_REFUND_RATE = 0.8
/** 智能收纳:词条 roll 达到此线才算「近满」(条条达标才当藏) */
export const SMART_KEEP_PERFECT_ROLL = 0.85
export const BAG_CAPACITY = 120

/**
 * 玩家可输入文本的长度上限(道号、构筑名、试炼备注)。
 * 建号页与构筑页都在输入侧截到这个数;读档侧也要同样截,
 * 否则手改存档能塞几十万字符进去 —— 存档爆量,界面还要渲染那一整段。
 */
export const NAME_MAX_LENGTH = 8

/**
 * 单件装备的词条数硬上界。
 *
 * 品质表最高 8 条(divine 的 affixes 上界),洗练只换不增,故 9 已是真实峰值。
 * 这里放到 16 是为了给「未来加词条位」留余量,同时仍能拦下坏档 ——
 * 读档时不设界,手改存档能塞进几千条,存档爆量且词条面板要渲染那几千行。
 */
export const EQUIP_AFFIX_HARD_CAP = 16

/**
 * 辅修功法的席位数硬上界 = 洞府藏经阁满级时的席数(1 + 12/3)。
 * 应用侧仍按 `dongfu.subGongfaSlots` 动态限,这里只防读档时的冗余数据。
 */
export const SUB_GONGFA_SLOT_HARD_CAP = 5

// ============ 掉落 ============
/**
 * 品质基础权重(凡→神),与品质窗口(QUALITY_OUT_OF_BAND / data/qualities 的 fromTier/toTier)共同决定获取难度。
 * 与强度(EQUIP_QUALITY_FLAT_EXP)成对,调一边须同时考虑另一边。
 * 混沌道祖一层掉落约:天品八成 / 仙品一成半 / 神品一两个百分点
 */
export const QUALITY_WEIGHTS = [5000, 3000, 1500, 400, 80, 15, 2.5, 0.5, 0.05] as const
/** 层级每 +1,高品质权重乘数 */
export const QUALITY_TIER_SHIFT = 1.18
export const EQUIP_DROP_CHANCE = 0.3
/** 每场装备掉落概率封顶;在线 afterWin 与离线 settleOffline 同读 */
export const EQUIP_DROP_CHANCE_CAP = 0.9
export const PILL_DROP_CHANCE = 0.08
/** 双丹(一炉得二)概率封顶;结算(pillService.craftPill)直接用展示路径 craftability.bonusChanceWithYield 的结果 */
export const PILL_SECOND_CAP = 0.8
export const PAGE_DROP_CHANCE = 0.12
export const ARTIFACT_DROP_CHANCE = 0.015
/** 重复到手法宝折算的悟道点(loot.acquireArtifact);离线按期望件数入账(offline.ts) */
export const ARTIFACT_DUPLICATE_WUDAO = 10
// 材料掉落概率:afterWin 的 herb/ore 掷点与 economySim 预期产量同读
export const HERB_DROP_CHANCE = 0.5
export const ORE_DROP_CHANCE = 0.35
/** 离线单胜 flat 器灵尘,在线无此入口;与 herb/ore/page 的期望推导无关 */
export const OFFLINE_FLAT_DUST_PER_WIN = 0.3
/** 战斗灵石基础掉落(按层级指数放大) */
export const STONE_DROP_BASE = 12
export const STONE_TIER_GROWTH = 1.9
/**
 * 修为唯一计价单位:等效闭关时长。即时修为 = 修速 × 时长,且不满一层。
 * 一场取胜遭遇取本值(秒);际遇/机缘见 data/events 与 data/chains 的 secs,修为丹见 data/pills 的 expSecs。
 * 12 秒使「挂机+历练」≈ 闭关 ≈ 2.5× 挂机(读数见 core/expIncome)
 */
export const BATTLE_EXP_SECS = 12
/** 单次即时修为(丹药 / 遭遇 / 际遇)上限,占当前一层需求的比例 */
export const INSTANT_EXP_LAYER_CAP = 0.9

// ============ 历练 ============
export const EXPLORE_BATTLE_INTERVAL = 12
/** 挑战区域之主所需胜场;在线 runBattle 与离线 settleOffline 共用 */
export const EXPLORE_BOSS_AFTER_WINS = 10
export const EXPLORE_EVENT_CHANCE = 0.16
/**
 * 历练三档触发是一条乘法链:先掷 EXPLORE_EVENT_CHANCE,出事后依次判奇缘(CHAIN_STAGE_CHANCE)、
 * 机缘(FORTUNE_CHANCE),都不中为寻常际遇。
 * 界面口径 core/eventTier.tierChances 逐字复刻此掷法,对账见 core/eventTier.spec
 */
export const CHAIN_STAGE_CHANCE = 0.3
export const FORTUNE_CHANCE = 0.02
/** 事件搁置超过该秒数后自动按默认选项处理 */
export const EVENT_AUTO_RESOLVE_SECONDS = 120
export const EXPLORE_MODES = {
  normal: { name: '寻常游历', durationSec: 1800, rewardMult: 1, dangerMult: 1 },
  deep: { name: '深入探寻', durationSec: 3600, rewardMult: 1.4, dangerMult: 1.45 },
  risky: { name: '涉险求机', durationSec: 7200, rewardMult: 1.9, dangerMult: 2.1 },
  prolonged: { name: '长线云游', durationSec: 14400, rewardMult: 2.4, dangerMult: 2.6 },
  // 凶险涨得比奖励快
  marathon: { name: '彻夜问道', durationSec: 28800, rewardMult: 3, dangerMult: 3.2 },
  deepExpedition: { name: '远涉星野', durationSec: 57600, rewardMult: 3.6, dangerMult: 3.9 }
} as const
/** 凶险 > 奖励 × 本值才算「险」(deep 的 1.45 / 1.4 不算);见 explorationFoeDanger 与出行弹窗的同名判据 */
export const RISKY_DANGER_MARGIN = 1.05
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

// ============ 悟道兑换 ============
// 后期「灵石 → 悟道点」兑换:限量,不重建效率回路,不动熔炉建模(审计敏感)
/** 兑换开放境界(混沌海起) */
export const WUDAO_EXCHANGE_MIN_MAJOR = 18
/**
 * 每次兑换所费灵石,以「层级单位」计(服务层走 stoneByTier 折算)。
 * 写死绝对值会与境界收入脱钩:3000 石在混沌海只值一战收益的百万分之一,整条兑换形同白送。
 * 214 约为该境一小时的灵石收入(见 expIncome.winsPerHour)——十次即一日上限约合一小时。
 */
export const WUDAO_EXCHANGE_TIER_AMOUNT = 214
/** 每次兑换所得悟道点 */
export const WUDAO_EXCHANGE_GAIN = 1
/** 每游戏日可兑换的次数上限 */
export const WUDAO_EXCHANGE_PER_DAY = 10

// ============ 建筑 ============
export const BUILDING_COST_GROWTH = 2.3

// ============ 转世 ============
/** 每达成一个大境界积累道果 = (序号+1) × 系数 */
export const DAO_FRUIT_PER_MAJOR = 3
/** 每颗有效道果永久加成 */
export const DAO_FRUIT_CULT_BONUS = 0.03
export const DAO_FRUIT_COMBAT_BONUS = 0.015
/** 道果收益软上限指数:有效道果 = 道果^本值 */
export const DAO_FRUIT_SOFT_EXP = 0.9
/** 转世天赋抽取数 = 1 + floor(major / 2) */
export const TALENT_DRAW_DIV = 2
/** 转世后灵根资质保底提升 */
export const REINCARNATE_APTITUDE_FLOOR = 5

// ============ 离线首领 ============
/** 离线自动挑战区域首领的收益折损系数 */
export const OFFLINE_BOSS_REWARD_MULT = 0.75

// ============ 创角 ============
/** 建号「逆天改命」次数上限,null = 不限次;store 扣减/耗尽分支与界面文案同读。转世预览的重掷另算,恒不限次 */
export const CREATE_REROLL_QUOTA: number | null = null
