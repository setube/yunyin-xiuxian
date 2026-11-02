/**
 * 法宝池 —— 53 件,拥有被动属性与自动触发的主动神通
 *
 * passive / active.effect 是凡品零重基线(算式第一个因子),品阶与祭炼两条放大由 artifactValue 施加;
 * desc 与 effect 描述的是基线,不是面板。
 *
 * 品阶同管掉落权重(core/loot.artifactDropWeight)与数值倍率(artifactQualityMult),
 * 按 (fromTier 升,同阶内预算升) 排成不降的阶梯;凡品占头十二阶(基线档),第十三阶起才用品阶表达稀缺。
 * loot.spec 钉着:品阶不倒挂;神品在每个界域掉落池里只占个位数百分比。
 * 就近窗口「同阶 ×21」(loot.ARTIFACT_NEAR_BONUS)须与品阶分布一起调,池子仍以近阶之物为主。
 */
import type { AnyStatKey, ArtifactDef, ArtifactEffect, QualityId, StatMods } from '@/types'
import { formatPercent } from '@/utils/format'
import { SHIELD_CAP_RATIO } from './constants'
import { qualityDef } from './qualities'

function f(
  id: string,
  name: string,
  quality: QualityId,
  fromTier: number,
  desc: string,
  passive: StatMods,
  activeName: string,
  activeDesc: string,
  interval: number,
  effect: ArtifactEffect,
  icon = 'sparkles'
): ArtifactDef {
  return { id, name, desc, icon, quality, fromTier, passive, active: { name: activeName, desc: activeDesc, interval, effect } }
}

