/**
 * 历练区域 —— 44 处,层级递进,击败首领解锁下一区域。
 *
 * 1-20 层属人间界(旧表原样保留);21 层起对应仙界/神界/混沌海(minRealm 9-20)。
 */
import type { RegionDef } from '@/types'

function r(
  id: string,
  name: string,
  tier: number,
  minRealm: number,
  danger: RegionDef['danger'],
  icon: string,
  desc: string,
  enemies: string[],
  boss: string,
  eventTags: string[],
  requireCleared?: string
): RegionDef {
  return { id, name, tier, minRealm, danger, icon, desc, enemies, boss, eventTags, requireCleared }
}

export const REGIONS: RegionDef[] = [
  r('qingyun', '青云山麓', 1, 0, 1, 'mountain', '云雾缭绕的山麓,是初入仙途者的试炼之地', ['e_wolf', 'e_boar'], 'e_wolfking', [
    'general',
    'mountain'
  ]),
  r(
    'luoxia',
    '落霞谷',
    2,
    0,
    1,
    'sunset',
    '每逢黄昏,满谷霞光如焚',
    ['e_sparrow', 'e_stoneape'],
    'e_python',
    ['general', 'mountain'],
    'qingyun'
  ),
  r(
    'heifeng',
    '黑风林',
    3,
    1,
    2,
    'trees',
    '林中黑风终年不散,吹人骨髓生寒',
    ['e_bwolf', 'e_vine'],
    'e_bwking',
    ['general', 'forest'],
    'luoxia'
  ),
  r(
    'hantan',
    '寒潭幽窟',
    4,
    1,
    2,
    'droplets',
    '幽潭之下别有洞天,寒气砭骨',
    ['e_snake', 'e_bat'],
    'e_icejiao',
    ['general', 'water'],
    'heifeng'
  ),
  r(
    'wanyao',
    '万妖林',
    5,
    1,
    2,
    'trees',
    '万妖聚居之地',
    ['e_fox', 'e_bear'],
    'e_forestlord',
    ['general', 'forest'],
    'hantan'
  ),
  r(
    'guzhanchang',
    '古战场遗迹',
    6,
    2,
    3,
    'sword',
    '上古大战的残迹,怨气凝而不散',
    ['e_soldier', 'e_knight'],
    'e_general',
    ['general', 'ruin'],
    'wanyao'
  ),
  r(
    'chiyan',
    '赤炎火域',
    7,
    2,
    3,
    'flame',
    '地火奔涌,寸草不生',
    ['e_firewolf', 'e_golem'],
    'e_firelord',
    ['general', 'fire'],
    'guzhanchang'
  ),
  r(
    'youminghai',
    '幽冥海',
    8,
    3,
    3,
    'waves',
    '海面漆黑如墨,不见天日',
    ['e_shark', 'e_corpse'],
    'e_seaking',
    ['general', 'water', 'dark'],
    'chiyan'
  ),
  r(
    'miwu',
    '迷雾沼泽',
    9,
    3,
    3,
    'cloud',
    '瘴雾弥漫,一步踏错便是万劫不复',
    ['e_pyth2', 'e_mud'],
    'e_poisonlord',
    ['general', 'forest'],
    'youminghai'
  ),
  r(
    'jianzhong',
    '剑冢',
    10,
    3,
    4,
    'sword',
    '埋葬万剑之地,剑气冲霄',
    ['e_swordpuppet', 'e_brokensword'],
    'e_swordlord',
    ['general', 'ruin', 'sword'],
    'miwu'
  ),
  r(
    'leize',
    '雷泽',
    11,
    4,
    4,
    'zap',
    '雷霆万年不歇,是炼体悟道的绝地',
    ['e_leijiao', 'e_zeagle'],
    'e_leidi',
    ['general', 'thunder'],
    'jianzhong'
  ),
  r(
    'kunlun',
    '昆仑雪岭',
    12,
    4,
    4,
    'mountain',
    '万古冰封的圣山,藏着上古秘辛',
    ['e_iceape', 'e_frostwolf'],
    'e_icefairy',
    ['general', 'mountain', 'ice'],
    'leize'
  ),
  r(
    'yaoting',
    '荒古妖庭',
    13,
    5,
    4,
    'crown',
    '妖族古庭的废墟,妖威犹存',
    ['e_guard', 'e_hydra'],
    'e_yaosheng',
    ['general', 'ruin'],
    'kunlun'
  ),
  r(
    'chensha',
    '沉沙古城',
    14,
    5,
    4,
    'castle',
    '黄沙之下,埋着一座千年古城',
    ['e_sandzombie', 'e_gargoyle'],
    'e_citylord',
    ['general', 'ruin'],
    'yaoting'
  ),
  r(
    'shenlou',
    '蜃楼幻海',
    15,
    6,
    5,
    'cloud',
    '真真幻幻,迷失其中者不知凡几',
    ['e_shen', 'e_rakshasa'],
    'e_shenlord',
    ['general', 'water'],
    'chensha'
  ),
  r('moyuan', '九幽魔渊', 16, 6, 5, 'skull', '深渊之下,魔气滔天', ['e_devil', 'e_demongen'], 'e_demonlord', ['general', 'dark'], 'shenlou'),
  r(
    'xingyun',
    '星陨荒原',
    17,
    7,
    5,
    'star',
    '星辰坠落之地,遍地陨铁星髓',
    ['e_starpuppet', 'e_ironmeteor'],
    'e_starbeast',
    ['general', 'sky'],
    'moyuan'
  ),
  r(
    'tianwaitian',
    '天外天',
    18,
    7,
    5,
    'cloud',
    '穿过天幕,方知天外有天',
    ['e_outsider', 'e_voidfish'],
    'e_voidgod',
    ['general', 'sky'],
    'xingyun'
  ),
  r(
    'xianfu',
    '仙人遗府',
    19,
    8,
    5,
    'castle',
    '陨落仙人的洞府,仙光犹在',
    ['e_xiangui', 'e_shilin'],
    'e_fuling',
    ['general', 'sky', 'ruin'],
    'tianwaitian'
  ),
  r(
    'hongmeng',
    '鸿蒙裂隙',
    20,
    8,
    5,
    'sparkles',
    '天地未开时的裂隙,万物之始',
    ['e_hmbeast', 'e_chaosshadow'],
    'e_hmdemon',
    ['general', 'sky'],
    'xianfu'
  ),
  // ============ 仙界(21-25 层,每层两处)============
  r('yunhai', '云海仙门', 21, 9, 5, 'cloud', '云海尽头,一道仙门巍然矗立,过此门者方称仙人', ['e_imm_guard', 'e_imm_crane'], 'e_imm_gate', ['general', 'sky', 'immortal'], 'hongmeng'),
  r('zhexian', '谪仙古渡', 21, 9, 5, 'droplets', '古渡无舟,只有被贬下界的仙人在此徘徊', ['e_banished', 'e_duchuan'], 'e_duweng', ['general', 'immortal'], 'yunhai'),
  r('yujing', '金阙玉京', 22, 10, 5, 'castle', '金阙千重,玉京巍峨,天兵列阵森然', ['e_imm_jade', 'e_imm_spear'], 'e_imm_general', ['general', 'sky', 'immortal'], 'zhexian'),
  r('xingyuntai', '星陨仙台', 22, 10, 5, 'star', '陨落的仙星堆积成台,台上紫气昼夜不散', ['e_meteorguard', 'e_ziqi'], 'e_xingtai', ['general', 'sky', 'immortal'], 'yujing'),
  r('yaochi', '瑶池仙苑', 23, 11, 5, 'leaf', '瑶池之畔仙桃垂枝,守苑仙兽蛰伏于花影之间', ['e_imm_fairy', 'e_imm_beast'], 'e_imm_queen', ['general', 'immortal'], 'xingyuntai'),
  r('jinyuan', '不朽金渊', 23, 11, 5, 'gem', '金气如海,号称不朽之物尽沉其中', ['e_goldbeast', 'e_ironbody'], 'e_jinyuanzhu', ['general', 'immortal'], 'yaochi'),
  r('leichi', '太乙雷池', 24, 12, 5, 'zap', '一池雷水亘古不涸,太乙仙光自池底冲天而起', ['e_tai_thunder', 'e_tai_light'], 'e_tai_zun', ['general', 'thunder', 'immortal'], 'jinyuan'),
  r('daochang', '玄机道场', 24, 12, 5, 'scroll', '残破的道场里机关仍在自转,道童仍在扫地', ['e_qitong', 'e_puppet'], 'e_daozun', ['general', 'immortal'], 'leichi'),
  r('daluotian', '大罗天阙', 25, 13, 5, 'star', '天阙悬于星河之上,星君执掌周天星斗', ['e_luo_star', 'e_luo_void'], 'e_luo_lord', ['general', 'sky', 'immortal'], 'daochang'),
  r('xinghai', '罗天星海', 25, 13, 5, 'sparkles', '每一粒星都是一位陨落星君的余烬', ['e_sealing', 'e_meteorbeast'], 'e_xinghaizhu', ['general', 'sky', 'immortal'], 'daluotian'),
  // ============ 神界(26-29 层,每层两处)============
  r('shenbian', '神域边陲', 26, 14, 5, 'shield', '法则紊乱,斥候与凶兽游弋其间', ['e_god_scout', 'e_god_beast'], 'e_god_border', ['general', 'god'], 'xinghai'),
  r('shenjihuang', '神迹荒原', 26, 14, 5, 'sparkles', '抬眼即是上古神明留下的手笔', ['e_miraclepuppet', 'e_wildbeast'], 'e_miraclekeeper', ['general', 'god'], 'shenbian'),
  r('shenbingguan', '神兵天关', 27, 15, 5, 'sword', '神兵列于天关,代天神将持戈而立', ['e_god_soldier', 'e_god_chariot'], 'e_god_general', ['general', 'god'], 'shenjihuang'),
  r('yunshenzhanchang', '陨神战场', 27, 15, 5, 'skull', '众神陨落之处,千百年后仍有战意翻涌', ['e_deadgod', 'e_wargod'], 'e_battlelord', ['general', 'god', 'dark'], 'shenbingguan'),
  r('shenwangdian', '神王圣殿', 28, 16, 5, 'crown', '圣殿神光普照,神官诵念法则之名', ['e_god_priest', 'e_god_light'], 'e_god_king', ['general', 'god'], 'yunshenzhanchang'),
  r('wanshendian', '万神殿堂', 28, 16, 5, 'gem', '一万尊神像并列成堂,脚下香火从未熄过', ['e_idol', 'e_hymn'], 'e_pantheonlord', ['general', 'god'], 'shenwangdian'),
  r('shendigong', '神帝天宫', 29, 17, 5, 'castle', '天宫之上,神帝垂目,法则化形为兽', ['e_god_guard', 'e_god_law'], 'e_god_emperor', ['general', 'god'], 'wanshendian'),
  r('diquetianjie', '帝阙天阶', 29, 17, 5, 'castle', '帝阙之下九千级天阶,一步一重神威压身', ['e_tianjiewei', 'e_royalseal'], 'e_tianjiekeeper', ['general', 'god'], 'shendigong'),
  // ============ 混沌海(30-32 层,每层两处)============
  r('hundunbin', '混沌之滨', 30, 18, 5, 'sparkles', '天地未分,一点真灵游走其间', ['e_chaos_wisp', 'e_chaos_beast'], 'e_chaos_lord', ['general', 'chaos'], 'diquetianjie'),
  r('youtan', '真灵幽滩', 30, 18, 5, 'droplets', '滩上真灵浮沉,徘徊不去', ['e_lingying', 'e_mudbeast'], 'e_youtanling', ['general', 'chaos'], 'hundunbin'),
  r('shenmoyuan', '神魔渊', 31, 19, 5, 'skull', '开天辟地的余威仍在此渊回荡', ['e_chaos_demon', 'e_chaos_void'], 'e_chaos_king', ['general', 'chaos', 'dark'], 'youtan'),
  r('guji', '神魔古祭', 31, 19, 5, 'skull', '一座比天地更早的古祭坛,祭的正是开天的那场厮杀', ['e_altar', 'e_riteshadow'], 'e_jitanlord', ['general', 'chaos', 'dark'], 'shenmoyuan'),
  r('hongmengbenyuan', '鸿蒙本源', 32, 20, 5, 'sparkles', '万道之源静悬于此,道祖一念可开天地', ['e_chaos_origin', 'e_chaos_shadow'], 'e_chaos_zu', ['general', 'chaos', 'sky'], 'guji'),
  r('wudaoya', '道祖悟道崖', 32, 20, 5, 'mountain', '传说混沌道祖曾在这面崖下坐了三万年,崖上字迹至今依稀', ['e_cliffshadow', 'e_wordbeast'], 'e_daoyalord', ['general', 'chaos'], 'hongmengbenyuan')
]

