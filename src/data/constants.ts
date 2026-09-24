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
/** 寿元低于该比例即进入告警色(界面) */
export const LIFESPAN_WARN_RATIO = 0.15
/** 寿元低于该比例记为「寿元低位」(成就口径,较告警更危急) */
export const LIFESPAN_CRITICAL_RATIO = 0.1

// ============ 修炼曲线 ============
/** 炼气一层突破需求 */
export const EXP_BASE = 40
/**
 * 每大境界需求倍率 / 基础速度倍率
 *
 * Phase 39「壁已非壁」:需求抬一档(18 → 19)、基础修速压一档(1.6 → 1.3),
 * 净耗时增长 ≈ 19 / 5.2 ≈ ×3.65 每大境界(原 ≈ ×3.46)。
 * 两头一起动,是因为只动一边会挪走整条曲线的形状(前期秒过、后期陡崖)——
 * 「每一境慢多少」这个数只由两者的比决定。终局口径见 progressionSim 的里程碑与长尾两条。
 */
export const EXP_MAJOR_GROWTH = 19
/** 每小层需求倍率 */
export const EXP_SUB_GROWTH = 1.32
/** 基础修为/秒 —— Phase 39 由 1.6 降到 1.3(灵气修为的获取速度整体压一档) */
export const CULT_BASE_SPEED = 1.3
/** 每大境界基础速度倍率 */
export const CULT_MAJOR_SPEED_GROWTH = 5.2
/** 每小层基础速度倍率 */
export const CULT_SUB_SPEED_GROWTH = 1.06

/**
 * 界外成长节奏(仙界/神界/混沌海,即 major > WORLD_BREAK_MAJOR)。
 *
 * 人间界 0-9 号境界沿用上面 19 / 5.2 这套曲线(净耗时 ≈ ×3.65/境),
 * 若原样外推到 21 境,终局需求会变成天文数字,那 12 个新境界等同于不存在。
 * 界外仍走**指数复利**,只是把每境的需求基数换成 4.6、修炼/灵气基数换成 3.2:
 *
 *   修为需求/境 = LATE_EXP_GROWTH       = ×4.6   (指数复利:远超线性)
 *   灵气上限/境 = LATE_QI_CAP_GROWTH    = ×4.0
 *   灵气回复/境 = LATE_QI_REGEN_GROWTH  = ×3.2
 *   战力/境     = LATE_COMBAT_GROWTH    = ×4.6
 *   净耗时/境   = 4.6 / 3.2             = ×1.44  (见下行:与战力不对齐的只有它)
 *
 * 关键在最后一行的分工:需求与战力都按指数堆叠(数值上是实打实的复利),
 * 而净耗时只按 1.44 倍增长 —— 于是"每境更难的量级"是指数级的,但整条 21 境阶梯
 * 仍落在可达范围。灵气同理(容量 ×4、回复 ×3.2),不会出现"容量涨得比回复快、
 * 越到后面越存不满"的断层。
 *
 * Phase 39:4.4 → 4.6。界外本就是"这一世之后"的长线,而玩家反馈的口径是
 * 「上界太快、快到顶」—— 每境净耗时 1.375 → 1.44 倍。仍受两条判据约束:
 * 每境增幅 <2 倍、长尾相对真仙有界(见 progressionSim.spec)。
 */
export const LATE_EXP_GROWTH = 4.6
export const LATE_CULT_SPEED_GROWTH = 3.2
export const LATE_COMBAT_GROWTH = 4.6
export const LATE_QI_CAP_GROWTH = 4.0
export const LATE_QI_REGEN_GROWTH = 3.2

/**
 * 跨界那一境的修为需求倍率 —— 人间→仙界、仙界→神界、神界→混沌海。
 *
 * 数值上的落点:把**界末那一境的圆满**抬成一道真正的墙 —— 走完它才能引劫跨界,
 * 而那一劫本身另有一档加难(见 TRIB_WORLD_STEP_STAT_FOLD)。两道合起来,
 * 破界才是一步,而不是又一次寻常突破。
 *
 * 只抬圆满那一层,不抬整个界末境界:前面九层仍按正常曲线走,
 * 玩家能清楚感到「最后一步忽然重了」,而不是「这一境莫名其妙地长」。
 */
export const WORLD_STEP_EXP_MULT = 2
/**
 * 灵气「积余」上限(相对标称容量的倍数)。
 *
 * 灵气不因卡境而白白溢出:即使一时突破不得,灵气也继续累积,可在标称容量之上
 * 存到该倍数(用于连续尝试突破、平复伤势、供奉/修复等)。上界的灵气开销本就是
 * 指数级的,固守一个标称容量会让「等待」变成纯粹的浪费。
 */