export const ARTIFACTS: ArtifactDef[] = [
  f(
    'af_muyu',
    '墨玉葫芦',
    'mortal',
    1,
    '装过仙酿的葫芦,酒气化作生机',
    { maxHpPct: 0.05 },
    '琼浆',
    '每 4 回合回复 12% 生命',
    4,
    { type: 'heal', pctMaxHp: 0.12 },
    'amphora'
  ),
  f(
    'af_lihuo',
    '离火珠',
    'mortal',
    2,
    '内封一点离火之精',
    { attackPct: 0.05 },
    '焚天',
    '每 3 回合喷吐真火,造成 220% 攻击伤害',
    3,
    { type: 'damage', mult: 2.2 },
    'flame-kindling'
  ),
  f(
    'af_xuantian',
    '玄天镜',
    'mortal',
    3,
    '镜光所照,邪魔退避',
    { defensePct: 0.06 },
    '镜光护体',
    '每 4 回合获得 18% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.18 },
    'mirror-round'
  ),
  f(
    'af_fuyao',
    '缚妖索',
    'mortal',
    4,
    '捆过大妖的绳索,妖气犹存',
    { speed: 0.05 },
    '缚妖',
    '每 4 回合束缚敌人,其攻击降低 20%',
    4,
    { type: 'weaken', pct: 0.2 },
    'lasso'
  ),
  f(
    'af_leiyin',
    '雷音锤',
    'mortal',
    5,
    '锤落有雷音滚滚',
    { critRate: 0.03 },
    '雷击',
    '每 3 回合降下雷霆,造成 260% 攻击伤害',
    3,
    { type: 'damage', mult: 2.6 },
    'hammer'
  ),
  f(
    'af_yujing',
    '玉净瓶',
    'mortal',
    6,
    '瓶中甘露,可涤荡伤痕',
    { maxHpPct: 0.08, qiRegen: 0.06, overhealShield: 0.3 },
    '甘露',
    '每 4 回合回复 20% 生命',
    4,
    { type: 'heal', pctMaxHp: 0.2 },
    'flask-round'
  ),
  f(
    'af_bagua',
    '八卦炉',
    'mortal',
    7,
    '炉中真火昼夜不熄',
    { attackPct: 0.08, alchemyYield: 0.1 },
    '炉火纯青',
    '每 3 回合喷出三昧真火,造成 300% 攻击伤害',
    3,
    { type: 'damage', mult: 3.0 },
    'cooking-pot'
  ),
  f(
    'af_dinghai',
    '定海珠',
    'mortal',
    8,
    '一珠定四海,风浪不兴',
    { defensePct: 0.08, damageReduction: 0.04 },
    '定海',
    '每 4 回合获得 22% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.22 },
    'waves'
  ),
  f(
    'af_youming',
    '幽冥幡',
    'mortal',
    9,
    '幡动之处,阴风怒号',
    { damageBonus: 0.06, lowHpDamage: 0.1 },
    '摄魂',
    '每 4 回合摄敌心魂,其攻击降低 25%',
    4,
    { type: 'weaken', pct: 0.25 },
    'ghost'
  ),
  f(
    'af_qianji',
    '千机伞',
    'mortal',
    10,
    '伞骨千机,开合皆杀阵',
    { dodgeRate: 0.05, defensePct: 0.06, shieldPower: 0.08 },
    '伞阵',
    '每 4 回合获得 26% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.26 },
    'umbrella'
  ),
  f(
    'af_zhenyue',
    '镇岳印',
    'mortal',
    11,
    '大印如山,落下时天地都沉了沉',
    { attackPct: 0.175 },
    '镇岳',
    '每 3 回合大印镇压,造成 340% 攻击伤害',
    3,
    { type: 'damage', mult: 3.4 },
    'stamp'
  ),
  f(
    'af_shehun',
    '摄魂铃',
    'mortal',
    12,
    '铃声入耳,神魂欲裂',
    { critDamage: 0.175 },
    '摄魂音',
    '每 4 回合铃音慑敌,其攻击降低 30%',
    4,
    { type: 'weaken', pct: 0.3 },
    'bell-ring'
  ),
  f(
    'af_xingpan',
    '周天星盘',
    'fine',
    13,
    '推演周天,窥探命数',
    { luck: 0.06, cultivationSpeed: 0.06, accuracy: 0.06 },
    '星辉',
    '每 4 回合引星辉入体,回复 24% 生命',
    4,
    { type: 'heal', pctMaxHp: 0.24 },
    'compass'
  ),
  f(
    'af_chixiao',
    '赤霄鼎',
    'fine',
    14,
    '鼎中可炼万物,亦可炼敌',
    { attackPct: 0.12, maxHpPct: 0.08 },
    '鼎炼',
    '每 3 回合鼎压四方,造成 380% 攻击伤害',
    3,
    { type: 'damage', mult: 3.8 },
    'soup'
  ),
  f(
    'af_bishui',
    '碧水珠',
    'fine',
    15,
    '珠内自有一方碧海',
    { maxHpPct: 0.216, qiRegen: 0.18 },
    '碧波',
    '每 4 回合碧波洗身,回复 28% 生命',
    4,
    { type: 'heal', pctMaxHp: 0.28 },
    'droplets'
  ),
  f(
    'af_jincheng',
    '金城罩',
    'fine',
    14,
    '罩下自成一座孤城',
    { defensePct: 0.26, damageReduction: 0.1 },
    '金城',
    '每 4 回合金城自守,获得 29% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.29 },
    'castle'
  ),
  f(
    'af_shiling',
    '噬灵幡',
    'fine',
    16,
    '幡面绣着无数张开的口',
    { damageBonus: 0.1, lifesteal: 0.04 },
    '噬灵',
    '每 3 回合幡卷灵力,造成 400% 攻击伤害',
    3,
    { type: 'damage', mult: 4.0 },
    'skull'
  ),
  f(
    'af_taixu',
    '太虚镜',
    'fine',
    17,
    '照见太虚,万法无所遁形',
    { defensePct: 0.216, damageReduction: 0.093 },
    '太虚照影',
    '每 4 回合获得 32% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.32 },
    'mirror-rectangular'
  ),
  f(
    'af_suohunfu',
    '锁魂符',
    'fine',
    18,
    '朱砂未干,符下之魂已不得动',
    { attackPct: 0.12, damageReduction: 0.08 },
    '锁魂',
    '每 4 回合符锁其魂,余下回合敌人攻击降低 29%',
    4,
    { type: 'weaken', pct: 0.29 },
    'link'
  ),
  f(
    'af_zhanxian',
    '斩仙飞刀',
    'fine',
    18,
    '刀光一线,仙人亦难幸免',
    { critRate: 0.06, critDamage: 0.25 },
    '斩仙',
    '每 3 回合飞刀取首,造成 460% 攻击伤害',
    3,
    { type: 'damage', mult: 4.6 },
    'slice'
  ),
  f(
    'af_lieyingzhua',
    '裂云爪',
    'spirit',
    24,
    '爪过之处,护体如纸',
    { armorPen: 0.04, attackPct: 0.02 },
    '裂影',
    '每 4 回合裂其护体,余下回合敌人防御降低 20%',
    4,
    { type: 'sunder', pct: 0.2 },
    'swords'
  ),
  f(
    'af_hundun',
    '混沌钟',
    'excellent',
    19,
    '钟声荡开,时光都慢了半拍',
    { attackPct: 0.127, defensePct: 0.127, maxHpPct: 0.127 },
    '混沌钟鸣',
    '每 3 回合钟镇万物,造成 500% 攻击伤害',
    3,
    { type: 'damage', mult: 5.0 },
    'bell'
  ),
  f(
    'af_yinshi',
    '月蚀匕',
    'excellent',
    19,
    '刃过无痕,只余一线月华',
    { attackPct: 0.04, lifesteal: 0.03 },
    '月蚀',
    '每 3 回合月华蚀骨,造成 150% 攻击伤害并回复其中 60%',
    3,
    { type: 'drain', mult: 1.5, healPct: 0.6 },
    'moon'
  ),
  f(
    'af_zaohua',
    '造化玉碟',
    'excellent',
    20,
    '记载造化至理的残碟',
    { cultivationSpeed: 0.225, breakthroughRate: 0.045, luck: 0.09 },
    '造化',
    '每 4 回合造化加身,回复 40% 生命',
    4,
    { type: 'heal', pctMaxHp: 0.4 },
    'disc'
  ),

  // ============ 仙界及以上法宝(tier 21+)============
  f(
    'af_xianding',
    '仙鼎',
    'excellent',
    23,
    '一鼎仙火不熄,药气缭绕可愈百伤',
    { maxHpPct: 0.18, qiRegen: 0.18 },
    '仙火回春',
    '每 4 回合仙火护主,回复 44% 生命',
    4,
    { type: 'heal', pctMaxHp: 0.44 },
    'beaker'
  ),
  f(
    'af_xianqin',
    '仙琴',
    'excellent',
    23,
    '琴音出则万籁寂,敌势为之一挫',
    { attackPct: 0.06, luck: 0.04 },
    '摄心',
    '每 4 回合琴音摄神,打断敌人这一手',
    4,
    { type: 'stun' },
    'music'
  ),
  f(
    'af_dinghunling',
    '玉魂铃',
    'excellent',
    23,
    '铃音一响,神思自归',
    { damageReduction: 0.04, maxHpPct: 0.05 },
    '定魂',
    '受慑时以五成概率当场挣脱,那一手照出',
    1,
    { type: 'purge', pct: 0.5 },
    'shield-check'
  ),
  f(
    'af_shenzhong',
    '神钟',
    'profound',
    28,
    '钟声一响,神域同震',
    { defensePct: 0.132, damageReduction: 0.076 },
    '神钟护体',
    '每 4 回合神钟自成壁垒,获得 27% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.27 },
    'bell-dot'
  ),
  f(
    'af_shenbian',
    '神鞭',
    'profound',
    28,
    '一鞭抽落星辰,余响三日不绝',
    { attackPct: 0.07, speed: 0.05 },
    '裂星',
    '每 4 回合挥鞭裂其护体,余下回合敌人防御降低 30%',
    4,
    { type: 'sunder', pct: 0.3 },
    'wand'
  ),
  f(
    'af_hundunfu',
    '混沌开天斧',
    'heaven',
    31,
    '天地未开,它便在此',
    { attackPct: 0.08, armorPen: 0.06 },
    '开天',
    '每 3 回合开天一击,造成 410% 攻击伤害',
    3,
    { type: 'damage', mult: 4.1 },
    'axe'
  ),
  f(
    'af_benyuanzhu',
    '本源珠',
    'earth',
    31,
    '珠中一界,自成生灭',
    { cultivationSpeed: 0.138, maxHpPct: 0.104 },
    '本源滋养',
    '每 4 回合本源涌动,回复 45% 生命',
    4,
    { type: 'heal', pctMaxHp: 0.45 },
    'gem'
  ),
  // 法宝位只有两个:每个界域须多于两件,否则没有取舍
  f(
    'af_xianjian',
    '青锋仙剑',
    'spirit',
    23,
    '剑光过处,仙庭无声',
    { attackPct: 0.142, critRate: 0.071 },
    '斩尘',
    '每 3 回合剑气纵横,造成 530% 攻击伤害',
    3,
    { type: 'damage', mult: 5.3 },
    'sword'
  ),
  f(
    'af_yunwen',
    '云纹仙印',
    'spirit',
    23,
    '印上云纹流动,身随云走',
    { speed: 0.073, dodgeRate: 0.059 },
    '云行',
    '每 4 回合踏云掠影,获得 29% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.29 },
    'wind'
  ),
  f(
    'af_zhenshen',
    '镇神印',
    'profound',
    28,
    '一印落下,神域皆静',
    { damageReduction: 0.05, maxHpPct: 0.07 },
    '镇神',
    '每 4 回合镇压四方,定住敌人这一手',
    4,
    { type: 'stun' },
    'badge'
  ),
  f(
    'af_shenlei',
    '神雷珠',
    'profound',
    28,
    '珠内藏一道不散的神雷',
    { attackPct: 0.127, damageBonus: 0.127 },
    '雷殛',
    '每 3 回合引雷加身,造成 510% 攻击伤害',
    3,
    { type: 'damage', mult: 5.1 },
    'zap'
  ),
  f(
    'af_qinglian',
    '混沌青莲',
    'earth',
    31,
    '莲开于混沌未判之时,不染不灭',
    { cultivationSpeed: 0.126, qiRegen: 0.126 },
    '莲开',
    '每 4 回合青莲护身,获得 27% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.27 },
    'flower'
  ),
  f(
    'af_xujiesuo',
    '虚界梭',
    'earth',
    31,
    '一梭穿虚,来去皆不留痕',
    { luck: 0.06, dropRate: 0.06, explorationSpeed: 0.06 },
    '虚空挪移',
    '每 4 回合挪移虚界,敌人伤害降低 24%',
    4,
    { type: 'weaken', pct: 0.24 },
    'move-3d'
  ),

  // ============ 仙界初段(21-25 阶)============
  f(
    'af_yunhai',
    '云海幡',
    'excellent',
    21,
    '幡一展,周身便是过仙门那一日的云海',
    { dodgeRate: 0.057, speed: 0.071 },
    '云障',
    '每 4 回合云海四合,获得 33% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.33 },
    'cloud'
  ),
  f(
    'af_xinggui',
    '星轨盘',
    'excellent',
    22,
    '盘上星轨自行转动,转一圈便是一劫',
    { accuracy: 0.063, critRate: 0.032 },
    '星陨',
    '每 3 回合引星陨落,造成 560% 攻击伤害',
    3,
    { type: 'damage', mult: 5.6 },
    'orbit'
  ),
  f(
    'af_xuanxu',
    '玄虚拂尘',
    'spirit',
    24,
    '拂尘一扬,纤尘不留',
    { attackPct: 0.06, damageBonus: 0.05 },
    '拂尘',
    '每 3 回合扫落敌人气机,造成 230% 攻击伤害并回复其中 60%',
    3,
    { type: 'drain', mult: 2.3, healPct: 0.6 },
    'brush'
  ),
  f(
    'af_yujingyin',
    '玉京道印',
    'spirit',
    25,
    '玉京山上的一枚旧印,落印处仙兵皆伏',
    { defensePct: 0.07, shieldPower: 0.08 },
    '玉京',
    '每 4 回合玉京垂护,敌人伤害降低 24%',
    4,
    { type: 'weaken', pct: 0.24 },
    'landmark'
  ),

  // ============ 神界初段(26-29 阶)============
  f(
    'af_shenyuling',
    '神域令旗',
    'spirit',
    26,
    '旗出,一方神域随之而动',
    { attackPct: 0.184, speed: 0.132 },
    '神域',
    '每 3 回合神域压落,造成 570% 攻击伤害',
    3,
    { type: 'damage', mult: 5.7 },
    'flag-triangle-right'
  ),
  f(
    'af_yunshengu',
    '陨神战鼓',
    'spirit',
    27,
    '鼓面蒙的是陨神之皮,一响便摄人心神',
    { damageBonus: 0.06, critDamage: 0.12 },
    '战鼓',
    '每 3 回合鼓声催战,造成 250% 攻击伤害并回复其中 50%',
    3,
    { type: 'drain', mult: 2.5, healPct: 0.5 },
    'drum'
  ),
  f(
    'af_wanshendeng',
    '万神灯',
    'profound',
    28,
    '灯里燃的是万神殿堂聚了万年的香火',
    { maxHpPct: 0.07, regenPerRound: 0.01 },
    '香火',
    '每 4 回合香火回照,回复 40% 生命',
    4,
    { type: 'heal', pctMaxHp: 0.4 },
    'lamp'
  ),
  f(
    'af_diquefu',
    '帝阙神符',
    'profound',
    29,
    '符上只有一个字,却是帝阙之下九千级天阶的凭据',
    { breakthroughRate: 0.123, luck: 0.145 },
    '帝威',
    '每 4 回合帝威加身,获得 29% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.29 },
    'scroll'
  ),
  f(
    'af_fentianji',
    '鸿蒙焚天戟',
    'heaven',
    31,
    '一戟落下,天火自九霄倾泻',
    { attackPct: 0.07, armorPen: 0.055 },
    '倾天',
    '每 3 回合天火倾泻,造成 420% 攻击伤害',
    3,
    { type: 'damage', mult: 4.2 },
    'flame'
  ),

  // ============ 混沌海(30-32 阶)============
  f(
    'af_zhenlingfan',
    '真灵幡',
    'earth',
    30,
    '幡上真灵浮沉,徘徊不去',
    { cultivationSpeed: 0.117, qiRegen: 0.134 },
    '真灵',
    '每 4 回合真灵回照,回复 42% 生命',
    4,
    { type: 'heal', pctMaxHp: 0.42 },
    'flag'
  ),
  f(
    'af_hongmengchi',
    '鸿蒙尺',
    'heaven',
    31,
    '一尺量的是天地未判时的长短',
    { armorPen: 0.06, damageBonus: 0.06 },
    '量天',
    '每 3 回合量其气机,余下回合敌人攻击降低 21%',
    3,
    { type: 'weaken', pct: 0.21 },
    'ruler'
  ),
  f(
    'af_zhenshenzhong',
    '镇神钟',
    'earth',
    30,
    '一撞之下,神魂俱寂',
    { maxHpPct: 0.07, damageReduction: 0.04 },
    '寂钟',
    '每 5 回合钟声寂神,打断敌人这一手',
    5,
    { type: 'stun' },
    'sun'
  ),
  f(
    'af_benyuanlian',
    '本源莲台',
    'immortal',
    32,
    '莲台托着一点本源,任劫火也烧不动',
    { defensePct: 0.104, damageReduction: 0.05 },
    '本源',
    '每 4 回合本源护持,获得 21% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.21 },
    'flower-2'
  ),
  f(
    'af_jiuxiao',
    '混沌垂云冠',
    'heaven',
    31,
    '戴之如承九天,伤重亦有云气来护',
    { maxHpPct: 0.06, damageReduction: 0.1 },
    '垂云',
    '每 4 回合垂云自护,回复 40% 生命',
    4,
    { type: 'heal', pctMaxHp: 0.4 },
    'crown'
  ),
  f(
    'af_shenmojing',
    '神魔镜',
    'divine',
    32,
    '镜里照出的是魔,镜外站着的是神',
    { accuracy: 0.06, damageBonus: 0.05 },
    '神魔',
    '每 3 回合神魔噬影,造成 260% 攻击伤害并回复其中 60%',
    3,
    { type: 'drain', mult: 2.6, healPct: 0.6 },
    'scan-eye'
  ),

  // 防身型:interval 记 1 表示随身常在,不是「每 N 回合出手」(见 combat.tryStun)
  f(
    'af_wuxiangzhu',
    '无相念珠',
    'earth',
    31,
    '一串旧念珠,已被摩得发亮',
    { damageReduction: 0.05, maxHpPct: 0.06 },
    '定念',
    '受慑时以七成概率当场挣脱,那一手照出',
    1,
    { type: 'purge', pct: 0.7 },
    'circle-dot-dashed'
  )
]

