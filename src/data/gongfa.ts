/** 功法库 —— 63 部:主修 27 / 辅修 22 / 秘术 14,每境都有新东西可参 */
import type { GongfaDef, GongfaType, QualityId, StatMods } from '@/types'

function g(
  id: string,
  name: string,
  type: GongfaType,
  quality: QualityId,
  minRealm: number,
  desc: string,
  baseMods: StatMods,
  perLevelMods: StatMods,
  opts: { element?: GongfaDef['element']; maxLevel?: number; skill?: GongfaDef['skill'] } = {}
): GongfaDef {
  return {
    id,
    name,
    type,
    quality,
    minRealm,
    desc,
    baseMods,
    perLevelMods,
    maxLevel: opts.maxLevel ?? (type === 'secret' ? 3 : 9),
    element: opts.element,
    skill: opts.skill
  }
}

export const GONGFA: GongfaDef[] = [
  // ---- 主修功法 ----
  g(
    'm_taixuan',
    '太玄引气诀',
    'main',
    'mortal',
    0,
    '大道至简的入门功法,胜在中正平和',
    { cultivationSpeed: 0.1 },
    { cultivationSpeed: 0.02 },
    { skill: { name: '太玄一气', mult: 1.5, rate: 0.2 } }
  ),
  g(
    'm_qingmu',
    '青木长生功',
    'main',
    'fine',
    0,
    '取青木生生不息之意,养身养气',
    { cultivationSpeed: 0.12, maxHpPct: 0.06 },
    { cultivationSpeed: 0.02, maxHpPct: 0.01 },
    { element: 'wood', skill: { name: '木灵缠绕', mult: 1.4, rate: 0.2 } }
  ),
  g(
    'm_lihuo',
    '离火焚天诀',
    'main',
    'fine',
    0,
    '心火即离火,一念可焚天',
    { cultivationSpeed: 0.1, attackPct: 0.08 },
    { cultivationSpeed: 0.02, attackPct: 0.012 },
    { element: 'fire', skill: { name: '焚天火', mult: 1.7, rate: 0.22 } }
  ),
  g(
    'm_xuanshui',
    '玄水凝真经',
    'main',
    'fine',
    0,
    '上善若水,以柔克刚',
    { cultivationSpeed: 0.1, defensePct: 0.08, qiRegen: 0.08 },
    { cultivationSpeed: 0.02, defensePct: 0.012 },
    { element: 'water', skill: { name: '寒潮', mult: 1.5, rate: 0.2 } }
  ),
  g(
    'm_gengjin',
    '庚金剑典',
    'main',
    'excellent',
    1,
    '庚金主杀伐,剑修之上选',
    { cultivationSpeed: 0.14, attackPct: 0.12, critRate: 0.02 },
    { cultivationSpeed: 0.02, attackPct: 0.015 },
    { element: 'metal', skill: { name: '庚金剑气', mult: 1.9, rate: 0.25 } }
  ),
  g(
    'm_houtu',
    '厚土不动明王功',
    'main',
    'excellent',
    1,
    '不动如山,万法难侵',
    { cultivationSpeed: 0.12, defensePct: 0.14, maxHpPct: 0.1 },
    { cultivationSpeed: 0.02, defensePct: 0.015, maxHpPct: 0.012 },
    { element: 'earth', skill: { name: '山岳压顶', mult: 1.6, rate: 0.22 } }
  ),
  g(
    'm_zixiao',
    '紫霄神雷诀',
    'main',
    'spirit',
    2,
    '引九天神雷淬体炼魂',
    { cultivationSpeed: 0.18, attackPct: 0.14, speed: 0.05 },
    { cultivationSpeed: 0.025, attackPct: 0.018 },
    { element: 'thunder', skill: { name: '紫霄神雷', mult: 2.2, rate: 0.25 } }
  ),
  g(
    'm_gangfeng',
    '罡风渡虚法',
    'main',
    'spirit',
    2,
    '身化罡风,来去无踪',
    { cultivationSpeed: 0.16, dodgeRate: 0.04, explorationSpeed: 0.1 },
    { cultivationSpeed: 0.025, dodgeRate: 0.005 },
    { element: 'wind', skill: { name: '风刃千重', mult: 1.9, rate: 0.28 } }
  ),
  g(
    'm_xuanbing',
    '玄冰道典',
    'main',
    'spirit',
    3,
    '心如玄冰,道心通明',
    { cultivationSpeed: 0.18, defensePct: 0.12, damageReduction: 0.04 },
    { cultivationSpeed: 0.025, defensePct: 0.015 },
    { element: 'ice', skill: { name: '冰封千里', mult: 2.0, rate: 0.24 } }
  ),
  g(
    'm_guangming',
    '大光明普照经',
    'main',
    'profound',
    4,
    '光明所照,诸邪辟易',
    { cultivationSpeed: 0.22, maxHpPct: 0.16, breakthroughRate: 0.02 },
    { cultivationSpeed: 0.03, maxHpPct: 0.02 },
    { element: 'light', skill: { name: '大光明拳', mult: 2.3, rate: 0.25 } }
  ),
  g(
    'm_youming',
    '幽冥噬魂录',
    'main',
    'profound',
    4,
    '噬魂夺魄,亦正亦邪',
    { cultivationSpeed: 0.22, attackPct: 0.18, lifesteal: 0.03 },
    { cultivationSpeed: 0.03, attackPct: 0.02 },
    { element: 'dark', skill: { name: '噬魂', mult: 2.2, rate: 0.26 } }
  ),
  g(
    'm_hundun',
    '混沌一气功',
    'main',
    'heaven',
    6,
    '万法归一,一气化混沌',
    { cultivationSpeed: 0.3, attackPct: 0.12, defensePct: 0.12, maxHpPct: 0.12 },
    { cultivationSpeed: 0.04, attackPct: 0.015, defensePct: 0.015 },
    { element: 'chaos', skill: { name: '混沌一击', mult: 2.8, rate: 0.25 } }
  ),
  g(
    'm_dujie',
    '九霄渡劫经',
    'main',
    'heaven',
    8,
    '引九霄雷气淬身,劫数亦成道基',
    { cultivationSpeed: 0.3, attackPct: 0.16, tribulationResist: 0.18 },
    { cultivationSpeed: 0.04, attackPct: 0.018 },
    { element: 'thunder', skill: { name: '九霄雷劫', mult: 3.0, rate: 0.26 } }
  ),
  g(
    'm_taixu',
    '太虚炼神篇',
    'main',
    'profound',
    5,
    '炼神返虚,虚室生白 —— 神全则形不敝',
    { cultivationSpeed: 0.2, defensePct: 0.12, qiRegen: 0.1 },
    { cultivationSpeed: 0.03, defensePct: 0.014 },
    { skill: { name: '炼神返虚', mult: 2.4, rate: 0.24 } }
  ),
  g(
    'm_wuliang',
    '无量寿光经',
    'main',
    'heaven',
    7,
    '取无量寿之意,光所照处,寿与道同长',
    { cultivationSpeed: 0.32, maxHpPct: 0.2, lifespanPct: 0.08 },
    { cultivationSpeed: 0.04, maxHpPct: 0.02, lifespanPct: 0.01 },
    { element: 'light', skill: { name: '无量寿光', mult: 2.9, rate: 0.25 } }
  ),
  // ---- 辅修功法 ----
  g('s_tuna', '龟灵吐纳术', 'sub', 'mortal', 0, '一吐一纳,绵绵不绝', { cultivationSpeed: 0.06 }, { cultivationSpeed: 0.012 }),
  g(
    's_lianti',
    '百炼锻体术',
    'sub',
    'mortal',
    0,
    '肉身为炉,千锤百炼',
    { maxHpPct: 0.08, defensePct: 0.04 },
    { maxHpPct: 0.012, defensePct: 0.008 }
  ),
  g(
    's_yufeng',
    '御风步',
    'sub',
    'fine',
    0,
    '踏风而行,身轻如燕',
    { speed: 0.05, explorationSpeed: 0.06 },
    { speed: 0.008, explorationSpeed: 0.01 }
  ),
  g('s_lianxi', '敛息诀', 'sub', 'fine', 1, '敛尽气机,祸事不近身', { dodgeRate: 0.03, luck: 0.03 }, { dodgeRate: 0.004, luck: 0.005 }),
  g('s_juling', '聚灵阵法初解', 'sub', 'fine', 1, '布下小型聚灵阵辅助修行', { qiRegen: 0.12 }, { qiRegen: 0.02 }),
  g(
    's_mingxin',
    '明心见性篇',
    'sub',
    'excellent',
    1,
    '观己心,见本性',
    { expGain: 0.08, breakthroughRate: 0.01 },
    { expGain: 0.015, breakthroughRate: 0.002 }
  ),
  g(
    's_tiegu',
    '铁骨铮铮功',
    'sub',
    'excellent',
    2,
    '骨如玄铁,宁折不弯',
    { defensePct: 0.1, damageReduction: 0.03 },
    { defensePct: 0.015, damageReduction: 0.005 }
  ),
  g(
    's_lingxi',
    '灵犀一指',
    'sub',
    'excellent',
    2,
    '指出灵犀,直指要害',
    { critRate: 0.03, critDamage: 0.1 },
    { critRate: 0.004, critDamage: 0.02 }
  ),
  g(
    's_dianshi',
    '点石成金术',
    'sub',
    'spirit',
    3,
    '沙里淘金,点石成宝',
    { spiritStoneGain: 0.15, dropRate: 0.06 },
    { spiritStoneGain: 0.025, dropRate: 0.01 }
  ),
  g(
    's_guixi',
    '龟息养寿功',
    'sub',
    'spirit',
    3,
    '息心止念,寿与天齐',
    { lifespanPct: 0.06, maxHpPct: 0.08 },
    { lifespanPct: 0.012, maxHpPct: 0.012 }
  ),
  g(
    's_zhoutian',
    '周天星辰图',
    'sub',
    'profound',
    5,
    '以身为宇,以窍为星',
    { cultivationSpeed: 0.12, qiRegen: 0.1 },
    { cultivationSpeed: 0.02, qiRegen: 0.02 }
  ),
  g(
    's_wanjian',
    '万剑归宗图',
    'sub',
    'profound',
    5,
    '万剑朝宗,杀伐无双',
    { attackPct: 0.15, comboRate: 0.04 },
    { attackPct: 0.02, comboRate: 0.006 }
  ),
  g(
    's_budong',
    '不动如山章',
    'sub',
    'excellent',
    1,
    '身如山岳,盾罡不息',
    { shieldOnStart: 0.06, shieldPower: 0.08 },
    { shieldOnStart: 0.01, shieldPower: 0.015 }
  ),
  g(
    's_xingshen',
    '形神合一诀',
    'sub',
    'heaven',
    6,
    '身与道合,伤处自弥 —— 形神从此不再两分',
    { maxHpPct: 0.2, defensePct: 0.12, regenPerRound: 0.012 },
    { maxHpPct: 0.022, defensePct: 0.014 }
  ),
  g(
    's_puti',
    '菩提明镜功',
    'sub',
    'heaven',
    7,
    '心如明镜台,时时勤拂拭 —— 悟得快,劫也渡得稳',
    { expGain: 0.12, breakthroughRate: 0.02, luck: 0.06 },
    { expGain: 0.018, breakthroughRate: 0.003, luck: 0.008 }
  ),
  // ---- 秘术 ----
  g('x_tianyan', '天眼通', 'secret', 'excellent', 2, '开天眼,窥机缘', { luck: 0.06, eventLuck: 0.08 }, { luck: 0.02, eventLuck: 0.03 }),
  g(
    'x_jingang',
    '金刚不坏身',
    'secret',
    'spirit',
    3,
    '法身金刚,不坏不灭',
    { damageReduction: 0.08, lowHpReduction: 0.15 },
    { damageReduction: 0.02, lowHpReduction: 0.05 }
  ),
  g(
    'x_jianxin',
    '剑心通明',
    'secret',
    'spirit',
    3,
    '剑心澄澈,料敌先机',
    { critRate: 0.05, critDamage: 0.2 },
    { critRate: 0.01, critDamage: 0.06 }
  ),
  g(
    'x_xiangsi',
    '向死而生诀',
    'secret',
    'spirit',
    2,
    '置之死地,而后方生',
    { lowHpDamage: 0.2, lowHpReduction: 0.1 },
    { lowHpDamage: 0.06, lowHpReduction: 0.03 }
  ),
  g(
    'x_fanzhen',
    '天罡反震诀',
    'secret',
    'spirit',
    3,
    '以彼之力,还施彼身',
    { counterRate: 0.08, counterDamage: 0.25 },
    { counterRate: 0.02, counterDamage: 0.08 }
  ),
  g('x_sanqing', '一气化三清', 'secret', 'profound', 5, '一气化三,修行三倍', { cultivationSpeed: 0.2 }, { cultivationSpeed: 0.06 }),
  g(
    'x_woxuan',
    '斡旋造化',
    'secret',
    'heaven',
    6,
    '窃天地造化为己用',
    { breakthroughRate: 0.04, breakRefund: 0.1 },
    { breakthroughRate: 0.01, breakRefund: 0.04 }
  ),
  g(
    'x_nitian',
    '逆天改命经',
    'secret',
    'immortal',
    7,
    '我命由我不由天',
    { luck: 0.1, breakthroughRate: 0.05, lifespanPct: 0.1 },
    { luck: 0.03, breakthroughRate: 0.012, lifespanPct: 0.03 }
  ),
  g(
    'x_jiuxiao',
    '九霄劫印',
    'secret',
    'heaven',
    8,
    '把九重雷劫缩成一枚印 —— 劫来则印出,以劫淬身',
    { tribulationResist: 0.2, damageReduction: 0.06, breakthroughRate: 0.03 },
    { tribulationResist: 0.05, breakthroughRate: 0.008 }
  ),
  // ---- 仙界及以上(准入境界 9-20)----
  g(
    'm_yuxu',
    '御虚仙典',
    'main',
    'immortal',
    9,
    '御虚而行,仙光护体,一步一重天',
    { cultivationSpeed: 0.34, attackPct: 0.16, defensePct: 0.14, maxHpPct: 0.14 },
    { cultivationSpeed: 0.045, attackPct: 0.018, defensePct: 0.016 },
    { element: 'wind', skill: { name: '御虚仙光', mult: 3.0, rate: 0.26 } }
  ),
  g(
    's_xianling',
    '仙灵淬体术',
    'sub',
    'immortal',
    10,
    '以仙灵之气淬炼肉身,脱胎换骨',
    { maxHpPct: 0.18, defensePct: 0.14, regenPerRound: 0.012 },
    { maxHpPct: 0.022, defensePct: 0.015 }
  ),
  g(
    'x_xianji',
    '仙机通玄',
    'secret',
    'immortal',
    11,
    '仙机在握,福祸先知',
    { luck: 0.12, eventLuck: 0.16, dropRate: 0.12 },
    { luck: 0.035, eventLuck: 0.045, dropRate: 0.03 }
  ),
  g(
    'x_taiyi',
    '太乙金华',
    'secret',
    'immortal',
    12,
    '回光守中,神气合于一处',
    { cultivationSpeed: 0.3, qiRegen: 0.2 },
    { cultivationSpeed: 0.06, qiRegen: 0.04 }
  ),
  g(
    'm_daluo',
    '大罗天章',
    'main',
    'immortal',
    13,
    '大罗天上,万法归真',
    { attackPct: 0.26, maxHpPct: 0.2, damageReduction: 0.08 },
    { attackPct: 0.028, maxHpPct: 0.02 }
  ),
  g(
    'm_shenxiao',
    '神霄九变',
    'main',
    'divine',
    14,
    '九变通神,雷动九天',
    { cultivationSpeed: 0.4, attackPct: 0.2, defensePct: 0.16, maxHpPct: 0.16 },
    { cultivationSpeed: 0.05, attackPct: 0.022, defensePct: 0.017 },
    { element: 'thunder', skill: { name: '神霄神雷', mult: 3.4, rate: 0.26 } }
  ),
  g(
    's_shenjiang',
    '神将兵符',
    'sub',
    'divine',
    15,
    '执神兵以行天罚,进退皆合军律',
    { attackPct: 0.26, defensePct: 0.22, critRate: 0.04 },
    { attackPct: 0.028, defensePct: 0.022 }
  ),
  g(
    's_shenlianti',
    '神炼不灭身',
    'sub',
    'divine',
    16,
    '神火炼体,身成不灭',
    { damageReduction: 0.1, maxHpPct: 0.2, lowHpReduction: 0.4 },
    { damageReduction: 0.022, maxHpPct: 0.024 }
  ),
  g(
    'm_hunyuan',
    '混元无极经',
    'main',
    'divine',
    18,
    '混元一体,无极而生,万法归一',
    { cultivationSpeed: 0.5, attackPct: 0.24, defensePct: 0.22, maxHpPct: 0.22 },
    { cultivationSpeed: 0.06, attackPct: 0.025, defensePct: 0.021 },
    { element: 'chaos', skill: { name: '混元一炁', mult: 3.8, rate: 0.28 } }
  ),
  g(
    's_hundunti',
    '混沌体术',
    'sub',
    'divine',
    19,
    '以混沌之气淬体,身与道同,不增不减',
    { maxHpPct: 0.24, defensePct: 0.2, damageReduction: 0.08 },
    { maxHpPct: 0.026, defensePct: 0.018 }
  ),
  g(
    'x_shenji',
    '神机衍数',
    'secret',
    'divine',
    17,
    '推演天机,行止皆在算中',
    { luck: 0.12, dropRate: 0.12, explorationSpeed: 0.12 },
    { luck: 0.035, dropRate: 0.03, explorationSpeed: 0.03 }
  ),
  g(
    'x_daoyin',
    '道音玄章',
    'secret',
    'divine',
    20,
    '大道之音不绝于耳,闻之者道基自厚',
    { cultivationSpeed: 0.32, breakthroughRate: 0.05, luck: 0.08 },
    { cultivationSpeed: 0.09, breakthroughRate: 0.015 }
  ),
  // 仙界其余四境各补一部 —— 此前 10-13 境的人只有一件本境功法可参,
  // 「主修只此一部、辅修只此一部」的时候,参悟这件事就没有选择可言。
  g(
    's_xianguang',
    '仙光护体诀',
    'sub',
    'immortal',
    9,
    '仙光绕身三尺,刀兵未至先折其锋',
    { shieldOnStart: 0.1, shieldPower: 0.12, damageReduction: 0.05 },
    { shieldOnStart: 0.016, shieldPower: 0.02 }
  ),
  g(
    'm_xuanxian',
    '玄仙御气经',
    'main',
    'immortal',
    10,
    '御气而行,一息千里 —— 玄仙之「玄」,玄在气机不竭',
    { cultivationSpeed: 0.36, qiRegen: 0.18, defensePct: 0.14 },
    { cultivationSpeed: 0.045, defensePct: 0.015 },
    { skill: { name: '玄仙一气', mult: 3.1, rate: 0.26 } }
  ),
  g(
    'm_jinque',
    '金阙玉章',
    'main',
    'immortal',
    11,
    '玉京金阙之上刻着的章句,读之如读万剑之诀',
    { attackPct: 0.2, defensePct: 0.16, critRate: 0.02 },
    { attackPct: 0.022, defensePct: 0.016 },
    { element: 'metal', skill: { name: '金阙剑气', mult: 3.2, rate: 0.26 } }
  ),
  g(
    'm_taiyijiu',
    '太乙救苦经',
    'main',
    'immortal',
    12,
    '太乙救苦,一诵经则伤者自起',
    { maxHpPct: 0.22, regenPerRound: 0.018, damageReduction: 0.06 },
    { maxHpPct: 0.022, damageReduction: 0.012 },
    { element: 'light', skill: { name: '太乙金光', mult: 3.0, rate: 0.25 } }
  ),
  g(
    's_luotian',
    '罗天星辰诀',
    'sub',
    'immortal',
    13,
    '罗天星海尽在诀中,星君所执即我执',
    { accuracy: 0.06, critRate: 0.04, critDamage: 0.2 },
    { critRate: 0.005, critDamage: 0.02 }
  ),
  // 神界四境
  g(
    'x_miaogushe',
    '藐姑射神章',
    'secret',
    'divine',
    14,
    '藐姑射之山有神人居焉,不食五谷,吸风饮露',
    { damageReduction: 0.1, maxHpPct: 0.16, dodgeRate: 0.04 },
    { damageReduction: 0.02, maxHpPct: 0.022 }
  ),
  g(
    'm_tianguan',
    '天关神兵诀',
    'main',
    'divine',
    15,
    '神兵列于天关,进退皆合军律',
    { attackPct: 0.24, defensePct: 0.2, armorPen: 0.06 },
    { attackPct: 0.026, defensePct: 0.02 },
    { element: 'metal', skill: { name: '天关神兵', mult: 3.5, rate: 0.27 } }
  ),
  g(
    'm_shenwang',
    '神王御极经',
    'main',
    'divine',
    16,
    '神域之主,御极临下,言出法随',
    { attackPct: 0.26, maxHpPct: 0.22, executeDamage: 0.1 },
    { attackPct: 0.028, maxHpPct: 0.022 },
    { skill: { name: '神王御极', mult: 3.6, rate: 0.27 } }
  ),
  g(
    'm_shendi',
    '神帝临尘章',
    'main',
    'divine',
    17,
    '神帝临尘,众神俯首 —— 一念即法度',
    { attackPct: 0.28, speed: 0.08, stunRate: 0.04 },
    { attackPct: 0.03, speed: 0.008 },
    { skill: { name: '神帝临尘', mult: 3.7, rate: 0.28 } }
  ),
  // 混沌海三境
  g(
    's_zhenling',
    '真灵不昧诀',
    'sub',
    'divine',
    18,
    '混沌初开,一点真灵不昧;守着它,万劫不迷',
    { cultivationSpeed: 0.34, breakthroughRate: 0.05, luck: 0.08 },
    { cultivationSpeed: 0.045, breakthroughRate: 0.012 }
  ),
  g(
    'm_shenmo',
    '神魔开天经',
    'main',
    'divine',
    19,
    '神魔一体,以身开界 —— 打的是命,换的是界',
    { attackPct: 0.3, maxHpPct: 0.24, lifesteal: 0.03 },
    { attackPct: 0.03, maxHpPct: 0.022 },
    { element: 'chaos', skill: { name: '开天一击', mult: 3.9, rate: 0.28 } }
  ),
  g(
    'm_daozu',
    '道祖本源经',
    'main',
    'divine',
    20,
    '道生一,一生万 —— 这部经从头到尾只讲一个字',
    { cultivationSpeed: 0.5, attackPct: 0.26, defensePct: 0.24, maxHpPct: 0.24 },
    { cultivationSpeed: 0.06, attackPct: 0.026, defensePct: 0.022 },
    { element: 'chaos', skill: { name: '本源一炁', mult: 4.0, rate: 0.29 } }
  )
]

const BY_ID = new Map(GONGFA.map(x => [x.id, x]))

export function gongfaDef(id: string): GongfaDef | undefined {
  return BY_ID.get(id)
}

/** 一部功法的满级:数据没写就用 g() 里的型默认(秘术 3 / 主辅 9)。
 *  只此一处事实源 —— 各处重复 `?? 9` 会把漏配 maxLevel 的秘术当真主修练到 9 层。 */
export function gongfaMaxLevel(def: GongfaDef | undefined): number {
  return def?.maxLevel ?? (def?.type === 'secret' ? 3 : 9)
}

export const GONGFA_TYPE_NAMES: Record<GongfaType, string> = {
  main: '主修',
  sub: '辅修',
  secret: '秘术'
}
