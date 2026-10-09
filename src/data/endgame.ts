/** 真仙终局数据 —— 道途 / 特殊规则世界 / 天道试炼 / 天道熔炉 */
import type { CelestialWorldDef, DaoPathDef, TrialDef, WorldFoeShape, WorldRouteNode } from '@/types'

// ============ 道途:此道在世,一切战斗皆循此规则 ============

export const DAO_PATHS: DaoPathDef[] = [
  {
    id: 'sword',
    name: '剑道',
    seal: '剑',
    desc: '一剑破万法。极致的锋锐,换走厚重的余地',
    ruleText: ['暴击率 +10%,暴击伤害 +30%', '攻击无视敌方 15% 防御', '自身受到伤害 +10%'],
    rules: {
      playerExtraMods: { critRate: 0.1, critDamage: 0.3, armorPen: 0.15, damageReduction: -0.1 }
    },
    deepText: [
      '剑意:道途越纯,剑意越盛——主流派大成、法宝不过一件、不修回血之术,至多四层,每层伤害 +4%、会心 +2%',
      '远征蓄势:每胜一场,剑意再添一层'
    ]
  },
  {
    id: 'longevity',
    name: '长生道',
    seal: '寿',
    desc: '不争一时之胜,只求万世长存',
    ruleText: ['治疗与护盾效率 +50%', '护盾上限提升至 65%', '一切敌人生命 +20%'],
    rules: {
      healMult: 1.5,
      shieldCapRatio: 0.65,
      enemyHpMult: 1.2,
      perRounds: { interval: 5, playerHealPct: 0.04, playerShieldPct: 0.04, enemyAtkGrowth: 0.06 }
    },
    deepText: ['长生印:每五回合得一印,恢复 4% 气血、凝 4% 护盾——越拖越强', '印生杀意:敌人攻势亦随之每印 +6%。长生不怕鏖战,最怕爆发']
  },
  {
    id: 'fate',
    name: '天机道',
    seal: '机',
    desc: '窥破天机,亦被天机所窥。胜负交予概率',
    ruleText: ['敌我双方暴击率 +8%', '敌我双方闪避 +6%', '战局大起大落'],
    rules: {
      playerExtraMods: { critRate: 0.08, dodgeRate: 0.06 },
      enemyExtraMods: { critRate: 0.08, dodgeRate: 0.06 }
    },
    deepText: ['天机透视:远征启程前,可窥见敌人招式明细与此战胜算', '契约与路线的凶险,于你不再是未知数']
  },
  {
    id: 'slaughter',
    name: '杀伐道',
    seal: '杀',
    desc: '以战证道。你我皆利刃,先断者输',
    ruleText: ['自身攻击 +25%', '一切敌人攻击 +15%', '战斗回合上限 -30%'],
    rules: { playerAtkMult: 1.25, enemyAtkMult: 1.15, maxRounds: 35 },
    deepText: ['杀意:远征每胜一场,伤害 +5%,层层递进', '速战之赏:远征总回合越短,道源加成越高(至多 +25%)']
  }
]

export function daoPathDef(id: string): DaoPathDef | undefined {
  return DAO_PATHS.find(d => d.id === id)
}

// ============ 天界敌人形状(相对玩家属性的比例) ============

function shape(
  name: string,
  icon: string,
  atkR: number,
  defR: number,
  hpR: number,
  speed: number,
  skills: WorldFoeShape['skills'],
  mods?: WorldFoeShape['mods']
): WorldFoeShape {
  return { name, icon, atkR, defR, hpR, speed, skills, mods }
}

/** 路线节点构造 */
function node(
  id: string,
  name: string,
  desc: string,
  foe: WorldFoeShape,
  bonus: number,
  riskText: string,
  rules?: WorldRouteNode['rules']
): WorldRouteNode {
  return { id, name, desc, foe, bonus, riskText, rules }
}

// ============ 特殊规则世界 ============