const BY_ID = new Map(ARTIFACTS.map(x => [x.id, x]))

export function artifactDef(id: string): ArtifactDef | undefined {
  return BY_ID.get(id)
}

/** 法宝每级对被动/主动数值的增幅 */
export const ARTIFACT_LEVEL_BONUS = 0.08
export const ARTIFACT_MAX_LEVEL = 9
export const ARTIFACT_UP_WUDAO_BASE = 6
export const ARTIFACT_UP_STONE_TIER = 40

/**
 * 单项效果的封顶,战斗与界面文案同读(见 artifactValue)。顶不随品阶浮动,品阶只改变多早到顶:
 * 高品阶件零重即可能在顶(无相念珠、神魔镜),之后祭炼只涨被动,不是漏乘。
 * 吸命回补 ≤ 打出的那一份、挣脱 ≤ 九成(不等于免疫)是规则;
 * 破甲 / 削弱 50% 是平衡顶,与玩家侧减伤同量级(damageReduction 软顶 0.55、硬顶 MITIGATION_CAP 0.75)。
 */
export const ARTIFACT_WEAKEN_CAP = 0.5
export const ARTIFACT_SUNDER_CAP = 0.5
export const ARTIFACT_PURGE_CAP = 0.9
export const ARTIFACT_DRAIN_HEAL_CAP = 1

