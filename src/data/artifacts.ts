/**
 * 法宝池 —— 45 件,拥有被动属性与自动触发的主动神通
 *
 * ## 数值写的是「凡品零重基线」,不是玩家会看到的数
 *
 * 每件的 passive / active.effect 是算式里的**第一个因子**,品阶与祭炼两条放大
 * 由 artifactValue 施加(见那里的注释)。所以写着 30% 的那一件,若它是仙品,
 * 玩家拿到手就是 ×2.61 之后的数 —— desc 与 effect 描述的是基线,不是面板。
 *
 * ## 品阶(quality)是稀缺标签,也是强度阶梯
 *
 * 品阶同时管两件事:掉落权重(core/loot.artifactDropWeight)与数值倍率
 * (artifactQualityMult)。故标签按 (fromTier 升,同阶内预算升) 排成一条**不降**的
 * 阶梯 —— 越深的地界越贵,同一阶之内预算大的更贵:
 *
 *   凡 12(t1-12)· 良 6(t13-18)· 精 6(t19-23)· 灵 6(t23-27)
 *   · 玄 6(t28-29)· 地 5(t30-31)· 天 2(t31)· 仙 1(t32)· 神 1(t32)
 *
 * 于是四个界域各有自己的那一段:人间界凡→精、仙界精/灵、神界灵、混沌海玄→神。
 *
 * ## 为什么凡品占着头十二阶
 *
 * 凡品是**基线档**:表里写的数就是它的零重值 —— 那十二件的力量由基准值自己逐级
 * 抬升(回血 12% → 削弱 30%),不需要品质再抬一层。从第十三阶起才用品阶表达稀缺。
 * 另有两条压力把这条曲线钉在这里(loot.spec 的「品阶阶梯」盯着它们):
 *
 *   一 神品要稀缺:它在每个界域的掉落池里都只占个位数百分比,否则「神品」二字
 *      没有信息量,挂在它上面的倍率也就失去了意义;
 *   二 池子仍要以近阶之物为主:掉落权重是「品质越差越常见」×「越贴近当前层级越重」。
 *      标签诚实化之后,人间界的旧物大批落在凡品上(权重 100,是神品的十三倍),
 *      故就近窗口也跟着收紧到「同阶 ×21」(见 loot.ARTIFACT_NEAR_BONUS)——
 *      两处一起调,「混沌海多半掉混沌海之物」才依旧成立。
 *
 * ## 封顶类效果:品阶买的是「更早到顶」,不是更高的顶
 *
 * 破甲/削弱有 50% 的顶、净念有九成的顶、吸命的回补不超过打出去的那一份 ——
 * 这几个顶是**规则与平衡边界**,不随品阶浮动(理由写在 ARTIFACT_WEAKEN_CAP 那一段)。
 * 于是高品阶的那几件零重就在顶:神鞭(玄品)破甲零重 50.2%、无相念珠(地品)净念
 * 零重 134% 被截到九成、神魔镜(神品)回补零重就吃满十成 —— 它们之后祭炼只涨被动。
 * 这不是漏乘:把无相念珠的标签压回凡品,它要炼到第 4 重才摸到九成。
 */