/** 人间界最高区域层级;其上的层级不进凡界路线池 */
export const MORTAL_TIER_MAX = 20

/** 该大境界能进入的最高区域层级(这一境装备/掉落/敌人的来源上限)。单一事实源:区域表本身,凡界内外一视同仁 */
export function maxTierForMajor(major: number): number {
  let best = 1
  for (const region of REGIONS) {
    if (region.minRealm <= major && region.tier > best) best = region.tier
  }
  return best
}

/** 凡界路线生成的素材池(只含人间界区域) */
export const MORTAL_REGIONS: RegionDef[] = REGIONS.filter(x => x.tier <= MORTAL_TIER_MAX)

const BY_ID = new Map(REGIONS.map(x => [x.id, x]))

export function regionDef(id: string): RegionDef | undefined {
  return BY_ID.get(id)
}

/**
 * 解锁链闭包:前置已靖的地界一律算已开放;已靖地界本身也算已发现。
 * 击败首领时的一次性解锁(见 exploration.clearRegionAndUnlockNext)对旧档开不出后加的下游(已靖首领不复现),须靠此闭包补齐。
 * 幂等;原表里不认识的历史 id 原样保留,新补的按数据表顺序接在后面。
 */
export function unlockClosure(unlocked: readonly string[], cleared: readonly string[]): string[] {
  const clearedSet = new Set(cleared)
  const open = new Set(unlocked)
  for (const id of cleared) open.add(id)
  // 只看前置靖没靖,开出来的地界不构成新的开锁条件,一趟扫完即可
  for (const r of REGIONS) {
    if (r.requireCleared && clearedSet.has(r.requireCleared)) open.add(r.id)
  }
  const out = [...new Set(unlocked)]
  for (const r of REGIONS) {
    if (open.has(r.id) && !out.includes(r.id)) out.push(r.id)
  }
  for (const id of cleared) {
    if (!out.includes(id)) out.push(id)
  }
  return out
}

export const DANGER_NAMES = ['', '平缓', '寻常', '凶险', '大凶', '绝地'] as const