export const QI_BANK_MULT = 10
/** 小境界数量(9 层 + 圆满) */
export const SUB_LEVELS = 10

// ============ 灵气 ============
export const QI_BASE_CAP = 100
export const QI_CAP_MAJOR_GROWTH = 6
export const QI_CAP_SUB_GROWTH = 1.12
/** 基础灵气回复/秒 —— Phase 39 由 1.2 降到 0.9(灵气这条线一并收慢) */
export const QI_BASE_REGEN = 0.9
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
/**
 * 天劫单波伤害那一条式子:
 *   单波(占最大生命) = TRIB_WAVE_BASE + TRIB_WAVE_MAJOR × 境界(封顶) + TRIB_WAVE_STEP × 第几道
 *
 * 收进常数只为**单一事实源**:公式(core/formulas)、界面读数(core/tribulationDecision)、
 * 设计记录(docs/superpowers/specs/2026-09-17-*)三处都要能对着同一组数说话。
 * 从前它们是 formulas 里的一行字面量,记录一写下来就只能靠人去核。
 */
export const TRIB_WAVE_BASE = 0.155
export const TRIB_WAVE_MAJOR = 0.02
export const TRIB_WAVE_STEP = 0.031
/**
 * 跨界那一劫对「三维折算」的态度 —— 人间→仙界、仙界→神界、神界→混沌海。
 *
 * 界内的关认血肉(防御折抗性、气血折开劫水位,见上面那两条 TRIB_DEF / TRIB_HP 常量),
 * 界膜那一关不认:0 = 折算一概作废,只剩词条与准备说话。
 *
 * 之所以用**规则**而不是再调一次伤害公式:
 *   · 天劫的伤害口径已在 TRIBULATION_DIFFICULTY_CAP_MAJOR 封顶,再抬一档,
 *     tribulationSpace.spec 的「四维皆优必可渡」当场失守(实测 +7% 即倒);
 *   · 三维折算本来就是上一版给"血厚防高"的兜底,它**只对真实修士存在**,
 *     参考构筑(只带词条)从不吃它 —— 于是这条规则加的是玩家的体感,
 *     而不是把解题空间挤掉:三条非满配之路(抗性/减伤/恢复)一条不少。
 * 界膜之前,血肉之厚不算数;要过去,得真备好那几样。
 */
export const TRIB_WORLD_STEP_STAT_FOLD = 0
/**
 * 天劫的三维折算 —— 血厚防高者允许**硬抗**,但两条都有绝对上限。
 *
 * 天劫伤害按最大生命百分比结算(见 core/formulas.tribulationWaveDamage),
 * 攻伐/防御/气血本不进公式。可一身厚血厚防站在劫前半点用没有,说不过去:
 * 于是把三维按「本境裸修为的一倍」当尺子折成两样天劫认的东西 ——
 *   防御 → 天劫抗性:超出裸修为的部分,每倍折 4%,上限 18%
 *   气血 → 开劫水位:超出裸修为的部分,每倍折 4%,上限 +35%
 * 两条都封顶,理由与抗性/减伤本身的绝对上限一致:渡劫的正解是**准备**
 * (抗性/减伤/恢复/护持),三维给的是"不至于白堆"的兜底,不是替代品。
 * 尺子取 realmScale × COMBAT_*_BASE(即 baseCombatStats),与 statsCalc 同源 ——
 * 别在这里另写一条曲线,否则"超出多少倍"会随改动悄悄漂移。
 *
 * Phase 39:两条上限 30%/60% → 18%/35%,折算率 5% → 4%。
 * 「兜底」不该厚到让准备变得可有可无:一位厚血厚防的修士原本能白拿三成抗性 + 六成开劫水位,
 * 那已不是兜底,而是把渡劫的四维解法空间挤掉一半 —— 也正是"渡劫又太容易"的来源之一。
 * 三维仍作数(不至于白堆),但补不满"准备"那一半。
 */