/**
 * 品阶对法宝数值的放大指数:品质倍率(凡 1.0 → 神 9.5)开方成 1.0 → 3.08。
 * 与装备的 EQUIP_QUALITY_FLAT_EXP(1.8)刻意分开:法宝是第二来源,品阶不能盖过「越深的地界越强」这条主轴。
 */
export const ARTIFACT_QUALITY_EXP = 0.5

/** 品阶倍率(见 ARTIFACT_QUALITY_EXP) */
export function artifactQualityMult(quality: QualityId): number {
  return Math.pow(qualityDef(quality).mult, ARTIFACT_QUALITY_EXP)
}

/** 祭炼等级带来的效果倍率(越界等级钳回 0..上限) */
export function artifactLevelMult(level: number): number {
  const lv = Math.max(0, Math.min(ARTIFACT_MAX_LEVEL, Math.floor(level || 0)))
  return 1 + lv * ARTIFACT_LEVEL_BONUS
}

export interface ArtifactValue {
  /** 被动(凡品零重基线 × 品阶 × 祭炼) */
  passive: StatMods
  /** 神通(同一倍率,并含封顶) */
  active: ArtifactEffectValues
}

export interface ArtifactEffectValues {
  /** 主体数值(伤害倍率 / 生命百分比 / 削弱破甲比例,小数口径) */
  amount: number
  /** 吸命的回血比例(只有 drain 有) */
  heal?: number
}