import type { AnyStatKey, ArtifactDef, ArtifactEffect, QualityId, StatMods } from '@/types'
import { formatPercent } from '@/utils/format'
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
    // 推演得见的,自然打得中 —— 这是本池里唯一带命中的法宝,专治幻影(见 SpecialKey accuracy)
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
    'af_zhanxian',
    '斩仙飞刀',
    'fine',
    18,
    '刀出请君入瓮,仙人亦难幸免',
    { critRate: 0.06, critDamage: 0.25 },
    '斩仙',
    '每 3 回合飞刀取首,造成 460% 攻击伤害',
    3,
    { type: 'damage', mult: 4.6 },
    'slice'
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
    '每 4 回合仙火护主,回复 40% 生命',
    4,
    { type: 'heal', pctMaxHp: 0.4 },
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
    'af_shenzhong',
    '神钟',
    'profound',
    28,
    '钟声一响,神域同震',
    { defensePct: 0.132, damageReduction: 0.076 },
    '神钟护体',
    '每 4 回合神钟自成壁垒,获得 23% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.23 },
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
    '一切尚未开始时,它便在此',
    { attackPct: 0.08, armorPen: 0.06 },
    '开天',
    '每 3 回合开天一击,造成 286% 攻击伤害',
    3,
    { type: 'damage', mult: 2.86 },
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
    '每 4 回合本源涌动,回复 27% 生命',
    4,
    { type: 'heal', pctMaxHp: 0.27 },
    'gem'
  ),
  // 高界补两件:法宝位只有两个,一个界域若只给两件,「带上就完事」——取舍就没有了
  f(
    'af_xianjian',
    '青锋仙剑',
    'spirit',
    23,
    '剑光过处,仙庭无声',
    { attackPct: 0.142, critRate: 0.071 },
    '斩尘',
    '每 3 回合剑气纵横,造成 440% 攻击伤害',
    3,
    { type: 'damage', mult: 4.4 },
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
    '每 4 回合踏云掠影,获得 26% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.26 },
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
    '每 3 回合引雷加身,造成 382% 攻击伤害',
    3,
    { type: 'damage', mult: 3.82 },
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
    '每 4 回合青莲护身,获得 21% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.21 },
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
    '每 4 回合挪移虚界,敌人伤害降低 20%',
    4,
    { type: 'weaken', pct: 0.2 },
    'move-3d'
  ),

  // ============ 仙界初段(21-25 阶)============
  // 与装备同一条理由:仙界原本四件法宝全在 23 阶,刚飞升的真仙一路上捡到的东西
  // 与「过仙门者方称仙人」毫无关系。此为仙界两端补上本界域的名目与手艺。
  f(
    'af_yunhai',
    '云海幡',
    'excellent',
    21,
    '幡一展,周身便是过仙门那一日的云海',
    { dodgeRate: 0.057, speed: 0.071 },
    '云障',
    '每 4 回合云海四合,获得 29% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.29 },
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
    '每 3 回合引星陨落,造成 500% 攻击伤害',
    3,
    { type: 'damage', mult: 5 },
    'orbit'
  ),
  f(
    'af_xuanxu',
    '玄虚拂尘',
    'spirit',
    24,
    '拂尘一扬,扫落的不只是尘',
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
    '每 4 回合玉京垂护,敌人伤害降低 21%',
    4,
    { type: 'weaken', pct: 0.21 },
    'landmark'
  ),

  // ============ 神界初段(26-29 阶)============
  f(
    'af_shenyuling',
    '神域令旗',
    'spirit',
    26,
    '旗出则一方神域随旗而动',
    { attackPct: 0.184, speed: 0.132 },
    '神域',
    '每 3 回合神域压落,造成 440% 攻击伤害',
    3,
    { type: 'damage', mult: 4.4 },
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
    '每 4 回合香火回照,回复 31% 生命',
    4,
    { type: 'heal', pctMaxHp: 0.31 },
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
    '每 4 回合帝威加身,获得 24% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.24 },
    'scroll'
  ),

  // ============ 混沌海(30-32 阶)============
  f(
    'af_zhenlingfan',
    '真灵幡',
    'earth',
    30,
    '幡上真灵浮沉,似是徘徊又似在守着什么',
    { cultivationSpeed: 0.117, qiRegen: 0.134 },
    '真灵',
    '每 4 回合真灵回照,回复 27% 生命',
    4,
    { type: 'heal', pctMaxHp: 0.27 },
    'flag'
  ),
  f(
    'af_hongmengchi',
    '鸿蒙尺',
    'heaven',
    31,
    '一尺量的是天地未判时的长短',
    { armorPen: 0.06, damageBonus: 0.06 },
    '开天',
    '每 3 回合开天一击,造成 290% 攻击伤害',
    3,
    { type: 'damage', mult: 2.9 },
    'ruler'
  ),
  f(
    'af_benyuanlian',
    '本源莲台',
    'immortal',
    32,
    '莲台托着一点本源,任劫火也烧不动',
    { defensePct: 0.104, damageReduction: 0.05 },
    '本源',
    '每 4 回合本源护持,获得 17% 生命护盾',
    4,
    { type: 'shield', pctMaxHp: 0.17 },
    'flower-2'
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

  /*
   * 第一件防身型法宝。
   *
   * 前面 32 件全在回答「我怎么打你」,没有一件回答「我扛得住你的阴招」。
   * 而震慑是玩家唯一无从招架的状态(十三种敌人会摄魂,中了就是白丢一回合),
   * 战后分析还会明说「N 个回合被震慑打断,节奏尽失」—— 报了病因,却无药可抓。
   * interval 记 1:它不是「每 N 回合出手」,而是随身常在(见 combat.tryStun)。
   */
  f(
    'af_wuxiangzhu',
    '无相念珠',
    'earth',
    31,
    '一串旧念珠,珠子已被摩得发亮',
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
 * 单项效果的封顶 —— 数值只写在这里,战斗与界面文案都读它。
 *
 * 从前这几个上限各写在 combat.ts 的分支里(0.5 / 0.9 / 1),而界面上的神通说明
 * 是**手写死的基线文案**:祭炼到九重时,战斗按 ×1.72 算,卡片上印的还是原来的数
 * (实测玄虚拂尘:说明「造成 230% 攻击伤害」,真打出去是 395.6%)。
 * 故把上限收成一份,由同一处给出「某等级下真正生效的数值」(见 artifactValue)。
 *
 * ## 顶是绝对的:品阶只改变「多早到顶」
 *
 * 两个顶是**规则**:回补不超过打出去的那一份(1.0)、挣脱概率最高九成
 * (「再高也不该等于免疫」)。规则不随品阶浮动 —— 一件地品的无相念珠零重就顶在
 * 九成(×1.92 之后的 134% 被截掉),神魔镜的回补零重就吃满十成。这不是漏乘:
 * 品阶买的是更早到顶(把念珠的标签压回凡品,它要炼到第 4 重才摸到九成)。
 *
 * 破甲/削弱的 50% 是**平衡顶**,不是规则:一个法宝位最多把敌手的护甲或攻势砍掉
 * 一半 —— 与修士自己的减伤带同一量级(玩家侧 damageReduction 软顶 0.55、
 * 硬顶 MITIGATION_CAP 0.75),再往上,一件法宝就把敌人变成木桩。故一样定死,
 * 也正因为定死,高品阶的破甲件零重就在顶上,祭炼只涨它的被动。
 */
export const ARTIFACT_WEAKEN_CAP = 0.5
export const ARTIFACT_SUNDER_CAP = 0.5
export const ARTIFACT_PURGE_CAP = 0.9
export const ARTIFACT_DRAIN_HEAL_CAP = 1

/**
 * 品阶对法宝数值的放大指数。
 *
 * 与装备那条(EQUIP_QUALITY_FLAT_EXP = 1.8)刻意分开:法宝只占两个槽位、是**第二来源**,
 * 同一条陡梯挂上去,「先看构筑、再攒一件好的」会变成「先看抽到几件神品」。
 * 0.5 的指数把品质倍率(凡 1.0 → 神 9.5)开方成 1.0 → 3.08:每高一档约 ×1.14,
 * 同一件法宝,神品约等于凡品的三个 —— 品阶拉开了台阶,却没盖过「越深的地界越强」这条主轴。
 */
export const ARTIFACT_QUALITY_EXP = 0.5

/** 品阶倍率(凡品 1.0 → 神品 ≈3.08;品质倍率的开方,见 ARTIFACT_QUALITY_EXP) */
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
 * 法宝数值的**唯一出口**:
 *
 *   基础值 × 品阶倍率(def.quality) × 祭炼倍率(level)
 *
 * 表里的 passive / active.effect 是**凡品零重基线** —— 算式里的第一个因子,
 * 不是玩家会看到的数(见文件头)。两条放大只在这里做一次:属性汇总、背包卡片、
 * 图鉴、战斗、构筑模拟读的都是这一份,谁也不会自己再乘一遍。
 *
 * 从前这两条乘法散在四处(属性汇总 store/inventory、背包卡片、图鉴、构筑模拟),
 * 谁改了增幅率都得改四回 —— 漏掉的那一处就会安静地说错话。
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

/**
 * 某倍率下神通**真正生效**的数值(含封顶)。
 *
 * 只有 artifactValue 会调它 —— 战斗与文案读同一份结果,「显示的数字」与
 * 「打出来的数字」不可能再分叉。
 */
function effectValuesAt(eff: ArtifactEffect, mult: number): ArtifactEffectValues {
  switch (eff.type) {
    case 'damage':
      return { amount: eff.mult * mult }
    case 'drain':
      return { amount: eff.mult * mult, heal: Math.min(ARTIFACT_DRAIN_HEAL_CAP, eff.healPct * mult) }
    case 'heal':
    case 'shield':
      return { amount: eff.pctMaxHp * mult }
    case 'weaken':
      return { amount: Math.min(ARTIFACT_WEAKEN_CAP, eff.pct * mult) }
    case 'sunder':
      return { amount: Math.min(ARTIFACT_SUNDER_CAP, eff.pct * mult) }
    case 'purge':
      return { amount: Math.min(ARTIFACT_PURGE_CAP, eff.pct * mult) }
    case 'stun':
      // 震慑没有数值 —— 它掐掉的是敌手那一手,不是打掉多少血
      return { amount: 0 }
  }
}

/** 中文成数(净念写的是「七成」而不是「70%」,缩放后得换同一个字的说法) */
const CHENG_WORDS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const

/**
 * 法宝神通在某祭炼等级下的说明。
 *
 * 做法是**把原说明里的数值换掉**,而不是另写一份模板:文案的措辞(「云海四合」
 * 「扫落敌人气机」)是手写的,只有数字会随品阶与祭炼变。**凡品零重**时结果与原
 * 说明逐字相同 —— 这条由 artifactEffects.spec 守着(它就是拿 desc 与 effect 对账的);
 * 品阶高于凡品的那几件,零重就与 desc 不同,那正是这套算法的意思。
 */
export function artifactActiveText(def: ArtifactDef, level = 0): string {
  const values = artifactValue(def, level).active
  const eff = def.active.effect
  if (eff.type === 'stun') return def.active.desc
  if (eff.type === 'purge') {
    const cheng = CHENG_WORDS[Math.max(0, Math.min(CHENG_WORDS.length - 1, Math.round(values.amount * 10) - 1))]!
    return def.active.desc.replace(/[一二三四五六七八九十]成/, `${cheng}成`)
  }
  // 主体数值:吸命有两个百分数(打出的、回补的),其余只有一个
  const pct = formatPercent(values.amount)
  let text = def.active.desc.replace(/(\d+(?:\.\d+)?)\s*%/, pct)
  if (eff.type === 'drain' && values.heal !== undefined) {
    text = text.replace(/(回复其中\s*)(\d+(?:\.\d+)?)\s*%/, `$1${formatPercent(values.heal)}`)
  }
  return text
}

/** 法宝祭炼等级的说法 —— 「阶」是区域层级与装备层级的词,这里另立一名免得两件事混作一件 */
export function artifactLevelLabel(level: number): string {
  const lv = Math.max(0, Math.min(ARTIFACT_MAX_LEVEL, Math.floor(level || 0)))
  return `祭炼 ${lv}/${ARTIFACT_MAX_LEVEL} 重`
}

/** 某类效果的封顶(没有封顶的返回 undefined)—— 与 effectValuesAt 用的是同一批常数 */
function effectCap(eff: ArtifactEffect): number | undefined {
  switch (eff.type) {
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
  /** 神通主体数值;震慑没有数值,故为 null */
  active: { from: number; to: number; capped: boolean } | null
  /** 吸命的回补比例(只有吸命有) */
  heal?: { from: number; to: number; capped: boolean }
}

/**
 * 祭炼到下一重,具体能多拿多少。
 *
 * 炼化按钮此前只报代价(悟道点 × 灵石),收益留给玩家自己按 ×1.08 心算 ——
 * 而「值不值」正是按下之前要想清楚的事。这里把下一重的账算好交给界面:
 * 被动逐项、神通主体、吸命的回补,顶上封顶的也标出来(再炼也不会更多了)。
 * 已至满重返回 null。
 */
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

/**
 * 法宝位:开局 1 位,元婴(第 3 大境界)起再开 1 位。
 *
 * 这条规则此前写在两处(界面的槽位显示、切换构筑时的截断),数字各写各的;
 * 界面还会把门槛写成「元婴境开启第二法宝位」——境界改名或门槛挪动,文案就撒谎。
 * 故门槛与上限一并放这里,两边都读同一份。
 */
export const ARTIFACT_SLOT_UNLOCK_MAJOR = 3
export const ARTIFACT_MAX_SLOTS = 2

/** 某大境界下可用几个法宝位 */
export function artifactSlotsFor(major: number): number {
  return major >= ARTIFACT_SLOT_UNLOCK_MAJOR ? ARTIFACT_MAX_SLOTS : 1
}