export const TRIB_DEF_RESIST_PER_SURPLUS = 0.04
export const TRIB_DEF_RESIST_CAP = 0.18
export const TRIB_HP_GUARD_PER_SURPLUS = 0.04
export const TRIB_HP_GUARD_CAP = 0.35
/**
 * 天劫难度的境界封顶点(扩界)。
 *
 * 伤害与波次原为 = 0.15 + major×0.02(逐境) + wave×0.03(逐波),波次 = 3 + major,
 * 这套口径是为「major ≤ 8(渡劫)」设的:彼时封顶的减伤/护持绝对值(减伤 55%、
 * 抗性 80%)足以应付。扩界后若让 major 一路线性涨到 20,总量会翻几倍,
 * 而减伤类词条是**有绝对上限**的——结果就是连设计者自己那套「四维皆优」
 * 参考构筑(见 tribulationSpace.spec 的 maxed)都在神帝以上 0/5 可渡,
 * 天劫从「解法空间」退化成「必须堆满硬顶」的墙。
 *
 * 故难度在 TRIBULATION_DIFFICULTY_CAP_MAJOR 处封顶:≤ 此境者一律不变,
 * 其上的境界沿用同一难度基线;上界的威压由区域/首领与绝对上限的构筑要求承担。
 *
 * Phase 39(「渡劫又似乎太容易」):这次加难走三条路,且都不许碰解题空间 ——
 *   ① 基数 0.15 → 0.155、逐波 0.03 → 0.031:同一套式子,整条曲线上移 3%;
 *      (这是本口径能加的**上限**:实测再加 4% 就会让参考构筑在雷鸣/逆流劫下不渡)
 *   ② 三维折算的上限收窄(30%/60% → 18%/35%,见上面那段)—— 兜底不再是半张答案;
 *   ③ 跨界那一境**不认三维折算**(TRIB_WORLD_STEP_STAT_FOLD)—— 只加「这一步」。
 * 加完之后必须仍然过得了 tribulationSpace.spec 的五道门(四维皆优必可渡、
 * 每境每种劫型都还剩一条非满配之路)—— 那是这次改难的**上限**,不是可选项。
 */
export const TRIBULATION_DIFFICULTY_CAP_MAJOR = 9

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
/** 功法/敌方神通命中之后的附加。战斗与战前情报读同一批数。 */
export const SKILL_STUN_CHANCE = 0.5
export const SKILL_DRAIN_HP = 0.06
export const SKILL_SHIELD_HP = 0.1
export const SKILL_BLEED_ATK = 0.3
export const SKILL_MULTI_HITS = 2
export const SKILL_MULTI_RATIO = 0.45
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
  'accuracy',
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
  // 与闪避对称:命中越上限也按四折计入 —— 堆满只够抹平同级的幻影,不该白送
  accuracy: { cap: 0.55, diminish: 0.4 },
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

// ============ 装备重铸与词条封存 ============
/**
 * 重铸:**不限次数**,成本只与「装备阶数」和「封存了几个词条」挂钩。
 *
 * 旧版是「次数指数增长(1.5^n)+ 上限 10 次」——两处都坏:
 *   · 次数上限让「这件还能不能救」变成一个与装备无关的数字(第十次之后直接不给炼);
 *   · 指数增长惩罚的不是"洗得多",而是"洗得久":一件 3 阶的旧装备,
 *     洗到第五次已经比 20 阶的还贵,而它给的词条池是同一个。
 * 现在成本只看两件事实:**它有多高阶**(stoneByTier,与强化/封存同一条经济)、
 * **你封存了几个词条**(封存是保护,保护得越多,重掷剩下部分的代价越高)。
 * 于是「无限重铸」不等于「免费洗干净」:想保住好词条就得付溢价,
 * 而每一次重铸都可能重掷词条**条数**(见 core/reforge.reforgeEquipment)。
 */