/**
 * 法宝数值的唯一出口:基础值 × 品阶倍率(def.quality) × 祭炼倍率(level)。
 * 属性汇总、背包卡片、图鉴、战斗、构筑模拟同读这一份,别处不再自乘。
 */
export function artifactValue(def: ArtifactDef, level = 0): ArtifactValue {
  const mult = artifactQualityMult(def.quality) * artifactLevelMult(level)
  const passive: StatMods = {}
  for (const k in def.passive) {
    const key = k as keyof StatMods
    passive[key] = (def.passive[key] ?? 0) * mult
  }
  return { passive, active: effectValuesAt(def.active.effect, mult) }
}

/** 某倍率下神通真正生效的数值(含封顶),只由 artifactValue 调用 */
function effectValuesAt(eff: ArtifactEffect, mult: number): ArtifactEffectValues {
  switch (eff.type) {
    case 'damage':
      return { amount: eff.mult * mult }
    case 'drain':
      return { amount: eff.mult * mult, heal: Math.min(ARTIFACT_DRAIN_HEAL_CAP, eff.healPct * mult) }
    case 'heal':
      return { amount: eff.pctMaxHp * mult }
    // 护盾同受总盾上限约束(战斗侧 gainShield 钳在 SHIELD_CAP_RATIO);
    // 取默认上限而非各界 shieldCapRatio:那是战斗时的世界规则,法宝卡不知道玩家会进哪个世界
    case 'shield':
      return { amount: Math.min(SHIELD_CAP_RATIO, eff.pctMaxHp * mult) }
    case 'weaken':
      return { amount: Math.min(ARTIFACT_WEAKEN_CAP, eff.pct * mult) }
    case 'sunder':
      return { amount: Math.min(ARTIFACT_SUNDER_CAP, eff.pct * mult) }
    case 'purge':
      return { amount: Math.min(ARTIFACT_PURGE_CAP, eff.pct * mult) }
    case 'stun':
      // 震慑没有数值
      return { amount: 0 }
  }
}