export const CELESTIAL_WORLDS: CelestialWorldDef[] = [
  {
    id: 'chiyan',
    name: '赤炎天',
    seal: '炎',
    anchorTier: 22,
    desc: '天穹燃烧,雷火贯体。此界只问一件事:你扛得住几击?',
    ruleText: ['敌人攻击 +40%', '真伤横行,烈焰炙烤(治疗 -35%)', '回合上限骤减(拖字诀必败)'],
    rules: { enemyAtkMult: 1.4, maxRounds: 32, healMult: 0.65, enemyExtraMods: { critRate: 0.1 } },
    entryCost: 20,
    fights: 6,
    healBetweenPct: 0.5,
    foes: [
      shape('赤炎狱卒', 'flame', 0.74, 0.42, 0.95, 1.1, [{ name: '狱火贯心', mult: 1.6, rate: 0.45, effect: 'pierce' }]),
      shape('焚天巨魔', 'skull', 0.84, 0.4, 1.15, 1.0, [{ name: '焚天重锤', mult: 2.2, rate: 0.35 }])
    ],
    guardian: shape('赤炎天主', 'flame', 0.86, 0.5, 1.8, 1.1, [
      { name: '天火贯体', mult: 1.8, rate: 0.4, effect: 'pierce' },
      { name: '烈焰焚世', mult: 2.4, rate: 0.25 }
    ]),
    routes: [
      [
        node(
          'cy_fire',
          '火海',
          '烈焰滔天,狱卒当道',
          shape('狱火统领', 'flame', 0.82, 0.42, 1.0, 1.1, [{ name: '狱火燎原', mult: 2.0, rate: 0.4 }]),
          8,
          '高爆发'
        ),
        node(
          'cy_ash',
          '灰烬径',
          '余烬无声,真伤蚀骨',
          shape('烬灰行者', 'skull', 0.76, 0.4, 0.95, 1.0, [{ name: '烬蚀', mult: 1.5, rate: 0.5, effect: 'pierce' }]),
          12,
          '真伤连绵'
        )
      ],
      [
        node(
          'cy_hell',
          '炎狱',
          '巨魔守关,一锤定音',
          shape('焚天巨魔', 'skull', 0.88, 0.4, 1.2, 1.0, [{ name: '焚天重锤', mult: 2.3, rate: 0.35 }]),
          10,
          '重击高爆'
        ),
        node(
          'cy_lava',
          '熔浆道',
          '足下皆熔浆,步步失血',
          shape('熔浆魔蛟', 'flame', 0.8, 0.44, 1.1, 1.05, [{ name: '熔浆噬体', mult: 1.4, rate: 0.45, effect: 'bleed' }]),
          14,
          '持续流血',
          { healMult: 0.8 }
        )
      ],
      [
        node(
          'cy_sky',
          '天火台',
          '天火倾落,避无可避',
          shape('天火使者', 'flame', 0.9, 0.46, 1.15, 1.15, [{ name: '天火倾世', mult: 2.1, rate: 0.4 }]),
          12,
          '爆发密集'
        ),
        node(
          'cy_heart',
          '焚心路',
          '心火内燃,会心频频',
          shape('焚心魔', 'ghost', 0.84, 0.42, 1.05, 1.1, [{ name: '焚心一击', mult: 1.8, rate: 0.4 }], { critRate: 0.25 }),
          16,
          '敌方高会心'
        )
      ]
    ],
    rewardDaoSource: 60
  },
  {
    id: 'wanren',
    name: '万刃天',
    seal: '刃',
    anchorTier: 25,
    desc: '亿万飞刃永不停歇。每一段锋芒,都是反击者的粮',
    ruleText: ['敌人皆为多段连击且血厚如山', '速攻在此撞墙', '受击反制收益极高'],
    rules: { enemyExtraMods: { critRate: 0.1 } },
    entryCost: 20,
    fights: 6,
    healBetweenPct: 0.5,
    foes: [
      shape('千刃傀儡', 'sword', 0.78, 0.55, 1.7, 1.25, [{ name: '千刃连斩', mult: 1.0, rate: 0.7, effect: 'multi' }]),
      shape('刃风妖灵', 'wind', 0.82, 0.5, 1.55, 1.35, [{ name: '刃风乱舞', mult: 0.95, rate: 0.65, effect: 'multi' }])
    ],
    guardian: shape('万刃天主', 'sword', 0.85, 0.6, 2.8, 1.3, [
      { name: '万刃归宗', mult: 1.1, rate: 0.7, effect: 'multi' },
      { name: '刃雨倾天', mult: 1.8, rate: 0.2 }
    ]),
    routes: [
      [
        node(
          'wr_array',
          '千刃阵',
          '刃阵连绵,段段夺命',
          shape('千刃阵灵', 'sword', 0.8, 0.55, 1.6, 1.25, [{ name: '千刃连斩', mult: 1.0, rate: 0.72, effect: 'multi' }]),
          8,
          '多段密集'
        ),
        node(
          'wr_gale',
          '风刃谷',
          '刃随风走,虚影难觅',
          shape('风刃妖灵', 'wind', 0.8, 0.5, 1.45, 1.4, [{ name: '风刃乱舞', mult: 0.9, rate: 0.65, effect: 'multi' }], {
            dodgeRate: 0.2
          }),
          12,
          '多段且闪避'
        )
      ],
      [
        node(
          'wr_forge',
          '傀儡工坊',
          '铁躯如山,久拆方倒',
          shape('铸刃傀儡', 'sword', 0.75, 0.62, 2.1, 1.15, [{ name: '碎骨拳', mult: 1.2, rate: 0.5 }]),
          10,
          '厚血消耗'
        ),
        node(
          'wr_rain',
          '刃雨原',
          '刃雨骤落,一波致命',
          shape('刃雨妖主', 'wind', 0.9, 0.5, 1.5, 1.3, [{ name: '刃雨倾盆', mult: 2.0, rate: 0.4 }]),
          14,
          '爆发骤袭'
        )
      ],
      [
        node(
          'wr_hall',
          '归宗殿',
          '万刃朝宗,连击不休',
          shape('归宗刃卫', 'sword', 0.85, 0.58, 1.9, 1.3, [{ name: '万刃朝宗', mult: 1.05, rate: 0.7, effect: 'multi' }]),
          12,
          '多段强化'
        ),
        node(
          'wr_still',
          '静刃庭',
          '刃静无声,一顿封喉',
          shape('静刃守卫', 'moon', 0.82, 0.55, 1.7, 1.2, [{ name: '静刃封喉', mult: 1.6, rate: 0.45, effect: 'stun' }]),
          16,
          '频繁震慑'
        )
      ]
    ],
    rewardDaoSource: 60
  },
  {
    id: 'wusheng',
    name: '无生天',
    seal: '寂',
    anchorTier: 29,
    desc: '此界拒绝生机。治疗近乎无效,唯有向死而生者能行',
    ruleText: ['治疗效率 -70%', '护盾上限减半', '敌人攻击 +15%'],
    rules: { healMult: 0.3, shieldCapRatio: 0.25, enemyAtkMult: 1.15, enemyExtraMods: { critRate: 0.1 } },
    entryCost: 20,
    fights: 6,
    healBetweenPct: 0.5,
    foes: [
      shape('寂灭僧', 'ghost', 0.85, 0.45, 1.0, 1.0, [{ name: '寂灭指', mult: 1.6, rate: 0.4, effect: 'pierce' }]),
      shape('枯骨行者', 'skull', 0.82, 0.5, 1.1, 0.95, [{ name: '枯荣一叹', mult: 1.5, rate: 0.4, effect: 'bleed' }])
    ],
    guardian: shape('无生天主', 'ghost', 0.95, 0.52, 1.9, 1.05, [
      { name: '无生劫', mult: 2.0, rate: 0.35 },
      { name: '生机断绝', mult: 1.4, rate: 0.3, effect: 'bleed' }
    ]),
    routes: [
      [
        node(
          'ws_temple',
          '寂灭堂',
          '梵音断生,指劲穿盾',
          shape('寂灭尊者', 'ghost', 0.87, 0.45, 1.05, 1.0, [{ name: '寂灭指', mult: 1.65, rate: 0.42, effect: 'pierce' }]),
          8,
          '真伤穿透'
        ),
        node(
          'ws_wood',
          '枯荣林',
          '枯枝缠身,血尽方休',
          shape('枯荣树妖', 'leaf', 0.8, 0.5, 1.2, 0.9, [{ name: '枯藤绞杀', mult: 1.45, rate: 0.45, effect: 'bleed' }]),
          12,
          '流血消耗'
        )
      ],
      [
        node(
          'ws_cliff',
          '断生崖',
          '崖风如刀,一击夺魄',
          shape('断生崖主', 'mountain', 0.92, 0.48, 1.1, 1.0, [{ name: '断生一击', mult: 2.1, rate: 0.38 }]),
          10,
          '高攻爆发'
        ),
        node(
          'ws_swamp',
          '无返沼',
          '沼气噬魂,长于吸髓',
          shape('噬魂沼灵', 'ghost', 0.82, 0.46, 1.15, 0.95, [{ name: '噬魂', mult: 1.5, rate: 0.45, effect: 'drain' }]),
          14,
          '敌人吸血',
          { healMult: 0.7 }
        )
      ],
      [
        node(
          'ws_gate',
          '灭度门',
          '门后无生,唯有一战',
          shape('灭度明王', 'skull', 0.95, 0.5, 1.25, 1.05, [{ name: '灭度金身', mult: 2.0, rate: 0.4 }]),
          12,
          '强敌当关'
        ),
        node(
          'ws_void',
          '空寂台',
          '身影空寂,出手落空',
          shape('空寂行者', 'moon', 0.85, 0.44, 1.05, 1.2, [{ name: '空寂掌', mult: 1.6, rate: 0.4 }], { dodgeRate: 0.28 }),
          16,
          '高闪避'
        )
      ]
    ],
    rewardDaoSource: 60
  },
  {
    id: 'wuxiang',
    name: '无相天',
    seal: '影',
    anchorTier: 32,
    desc: '万物无相,出手落空。此界嘲笑一切依赖招式衔接的道',
    ruleText: ['敌人闪避极高', '敌人出手极快', '概率与稳定的对决'],
    rules: { enemyExtraMods: { critRate: 0.12 } },
    entryCost: 20,
    fights: 6,
    healBetweenPct: 0.5,
    foes: [
      shape('无相魅影', 'ghost', 0.85, 0.38, 0.85, 1.5, [{ name: '影袭', mult: 1.6, rate: 0.35 }], { dodgeRate: 0.35 }),
      shape('虚空游者', 'cloud', 0.82, 0.4, 0.95, 1.45, [{ name: '虚空一击', mult: 1.8, rate: 0.3 }], { dodgeRate: 0.3 })
    ],
    guardian: shape('无相天主', 'moon', 0.95, 0.45, 1.75, 1.5, [{ name: '无相神通', mult: 1.9, rate: 0.35, effect: 'stun' }], {
      dodgeRate: 0.35
    }),
    routes: [
      [
        node(
          'wx_mist',
          '雾影径',
          '雾深影乱,十击九空',
          shape('雾影魅', 'cloud', 0.8, 0.38, 0.9, 1.5, [{ name: '雾影袭', mult: 1.5, rate: 0.38 }], { dodgeRate: 0.4 }),
          12,
          '极高闪避'
        ),
        node(
          'wx_thunder',
          '惊雷道',
          '雷光坦荡,硬撼而过',
          shape('惊雷武尊', 'zap', 0.92, 0.44, 1.05, 1.3, [{ name: '惊雷贯顶', mult: 2.1, rate: 0.4 }]),
          8,
          '正面高爆发'
        )
      ],
      [
        node(
          'wx_gallery',
          '幻相廊',
          '幻象摄神,步步惊魂',
          shape('幻相灵', 'moon', 0.84, 0.4, 0.95, 1.4, [{ name: '摄神幻光', mult: 1.6, rate: 0.4, effect: 'stun' }], { dodgeRate: 0.25 }),
          10,
          '震慑频发'
        ),
        node(
          'wx_rift',
          '虚空隙',
          '空隙藏刃,段段袭来',
          shape('隙间刃灵', 'wind', 0.8, 0.42, 1.0, 1.45, [{ name: '隙间连袭', mult: 0.95, rate: 0.6, effect: 'multi' }], {
            dodgeRate: 0.2
          }),
          14,
          '多段且难缠'
        )
      ],
      [
        node(
          'wx_none',
          '无相门',
          '至虚至无,唯稳者过',
          shape('无相护法', 'ghost', 0.86, 0.42, 1.0, 1.5, [{ name: '无相掌', mult: 1.7, rate: 0.38 }], { dodgeRate: 0.42 }),
          16,
          '闪避近半'
        ),
        node(
          'wx_form',
          '有相门',
          '有相有形,力大身沉',
          shape('有相金刚', 'mountain', 0.9, 0.5, 1.35, 1.1, [{ name: '金刚碎岳', mult: 2.0, rate: 0.4 }]),
          10,
          '厚血高攻'
        )
      ]
    ],
    rewardDaoSource: 60
  }
]