/** 重铸基础灵石(stoneByTier 倍率,按装备阶数) */
export const REFORGE_STONE_BASE = 40
/** 每封存一个词条,重铸成本上浮的份额 */
export const REFORGE_SEAL_LOAD = 0.6
/** 重铸器灵尘消耗 = 基础 × (1 + 封存数)(器灵尘另有来路,故不叠阶数) */
export const REFORGE_DUST_BASE = 30
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
 *
 * Phase 36(一阶一名):装备掉落改为**按阶取**之后,模型的期望装备变实了 ——
 * 从前那一版是累积池,审计模型的「常规档」在 12 阶常常还穿着 3 阶的青霜剑
 * (剑攻 12 对诛仙剑胚的 17),于是读数偏悲观:真正的化神修士本不该拿那样的剑。
 * 装备一实,同一条曲线上的敌人就得跟上,否则「内容死亡点」会从炼虚前移到化神
 * (实测:化神顶阶战力比 2.74 → 3.20,越过 3.0 的压制线)。
 * 故增速抬一档(1.105 → 1.113):早期几乎不动(+3%),中段约 +8%,后期约 +15%,
 * 与「玩家总是穿着本阶装备」这一事实对齐。玩家仍略占优(对称比 1.27 → 1.08 > 1)。
 *
 * Phase 37(品质=强度阶梯):品质平铺从 mult^0.6 提到 mult^1.8,
 * 玩家的装备乘区跨度从 8.3 倍涨到 126.6 倍(凡品零级 → 神品满强化)。
 * 敌人补偿是**跟随项**,不是常量:玩家乘区变陡,它就得同样变陡,
 * 否则「抽到一件好东西就碾完全图」。1.113 → 1.18,19 层上的补偿总量 7.7 → 23.2 倍。
 * 校准判据不是这条曲线自己好不好看,而是 contentCoverageAudit 的两条读数:
 *   ① 常规档全程不出现内容死亡点(死亡点 = 所有可达区域都已被压制)
 *   ② 顶区战力比全程 < 12(区域战斗不许失去意义)
 * 1.18 是同时满足这两条的档位;1.13 会让常规档在真仙就推完全图。
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
// (原「每掉落层级数值倍率 EQUIP_TIER_GROWTH」已于 Phase 33.2 停用:
//  装备平铺改由 powerScale(tier) 直接对齐境界与内容曲线,该常数不再参与任何计算。)
/**
 * 装备基础属性整体系数 —— 装备这条来源的**总预算**。
 *
 * 九个槽位的平铺权重相加约为 40,而玩家境界基础攻击只有 COMBAT_ATK_BASE=12,
 * 系数一旦放大,装备平铺就会独占战力,境界成长反被稀释(见 inflationAudit 的来源结构)。
 * 所以这个数管的是「装备总共占几分」,而**品质之间的差距由
 * EQUIP_QUALITY_FLAT_EXP 表达** —— 一个管总量,一个管分配,两件事不混。
 *
 * Phase 37 再收一档(0.6 → 0.5):品质那一侧涨了(见 EQUIP_QUALITY_FLAT_EXP),
 * 总预算就得跟着收 —— 让**神品**值钱,而不是让「装备」整体更值钱。
 */
export const EQUIP_BASE_FACTOR = 0.5
/**
 * 品质对「平铺数值」的放大指数 —— 品质这条阶梯**陡不陡**。
 *
 * 平铺倍率 = mult^本指数,而 mult 本身是一条 ×1.33 的阶梯(凡 1.0 → 神 9.5)。
 * 1.8 时:神品平铺 ≈ 凡品的 58 倍,每高一档品质约 ×1.8。
 *
 * ## 为什么从 0.6 改回 1.8(Phase 37)
 *
 * Phase 33.2 把它压到 0.6(神品只剩 3.77 倍),理由是装备平铺独占了玩家战力。
 * 压完之后玩家感受到的是另一件事:**品质没有意义** ——
 * 五阶神品打不过七阶良品(实测 0.93x),甚至不如七阶凡品(1.04x),
 * 刷高品的动机只剩词条条数。
 *
 * 现在的口径是「**强度换稀有度**」:拿到手就得有优势,难度由获取概率承担
 * (品质窗口 + 掉率,见 QUALITY_WEIGHTS 与 QUALITY_OUT_OF_BAND)。
 * 一个现代人拿着手枪就是打得过古代第一武将 —— 但别让他轻易拿到手枪。
 *
 * 实测(整身九件、同阶同质对比):
 *   五阶神品 ÷ 七阶:凡 14.0 · 良 10.3 · 精 6.9 · 灵 4.5 · 玄 2.6 · 地 1.67 · 天 0.98
 * 即品质能跨过两个阶位、一个大境界边界去赢;但连天品/仙品也压过需要每档 ×1.9
 * (神品 ≈ 70 倍)——那时阶位只剩准入券,游戏从「看生态、调构筑」变成
 * 「抽一件好东西通到底」,故停在这里。
 *
 * 注意这条阶梯是**指数**,不是常数:调节它等于同时调节所有品质的相对关系,
 * 而装备总预算由 EQUIP_BASE_FACTOR 兜住(见那里的注释)。
 */