/** 中文成数(净念说明写「七成」,缩放后按成数替换) */
const CHENG_WORDS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const

/**
 * 法宝神通在某祭炼等级下的说明:替换原说明里的数值,不另写模板。
 * 凡品零重时与原说明逐字相同(artifactEffects.spec 钉着,拿 desc 与 effect 对账)。
 */
export function artifactActiveText(def: ArtifactDef, level = 0): string {
  const values = artifactValue(def, level).active
  const eff = def.active.effect
  if (eff.type === 'stun') return def.active.desc
  if (eff.type === 'purge') {
    const cheng = CHENG_WORDS[Math.max(0, Math.min(CHENG_WORDS.length - 1, Math.round(values.amount * 10) - 1))]!
    return def.active.desc.replace(/[一二三四五六七八九十]成/, `${cheng}成`)
  }
  // 吸命有两个百分数(打出的、回补的)
  const pct = formatPercent(values.amount)
  let text = def.active.desc.replace(/(\d+(?:\.\d+)?)\s*%/, pct)
  if (eff.type === 'drain' && values.heal !== undefined) {
    text = text.replace(/(回复其中\s*)(\d+(?:\.\d+)?)\s*%/, `$1${formatPercent(values.heal)}`)
  }
  return text
}

/** 祭炼等级的说法用「重」;「阶」留给区域与装备层级 */
export function artifactLevelLabel(level: number): string {
  const lv = Math.max(0, Math.min(ARTIFACT_MAX_LEVEL, Math.floor(level || 0)))
  return `祭炼 ${lv}/${ARTIFACT_MAX_LEVEL} 重`
}