export function celestialWorldDef(id: string): CelestialWorldDef | undefined {
  return CELESTIAL_WORLDS.find(w => w.id === id)
}

// ============ 天道试炼(极限 Build 挑战) ============

export const TRIALS: TrialDef[] = [
  {
    id: 'qisha',
    name: '七杀试炼',
    seal: '七',
    anchorTier: 23,
    desc: '七场连战,不得换装,场场增强。记录你最快的杀伐',
    ruleText: ['连战 7 场,敌人逐场增强', '场间仅恢复三成气血', '追求最少总回合'],
    rules: {},
    entryCost: 15,
    fights: 7,
    healBetweenPct: 0.3,
    escalation: 1.07,
    rewardDaoSource: 45
  },
  {
    id: 'yixian',
    name: '一线试炼',
    seal: '悬',
    anchorTier: 26,
    desc: '开局气血仅余三成半。向死而生者的主场',
    ruleText: ['每场开局仅 35% 气血', '连战 4 场', '濒死者的证道之地'],
    rules: { playerStartHpPct: 0.35 },
    entryCost: 15,
    fights: 4,
    healBetweenPct: 1,
    escalation: 1.05,
    rewardDaoSource: 45
  },
  {
    id: 'wuhui',
    name: '无回试炼',
    seal: '断',
    anchorTier: 30,
    desc: '此地一切治疗无效。不靠回复,你还剩什么?',
    ruleText: ['治疗完全无效', '连战 5 场', '场间不恢复'],
    rules: { healMult: 0 },
    entryCost: 15,
    fights: 5,
    healBetweenPct: 0,
    escalation: 1.04,
    rewardDaoSource: 45
  }
]