export const EQUIP_QUALITY_FLAT_EXP = 1.8
/**
 * 品质窗口外的掉落权重**按距离指数衰减**的底数(见 data/qualities 的 fromTier/toTier)。
 *
 * 0.1 的底数 = 每离窗口远一档,权重掉到十分之一:
 *   窗口内 ×1 · 差一档 ×0.1 · 差两档 ×0.01 · 差三档 ×0.001 …
 * 于是「混沌海掉出凡品」这种事发生率是万分之几量级(而非旧口径下的 1.7%),
 * 而窗口边缘又平滑过渡,不会出现「跨过某一层,某种品质突然绝迹」的墙角。
 *
 * 为什么不直接关掉(0):图鉴要补得齐,际遇也该有惊喜 ——
 * 人间界掉出一件仙品,那是故事,不是数值事故,只是它一年碰不到一次。
 */
export const QUALITY_OUT_OF_BAND = 0.1
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
/** 分解/回收时返还强化投入的比例(尘与灵石同率) */
export const DECOMPOSE_REFUND_RATE = 0.8
/** 智能收纳:词条 roll 达到此线才算「近满」(条条达标才当藏) */
export const SMART_KEEP_PERFECT_ROLL = 0.85
export const BAG_CAPACITY = 120

// ============ 掉落 ============
/**
 * 品质基础权重(凡→神)。
 *
 * 与品质窗口(QUALITY_OUT_OF_BAND / data/qualities 的 fromTier/toTier)一起,
 * 决定「哪一档品质在什么内容里、以多大概率现世」——即**获取难度**这条线。
 * 强度那条线是 EQUIP_QUALITY_FLAT_EXP,两者是一对:想抬强度就得同时设想掉率,
 * 否则高品要么白送(强度低时),要么只存在于图鉴里(掉率过低时)。
 *
 * Phase 37 随强度阶梯一起收紧了高端:天品 4 → 2.5 · 仙品 1 → 0.5 · 神品 0.2 → 0.05,
 * 叠上窗口与层级加成后,混沌道祖一层的掉落约 天品八成 / 仙品一成半 / 神品一两个百分点
 * (旧口径:神品 0.1%、且凡品良品还在掉)。「手枪」是可以有的,但得自己攒出来。
 * 「手枪」是可以有的,但得自己攒出来。
 */
export const QUALITY_WEIGHTS = [5000, 3000, 1500, 400, 80, 15, 2.5, 0.5, 0.05] as const
/** 层级每 +1,高品质权重乘数 */
export const QUALITY_TIER_SHIFT = 1.18
export const EQUIP_DROP_CHANCE = 0.3
export const PILL_DROP_CHANCE = 0.08
export const PAGE_DROP_CHANCE = 0.12
export const ARTIFACT_DROP_CHANCE = 0.015
/** 战斗灵石基础掉落(按层级指数放大) */
export const STONE_DROP_BASE = 12
export const STONE_TIER_GROWTH = 1.9
/**
 * 修为的**唯一计价单位:等效闭关时长**。
 *
 * 从前三条来源各说各话:挂机按修速/秒、丹药按「当前一层需求的百分比」、
 * 战斗与际遇也是百分比。凡是按需求百分比给的那几条,价值都随境界指数上涨,
 * 而它们的"代价"(一枚丹的材料、一场遭遇的 12 秒)是恒定的 —— 于是越往上,
 * 它们越不像奖励、越像通路:实测真仙期一场遭遇值 35.7 小时闭关、
 * 比值 8984× 于挂机,化神之后挂机修炼近乎装饰(读数见 core/expIncome)。
 *
 * 现在统一成一句话:**一切即时修为 = 修速 × 一段等效闭关时长,且不满一层。**
 *   · 一场取胜的遭遇:BATTLE_EXP_SECS
 *   · 一次际遇/机缘:见 data/events 与 data/chains 的 secs(30~120 秒)
 *   · 一枚修为丹:见 data/pills 的 expSecs(30 分~2 日半,炼制出来的东西本就该更重)
 * 三者的差别只在"这段时长有多长",不再有一处随境界跑飞。
 *
 * 12 秒不是拍的:遭遇每小时 300 次(在线每 12 秒一次、离线照算),其中约 252 场战斗
 * (按 0.85 胜率算 214 场胜)、48 次际遇 —— 214 × 12 秒 + 48 × 60 秒 = 1.51 小时/小时。
 * 历练与挂机是**并行**的,故三条渠道合起来是一个闭合的三角(读数见 core/expIncome):
 *
 *   挂机 1.0× · 挂机+历练 ≈2.5× · 闭关 ≈2.5×(但期间不能历练)
 *
 * —— **闭关与「挂机+历练」恰好打平**,所以专心修炼换来的是不被打断、代价是放弃掉落;
 * 出门历练换来的是掉落、代价是修为上并不更快。这些倍率在任何境界都成立,
 * 因为三条线都随"修速"缩放:修速词条、洞府、灵脉、闭关、丹药增益因此对
 * **两条收入线同时有效** —— 这正是修好之后的性质,也是修之前丢掉的性质。
 */