/** 某类效果的封顶(无封顶返回 undefined),须与 effectValuesAt 同一批常数 */
function effectCap(eff: ArtifactEffect): number | undefined {
  switch (eff.type) {
    case 'shield':
      return SHIELD_CAP_RATIO
    case 'weaken':
      return ARTIFACT_WEAKEN_CAP
    case 'sunder':
      return ARTIFACT_SUNDER_CAP
    case 'purge':
      return ARTIFACT_PURGE_CAP
    default:
      return undefined
  }
}

export interface ArtifactNextLevelGain {
  /** 目标重数(即 level + 1) */
  level: number
  /** 各被动项的现值 → 下一重值 */
  passive: { key: AnyStatKey; from: number; to: number }[]
  /** 神通主体数值;震慑为 null */
  active: { from: number; to: number; capped: boolean } | null
  /** 吸命的回补比例(只有吸命有) */
  heal?: { from: number; to: number; capped: boolean }
}

/** 祭炼到下一重的收益:被动逐项、神通主体、吸命回补,到顶的也标出;已满重返回 null */
export function artifactNextLevelGain(def: ArtifactDef, level = 0): ArtifactNextLevelGain | null {
  const lv = Math.max(0, Math.min(ARTIFACT_MAX_LEVEL, Math.floor(level || 0)))
  if (lv >= ARTIFACT_MAX_LEVEL) return null
  const next = lv + 1
  const now = artifactValue(def, lv)
  const later = artifactValue(def, next)
  const from = now.active
  const to = later.active
  const passive = Object.keys(def.passive).map(k => {
    const key = k as AnyStatKey
    return { key, from: now.passive[key] ?? 0, to: later.passive[key] ?? 0 }
  })
  const cap = effectCap(def.active.effect)
  return {
    level: next,
    passive,
    active:
      def.active.effect.type === 'stun'
        ? null
        : { from: from.amount, to: to.amount, capped: cap !== undefined && to.amount >= cap - 1e-9 },
    heal:
      to.heal === undefined
        ? undefined
        : { from: from.heal ?? 0, to: to.heal, capped: to.heal >= ARTIFACT_DRAIN_HEAL_CAP - 1e-9 }
  }
}