export function trialDef(id: string): TrialDef | undefined {
  return TRIALS.find(t => t.id === id)
}

/** 试炼敌人形状(通用) */
export const TRIAL_FOES: WorldFoeShape[] = [
  shape('天道傀影', 'user', 0.5, 0.45, 0.9, 1.1, [{ name: '天道一击', mult: 1.7, rate: 0.35 }]),
  shape('心魔化身', 'ghost', 0.54, 0.42, 0.85, 1.2, [{ name: '心魔噬道', mult: 1.6, rate: 0.35, effect: 'drain' }])
]

/** 天道变数敌池:四天机制敌混编,防单一流派对中庸敌通吃 */
export const MUTATION_FOES: WorldFoeShape[] = [
  CELESTIAL_WORLDS[0]!.foes[0]!,
  CELESTIAL_WORLDS[1]!.foes[0]!,
  CELESTIAL_WORLDS[3]!.foes[0]!,
  CELESTIAL_WORLDS[2]!.foes[0]!,
  TRIAL_FOES[0]!,
  TRIAL_FOES[1]!
]

// ============ 天道熔炉(闲置资源 → 道源) ============

export interface FurnaceRate {
  resource: 'ore' | 'page' | 'herb' | 'dust'
  name: string
  /** 多少资源换 1 道源 */
  per: number
}