export const BATTLE_EXP_SECS = 12
/**
 * 任何即时修为(丹药 / 一场遭遇 / 一次际遇)**都不得填满当前这一层**。
 *
 * 与「等效闭关时长」配套:低境界一层只要几十秒,而写死的时长(丹药尤其)动辄以时计,
 * 不封顶的话一枚丹就能连跳几层。封顶只认"一层"这个与境界无关的自然刻度,
 * 故它不会随境界改变任何东西 —— 高境界一层以日计,这条几乎用不到。
 */
export const INSTANT_EXP_LAYER_CAP = 0.9

// ============ 历练 ============
export const EXPLORE_BATTLE_INTERVAL = 12
/**
 * 一场历练里攒够多少胜,才有资格挑战区域之主。
 *
 * 在线(runBattle)与离线结算(settleOffline 的自动挑战)必须共用这一个门槛 ——
 * 从前两边各写一遍字面量 10,改一处就会让离线抢跑解锁下一区。
 */
export const EXPLORE_BOSS_AFTER_WINS = 10
export const EXPLORE_EVENT_CHANCE = 0.16
/**
 * 历练里三档触发的概率 —— **一条乘法链,不是一个一个独立数字**。
 *
 * 一次遭遇先掷 EXPLORE_EVENT_CHANCE(这一程出不出事);出了事才在里面取一个:
 * 先看有没有该走的奇缘(CHAIN_STAGE_CHANCE),再看要不要撞机缘(FORTUNE_CHANCE),
 * 都不是才是寻常际遇。于是三档的稀度是**按闸门顺序**乘出来的:
 *
 *   无缘在续 → 际遇 ≈ 每 6.4 程 · 机缘 ≈ 每 319 程 · 奇缘不出现
 *   有缘在续 → 际遇 ≈ 每 9.1 程 · 奇缘 ≈ 每 20.8 程 · 机缘 ≈ 每 446 程
 *
 * 两个状态都要报 —— 从前只报一个状态、且把三档当成互斥抽取(三者之和 0.211
 * 大过「出事」本身的 0.16,数学上不成立),等于给玩家一组永远同时成立的假读数。
 * 界面口径见 core/eventTier.tierChances(逐字复刻引擎的掷法),
 * 对账见 core/eventTier.spec(用真引擎做蒙特卡洛)。
 */
export const CHAIN_STAGE_CHANCE = 0.3
export const FORTUNE_CHANCE = 0.02
/** 事件搁置超过该秒数后自动按默认选项处理 */
export const EVENT_AUTO_RESOLVE_SECONDS = 120
export const EXPLORE_MODES = {
  normal: { name: '寻常游历', durationSec: 1800, rewardMult: 1, dangerMult: 1 },
  deep: { name: '深入探寻', durationSec: 3600, rewardMult: 1.4, dangerMult: 1.45 },
  risky: { name: '涉险求机', durationSec: 7200, rewardMult: 1.9, dangerMult: 2.1 },
  // 玩家反馈「挂机1小时2小时可以有更长时间的选择」:档位曲线顺延一步(2h→4h)。
  // 凶险比奖励涨得更快(2.6 > 2.4),长挂不白嫖 —— 与既有档位同一套取舍
  prolonged: { name: '长线云游', durationSec: 14400, rewardMult: 2.4, dangerMult: 2.6 }
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
// (原「转世后已习功法层数折半」的系数已撤:门类保留、层数归零回一层,
//  不再有折半比例可调 —— 见 core/reincarnation 的 carryGongfa。)

// ============ 离线首领 ============
/** 离线自动挑战区域首领的收益折损系数 */
export const OFFLINE_BOSS_REWARD_MULT = 0.75

// ============ 创角 ============
/**
 * 建号「逆天改命」的次数上限。
 *
 * null = 不限次:灵根是玩家对这副牌的第一印象,不满意就该能一直刷到掷中自己认的那一副,
 * 不必为「还剩几次」分心。转世另说 —— 转世的灵根仍是系统发下来的一张牌,没有挑选界面。
 * 要收紧为有限次数时改成具体数字即可:store 的扣减/耗尽分支与界面文案都读这一个常量。
 */
export const CREATE_REROLL_QUOTA: number | null = null