/** 法宝位:开局 1 位,元婴(第 3 大境界)起再开 1 位;界面槽位显示与切换构筑截断同读这一份 */
export const ARTIFACT_SLOT_UNLOCK_MAJOR = 3
export const ARTIFACT_MAX_SLOTS = 2

export function artifactSlotsFor(major: number): number {
  return major >= ARTIFACT_SLOT_UNLOCK_MAJOR ? ARTIFACT_MAX_SLOTS : 1
}

/**
 * 槽满时会被替下的法宝:最早祭炼的在前,替下判据与槽位排法同读这一份。
 * 报全部会让位的(列表可能超编:境界跌落、未经 sanitize);认不出的 id 不报;空数组表示放得下。
 */
export function artifactEvictedBy(equipped: readonly string[], maxSlots: number): string[] {
  if (!Number.isFinite(maxSlots)) return []
  const slots = Math.min(ARTIFACT_MAX_SLOTS, Math.floor(maxSlots))
  if (slots < 1) return []
  if (equipped.length < slots) return []
  return equipped.slice(0, equipped.length - slots + 1).filter(id => !!artifactDef(id))
}

/** 一格随身法宝的展示形状 */
export interface ArtifactSlotView {
  def: ArtifactDef
  level: number
}

/**
 * 祭炼位列表摊成逐格视图:按佩带顺序,不按品质(第一格即槽满时先让位的那件)。
 * 认不出或已不在库里的 id 跳过,空位补 `undefined`。
 */
export function artifactSlotViews(
  equipped: readonly string[],
  owned: readonly { defId: string; level: number }[],
  slots: number
): (ArtifactSlotView | undefined)[] {
  const count = Math.max(0, Math.min(ARTIFACT_MAX_SLOTS, Math.floor(slots) || 0))
  const byId = new Map(owned.map(a => [a.defId, a]))
  const views: (ArtifactSlotView | undefined)[] = []
  for (const id of equipped) {
    if (views.length >= count) break
    const def = artifactDef(id)
    const entry = byId.get(id)
    if (!def || !entry) continue
    views.push({ def, level: entry.level })
  }
  while (views.length < count) views.push(undefined)
  return views
}