export const FURNACE_RATES: FurnaceRate[] = [
  { resource: 'ore', name: '玄铁', per: 25 },
  { resource: 'page', name: '功法残页', per: 15 },
  { resource: 'herb', name: '灵草', per: 60 },
  { resource: 'dust', name: '器灵尘', per: 80 }
]

/** 灵石献祭:每份消耗按玩家层级折算的灵石数量(在服务层用 stoneByTier 计算) */
export const FURNACE_STONE_TIER_AMOUNT = 300
export const FURNACE_STONE_DAO_SOURCE = 5

/**
 * 道源凝道果:数值成长唯一出口,受道果软上限约束。
 *
 * 凝一枚道果的**时长**由 economySim 的 daoCostHours 守:它 = DAO_SOURCE_PER_FRUIT ÷
 * 熔炉每小时道源潜力,且必须在整条界外长尾上**不随层级漂移**(ISS-214 红线)。
 * 从 100 抬到 200,即把「凝一枚道果」的典型时长从 ~1h 拉到 ~2~3h(实测 daoCostHours
 * 全境 ~1.8~3.4h,中心 ~2.5h) —— 道果更稀缺、终局节奏更慢、每一枚更重
 * (design: 道果价恒定、熔炉平算,品位价值走灵石)。
 */
export const DAO_SOURCE_PER_FRUIT = 200

/**
 * 熔炉可熔灵草的**最低品阶**。
 *
 * 道源是**仙**才开始有的货币:凡/灵品草(人间界)只有坊市→灵石一条出路,永不入炉;
 * 仙/神/道品草(天/神/混沌海)才进天道熔炉。esourceOverCredit 修:
 * 熔炉 herb 按「≥此品的总和」计、也按这些品实际扣料,凡/灵品不入账。
 */
export const FURNACE_HERB_MIN_GRADE = 3

/**
 * 远征行程:0 ~ ROUTE_LAYERS-1 为「重」层择路,ROUTE_LAYERS 为界主层。
 *
 * 层号就是规则本身(择路函数只认 0..2、界主判定认 3),故把它抽成常数:
 * 界面上的「三重」、行程点列、以及越界守卫都读同一份,改行程不必四处找数字。
 */
export const EXPEDITION_ROUTE_LAYERS = 3
export const EXPEDITION_GUARDIAN_LAYER = EXPEDITION_ROUTE_LAYERS
