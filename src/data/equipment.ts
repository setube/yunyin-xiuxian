/**
 * 装备模板池 —— 288 件,每一阶各有九件(九个部位各一件)。
 *
 * ## 一阶一名,名字与阶一一对应
 *
 * 从前这张表按部位分组、每件给一个「从本阶起现世」的门槛,掉落池则是**累积**的:
 * 13 阶的地界照样掉得出 8 阶的星辰冠。于是同一个名字会顶着不同的数字出现
 * (8 阶的星辰冠、13 阶的星辰冠),玩家分不清「这是同一件东西的不同成色」
 * 还是「两件不同的东西」——**名字失去了分辨力,数字成了唯一线索**。
 *
 * 现在反过来:**名字负责区分,数字只是让人看得更快的辅助**(与境界名「真仙」+
 * 数字「一层」的关系一样)。做法是两件事:
 *   一 每一阶各有九件,名字从该阶的地界长出来(见每阶的头注),不与他阶重名;
 *   二 掉落池按阶取(见 core/equipGen.templatesAtTier)—— 13 阶的地界只出 13 阶之物,
 *      所以「星辰冠」永远只可能是 8 阶,看到名字就知道是哪一阶的东西。
 *
 * 例外只有一处,且是有意的:**共鸣件的名字归它的共鸣组**,不归地界。
 * 铁壁组(玄铁重剑/玄铁冠/玄武甲)、星斗组(星辰冠/星罗法衣)本就跨着几阶成套,
 * 同组之间靠名字互认,比靠地界更重要 —— 玩家凑套时看的就是这层名分。
 * 除它们之外,人间界那批老名字也都按各自的地界重排过一遍(黑风剑、战痕刀、
 * 剑痕衣、雪岭长锋……),免得「霜」出现在黑风林、「星」落在幽冥海。
 *
 * ## 平铺基数:同一部位跨阶同形,成长交给层级曲线
 *
 * 每阶同部位的平铺基数刻意保持同一档(武器攻 20、衣袍防 14 血 62……),
 * 真正的成长由 core/formulas.powerScale(层级) 承担。人间界前段保留一条缓坡
 * (1 阶攻 10 → 20 阶攻 20),免得开局那几件彼此毫无差别;高界则一律与人间界顶配对齐——
 * 高界装备给的是**名目与机制**,不是同一层级下白送的一档数值。
 * 每件的差别写在 fixedMods 上:谁破甲、谁先手、谁护盾,带哪一件打法就跟着变。
 *
 * ## 套装
 *
 * 带 set 的仍是少数(见 core/equipSet):人间界两套(铁壁/星斗)、仙界起各一套。
 * 套装件散在相邻几阶,凑齐两件即触发共鸣。
 */
import type { EquipmentTemplate, EquipSlot, StatMods } from '@/types'

/**
 * 图标由名字挑,不再同槽清一色(玩家反馈:「武器都是剑、头冠都是王冠、衣物都是衬衫」)。
 *
 * 兵刃、头面、衣甲各有各的形状 —— 同槽一律默认剑/王冠/衬衫,看着就是复制粘贴。
 * 这里按名字里的字眼给更贴身的图标:甲铠是盾、头盔是盔、簪钗是光、刀剑是剑、
 * 衣袍还是衫。只补没显式指定的(defaultIcon 兜底),手挑过的(opts.icon)一家不动。
 *
 * 每个词条还带一个「只作用于哪个槽」的约束 —— 名字里的字眼不能抢别的槽的形状:
 * 「甲」只让衣袍成盾,不会把「魔渊腕甲」这类护腕也变成胸甲盾;
 * 「剑」只让兵刃成剑,不会把「剑痕衣」「剑魄坠」这些带剑字花样的一并变成一排剑
 * (10 阶剑冢整行全剑的教训)。
 */
const NAME_ICONS: [RegExp, string, EquipSlot][] = [
  [/斧|钺|戈/, 'axe', 'weapon'],
  [/锤/, 'hammer', 'weapon'],
  [/钩|爪/, 'anchor', 'weapon'],
  [/杖|杵|拂/, 'wand', 'weapon'],
  [/剑|刃|刀/, 'sword', 'weapon'],
  [/甲|铠/, 'shield', 'body'],
  [/盔/, 'hardhat', 'head'],
  [/簪|钗/, 'sparkles', 'head'],
  [/巾|纱/, 'cloud', 'head'],
  [/袍|衣|裳|衫/, 'shirt', 'body'],
  [/符|令/, 'scroll', 'talisman'],
  [/戒/, 'circle-dot', 'ring'],
  [/链|坠|珠/, 'gem', 'necklace'],
  [/镯/, 'link', 'belt'],
  [/靴|履|鞋/, 'footprints', 'boots']
]

function iconFromName(name: string, slot: EquipSlot, defaultIcon: Record<EquipSlot, string>): string {
  for (const [re, icon, targetSlot] of NAME_ICONS) {
    if (slot === targetSlot && re.test(name)) return icon
  }
  return defaultIcon[slot]
}

function t(
  id: string,
  name: string,
  slot: EquipSlot,
  tier: number,
  base: EquipmentTemplate['base'],
  desc: string,
  opts: { icon?: string; fixedMods?: StatMods; set?: string } = {}
): EquipmentTemplate {
  const defaultIcon: Record<EquipSlot, string> = {
    weapon: 'sword',
    head: 'crown',
    body: 'shirt',
    wrist: 'watch',
    belt: 'link',
    boots: 'footprints',
    necklace: 'gem',
    ring: 'circle-dot',
    artifact: 'sparkles',
    talisman: 'scroll'
  }
  return {
    id,
    name,
    slot,
    tier,
    base,
    desc,
    icon: opts.icon ?? iconFromName(name, slot, defaultIcon),
    fixedMods: opts.fixedMods,
    set: opts.set
  }
}

export const EQUIPMENT_TEMPLATES: EquipmentTemplate[] = [
  // ============ 人间界(1-20 阶)============

  // ---- 1 阶 · 青云山麓 ----
  t('w_zhuqing', '青竹剑', 'weapon', 1, { attack: 10 }, '山后砍来的竹子削成,胜在趁手'),
  t('h_muzan', '桃木簪', 'head', 1, { defense: 4, maxHp: 15 }, '一支素簪,聊胜于无'),
  t('b_mabu', '麻布道袍', 'body', 1, { defense: 7, maxHp: 30 }, '浆洗得发白的旧道袍'),
  t('wr_tengwen', '藤纹护腕', 'wrist', 1, { attack: 3, defense: 3 }, '古藤编织,韧性十足'),
  t('bl_cubu', '粗布腰带', 'belt', 1, { defense: 3, maxHp: 25 }, '寻常布带,束衣而已'),
  t('bo_caoxie', '芒鞋', 'boots', 1, { defense: 3, maxHp: 12 }, '踏遍青山人未老'),
  t('n_muzhu', '木珠串', 'necklace', 1, { maxHp: 20 }, '老山木所制念珠,凝神静气'),
  t('r_tongjie', '铜戒', 'ring', 1, { attack: 3 }, '不起眼的铜戒指'),
  t('tl_pingan', '平安符', 'talisman', 1, { maxHp: 15 }, '山下道观求来的平安符'),

  // ---- 2 阶 · 落霞谷 ----
  t('w_xuantie', '玄铁重剑', 'weapon', 2, { attack: 12 }, '玄铁铸就,大巧不工', { set: 's_tiebi' }),
  t('h_luoxiajin', '落霞巾', 'head', 2, { defense: 4, maxHp: 15 }, '晚霞染就的布巾,拢住散乱的发', {
    fixedMods: { qiRegen: 0.04 }
  }),
  t('b_xiawen', '霞纹道袍', 'body', 2, { defense: 7, maxHp: 30 }, '袍角绣着流霞,走动时像有光在淌', {
    fixedMods: { dodgeRate: 0.02 }
  }),
  t('wr_luoxiafu', '落霞腕缚', 'wrist', 2, { attack: 3, defense: 3 }, '缚腕的布条浸过霞光,出手带一线暖意', {
    fixedMods: { attackPct: 0.03 }
  }),
  t('bl_wanzhao', '晚照带', 'belt', 2, { defense: 3, maxHp: 25 }, '束腰的宽带,夕阳一照便泛红', { fixedMods: { maxHpPct: 0.03 } }),
  t('bo_taxia', '踏霞履', 'boots', 2, { defense: 3, maxHp: 12 }, '踩在霞上,一步一层暖光', { fixedMods: { speed: 0.05 } }),
  t('n_xiashi', '霞石坠', 'necklace', 2, { maxHp: 20 }, '一枚被霞光浸透的石头,暖手', { fixedMods: { maxHpPct: 0.03 } }),
  t('r_luoxiahuan', '落霞环', 'ring', 2, { attack: 3 }, '铜环上錾着一线霞纹', { fixedMods: { luck: 0.02 } }),
  t('tl_wanzhaofu', '晚照符', 'talisman', 2, { maxHp: 15 }, '日落时写的符,纸面还带着暖', { fixedMods: { regenPerRound: 0.01 } }),

  // ---- 3 阶 · 黑风林 ----
  t('w_qingshuang', '黑风剑', 'weapon', 3, { attack: 12 }, '林间黑风磨出来的剑,剑脊上刻着风纹'),
  t('h_heifengjin', '黑风巾', 'head', 3, { defense: 4, maxHp: 15 }, '蒙面的黑巾,挡风也挡刀', { fixedMods: { dodgeRate: 0.02 } }),
  t('b_qingyun', '风林道袍', 'body', 3, { defense: 8, maxHp: 36 }, '林子里织的青布道袍,耐得住黑风'),
  t('wr_fengteng', '风藤护腕', 'wrist', 3, { attack: 3, defense: 3 }, '林中老藤绞成,韧而不硬', { fixedMods: { counterRate: 0.04 } }),
  t('bl_heifengdai', '黑风束带', 'belt', 3, { defense: 3, maxHp: 25 }, '束带里编进了一缕黑风藤', { fixedMods: { defensePct: 0.03 } }),
  t('bo_linxing', '林行靴', 'boots', 3, { defense: 3, maxHp: 12 }, '软底靴,踩不响落叶', { fixedMods: { explorationSpeed: 0.05 } }),
  t('n_fengling', '风铃串', 'necklace', 3, { maxHp: 20 }, '穿林的铃声,据说惊得走小妖', { fixedMods: { eventLuck: 0.04 } }),
  t('r_heiteng', '黑藤戒', 'ring', 3, { attack: 3 }, '黑藤缠成的指环,越戴越亮', { fixedMods: { luck: 0.02 } }),
  t('tl_juqi', '聚风符', 'talisman', 3, { maxHp: 18 }, '符成引风,风过处气机自聚', { fixedMods: { qiRegen: 0.08 } }),

  // ---- 4 阶 · 寒潭幽窟 ----
  t('w_hanfeng', '寒锋剑', 'weapon', 4, { attack: 13, maxHp: 8 }, '剑出如霜,寒意逼人'),
  t('h_xuantie', '玄铁冠', 'head', 4, { defense: 5, maxHp: 20 }, '沉重却牢靠', { set: 's_tiebi' }),
  t('b_hantan', '寒潭甲', 'body', 4, { defense: 8, maxHp: 36 }, '潭底寒铁打的甲,入水不沉', { fixedMods: { defensePct: 0.03 } }),
  t('wr_shuangwen', '霜纹护腕', 'wrist', 4, { attack: 3, defense: 3 }, '腕上凝着霜纹,触之生寒', { fixedMods: { attackPct: 0.03 } }),
  t('bl_youtan', '幽潭带', 'belt', 4, { defense: 3, maxHp: 25 }, '带扣是一枚潭底石,凉意不散', { fixedMods: { maxHpPct: 0.03 } }),
  t('bo_kuaixue', '踏霜靴', 'boots', 4, { defense: 4, maxHp: 15 }, '靴底覆着一层薄霜,走在潭边不打滑', { fixedMods: { speed: 0.05 } }),
  t('n_lingyu', '寒玉坠', 'necklace', 4, { maxHp: 26 }, '潭底寒玉磨成的坠,贴身一片清凉', { fixedMods: { qiRegen: 0.05 } }),
  t('r_xuanguang', '潭光戒', 'ring', 4, { attack: 4 }, '戒面映着潭水的光,一晃一晃', { fixedMods: { luck: 0.02 } }),
  t('tl_ningshuang', '凝霜符', 'talisman', 4, { maxHp: 18 }, '符上霜花未化,贴身便觉凉爽', { fixedMods: { damageReduction: 0.03 } }),

  // ---- 5 阶 · 万妖林 ----
  t('w_yaogu', '妖骨长刀', 'weapon', 5, { attack: 13 }, '妖骨磨成的刀,刀口泛着骨白', {
    icon: 'axe',
    fixedMods: { critRate: 0.02 }
  }),
  t('h_yaoyu', '妖羽冠', 'head', 5, { defense: 5, maxHp: 20 }, '冠上插着一支妖鸟翎羽', { fixedMods: { critRate: 0.02 } }),
  t('b_yaopi', '妖皮软甲', 'body', 5, { defense: 8, maxHp: 36 }, '妖皮鞣的软甲,轻而有韧', { fixedMods: { dodgeRate: 0.02 } }),
  t('wr_tiebi', '妖筋护腕', 'wrist', 5, { attack: 4, defense: 4 }, '妖兽之筋缠成,越用力绷得越紧'),
  t('bl_shoupi', '兽皮腰带', 'belt', 5, { defense: 4, maxHp: 32 }, '妖兽之皮鞣制,坚韧异常'),
  t('bo_shouzong', '兽踪靴', 'boots', 5, { defense: 4, maxHp: 15 }, '靴底纹路照着妖兽脚印刻的', { fixedMods: { explorationSpeed: 0.06 } }),
  t('n_yaoya', '妖牙串', 'necklace', 5, { maxHp: 26 }, '一串妖兽牙齿,猎人挂在颈上', { fixedMods: { attackPct: 0.03 } }),
  t('r_shouya', '兽牙戒', 'ring', 5, { attack: 4 }, '兽牙磨成的戒指,据说避邪', { fixedMods: { critDamage: 0.06 } }),
  t('tl_quyao', '驱妖符', 'talisman', 5, { maxHp: 18 }, '朱砂画的驱妖纹,妖气近身自退', { fixedMods: { damageBonus: 0.03 } }),

  // ---- 6 阶 · 古战场遗迹 ----
  t('w_chiyan', '战痕刀', 'weapon', 6, { attack: 14 }, '缺口累累的刀,每一道痕都是一场仗', { icon: 'axe', fixedMods: { damageBonus: 0.04 } }),
  t('h_tieji', '铁脊冠', 'head', 6, { defense: 6, maxHp: 22 }, '铁脊锻成的冠,沉是沉了些,却压得住心神'),
  t('b_xuanwu', '玄武甲', 'body', 6, { defense: 10, maxHp: 42 }, '仿玄武之甲铸成,厚重难破', {
    fixedMods: { damageReduction: 0.04 },
    set: 's_tiebi'
  }),
  t('wr_canjia', '残甲护腕', 'wrist', 6, { attack: 4, defense: 4 }, '战场捡回的甲片重新铆成一幅护腕', {
    fixedMods: { counterRate: 0.05 }
  }),
  t('bl_bingge', '兵戈带', 'belt', 6, { defense: 4, maxHp: 32 }, '带扣是一枚旧箭镞', { fixedMods: { attackPct: 0.04 } }),
  t('bo_tazhen', '踏阵靴', 'boots', 6, { defense: 4, maxHp: 15 }, '踏过千军阵的硬底靴', { fixedMods: { firstStrike: 0.1 } }),
  t('n_zhanhun', '战魂坠', 'necklace', 6, { maxHp: 26 }, '一枚没写名字的军牌,夜里发凉', { fixedMods: { expGain: 0.04 } }),
  t('r_tiexue', '铁血戒', 'ring', 6, { attack: 4 }, '铁血沁进铜里,洗不掉', { fixedMods: { attackPct: 0.04 } }),
  t('tl_hushen', '战阵符', 'talisman', 6, { maxHp: 22, defense: 3 }, '老兵传下来的符,据说能挡一箭', { fixedMods: { shieldOnStart: 0.05 } }),

  // ---- 7 阶 · 赤炎火域 ----
  t('w_yanwen', '炎纹刀', 'weapon', 7, { attack: 14 }, '刀身缠着炎纹,越挥越烫', {
    icon: 'axe',
    fixedMods: { damageBonus: 0.04 }
  }),
  t('h_huowen', '火纹冠', 'head', 7, { defense: 6, maxHp: 22 }, '冠上的火纹经年不灭', { fixedMods: { attackPct: 0.04 } }),
  t('b_huohuan', '火浣袍', 'body', 7, { defense: 10, maxHp: 42 }, '火里洗过的布,不惧烈焰', { fixedMods: { damageReduction: 0.03 } }),
  t('wr_yantie', '炎铁护腕', 'wrist', 7, { attack: 4, defense: 4 }, '炎铁打成,烫手却趁手', { fixedMods: { attackPct: 0.04 } }),
  t('bl_chiyan', '赤炎带', 'belt', 7, { defense: 4, maxHp: 32 }, '带身赤红,像刚从炉里取出来', { fixedMods: { maxHpPct: 0.04 } }),
  t('bo_tahuo', '踏火履', 'boots', 7, { defense: 4, maxHp: 15 }, '踩着余烬走,鞋底不焦', { fixedMods: { speed: 0.05 } }),
  t('n_huosui', '火髓坠', 'necklace', 7, { maxHp: 26 }, '一滴火髓凝在石里,恒温不冷', { fixedMods: { qiRegen: 0.06 } }),
  t('r_juling', '炎心戒', 'ring', 7, { attack: 4, maxHp: 15 }, '戒里嵌着一粒火心,越戴越暖', { fixedMods: { cultivationSpeed: 0.04 } }),
  t('tl_bihuo', '避火符', 'talisman', 7, { maxHp: 22, defense: 3 }, '符上有水纹,火气难侵', { fixedMods: { damageReduction: 0.04 } }),

  // ---- 8 阶 · 幽冥海 ----
  t('w_youhai', '幽海钩', 'weapon', 8, { attack: 14 }, '海沟里捞起的弯钩,锈色发青', {
    icon: 'anchor',
    fixedMods: { lifesteal: 0.02 }
  }),
  t('h_xingchen', '星辰冠', 'head', 8, { defense: 6, maxHp: 24 }, '嵌有陨星碎屑,夜里微光流动', {
    fixedMods: { qiRegen: 0.06 },
    set: 's_xingdou'
  }),
  t('b_minghai', '冥海衣', 'body', 8, { defense: 10, maxHp: 42 }, '不知名的海兽皮缝成,腥气不散', { fixedMods: { maxHpPct: 0.05 } }),
  t('wr_youminghu', '幽冥护腕', 'wrist', 8, { attack: 4, defense: 4 }, '腕上缠着海藻编的绳与一线幽光', {
    fixedMods: { attackPct: 0.05 }
  }),
  t('bl_youchao', '幽潮带', 'belt', 8, { defense: 4, maxHp: 32 }, '带面会自己渗出潮气', { fixedMods: { qiRegen: 0.06 } }),
  t('bo_tayun', '踏浪靴', 'boots', 8, { defense: 5, maxHp: 18 }, '踏浪而行的靴,海水渗不进去', { fixedMods: { explorationSpeed: 0.06 } }),
  t('n_xingsui', '潮生珠链', 'necklace', 8, { maxHp: 32 }, '珠子随潮涨落明灭,像海在呼吸', { fixedMods: { cultivationSpeed: 0.05 } }),
  t('r_youmingjie', '幽冥戒', 'ring', 8, { attack: 4, maxHp: 15 }, '戴久了,指尖泛出一点青色', { fixedMods: { lifesteal: 0.02 } }),
  t('tl_zhenhai', '镇海符', 'talisman', 8, { maxHp: 22, defense: 3 }, '压住海中妖气的旧符', { fixedMods: { damageReduction: 0.04 } }),

  // ---- 9 阶 · 迷雾沼泽 ----
  t('w_zidian', '雾隐长枪', 'weapon', 9, { attack: 15 }, '枪身缠着湿漉漉的雾,出手无声', { icon: 'wand', fixedMods: { speed: 0.05 } }),
  t('h_miwu', '迷雾纱', 'head', 9, { defense: 6, maxHp: 24 }, '一层轻纱,遮得住脸遮不住雾', { fixedMods: { dodgeRate: 0.03 } }),
  t('b_zhaoze', '沼泽皮甲', 'body', 9, { defense: 10, maxHp: 42 }, '沼兽皮缝的甲,防潮', { fixedMods: { defensePct: 0.04 } }),
  t('wr_zhaoteng', '沼藤护腕', 'wrist', 9, { attack: 4, defense: 4 }, '沼藤编的护腕,湿了也不霉', { fixedMods: { counterRate: 0.05 } }),
  t('bl_nizhao', '泥沼带', 'belt', 9, { defense: 4, maxHp: 32 }, '带面染过沼泥,颜色暗沉', { fixedMods: { maxHpPct: 0.04 } }),
  t('bo_shezhao', '涉沼靴', 'boots', 9, { defense: 5, maxHp: 18 }, '过沼泽的靴子,泥里拔得出脚', { fixedMods: { explorationSpeed: 0.07 } }),
  t('n_wuzhu', '雾珠坠', 'necklace', 9, { maxHp: 32 }, '一颗雾气凝成的珠子,摸上去是凉的', { fixedMods: { dodgeRate: 0.03 } }),
  t('r_mizong', '迷踪戒', 'ring', 9, { attack: 4, maxHp: 15 }, '戴上后在雾里也认得出方向', { fixedMods: { luck: 0.03 } }),
  t('tl_wulei', '瘴雾符', 'talisman', 9, { maxHp: 25, attack: 3 }, '驱散沼中瘴气的旧符', { fixedMods: { damageBonus: 0.05 } }),

  // ---- 10 阶 · 剑冢 ----
  t('w_zhongjian', '冢中古剑', 'weapon', 10, { attack: 15 }, '剑冢里拔出来的一柄,剑格上还缠着旧布', {
    fixedMods: { critRate: 0.03 }
  }),
  t('h_jianwen', '剑纹冠', 'head', 10, { defense: 6, maxHp: 24 }, '冠上錾着剑纹,是剑冢的记号', { fixedMods: { attackPct: 0.04 } }),
  t('b_liuyun', '剑痕衣', 'body', 10, { defense: 11, maxHp: 48 }, '衣上满是细密剑痕,是剑冢里蹭出来的', { fixedMods: { dodgeRate: 0.03 } }),
  t('wr_longlin', '剑骨腕甲', 'wrist', 10, { attack: 5, defense: 5 }, '用剑冢里的旧剑骨束成,硬得硌手', { fixedMods: { counterRate: 0.05 } }),
  t('bl_mangwen', '残锋带', 'belt', 10, { defense: 5, maxHp: 40 }, '带扣是半截断剑的剑格', { fixedMods: { maxHpPct: 0.05 } }),
  t('bo_qingfeng', '踏冢靴', 'boots', 10, { defense: 5, maxHp: 20 }, '靴底沾着剑冢的铁锈色尘土', { fixedMods: { speed: 0.05 } }),
  t('n_yuehua', '剑魄坠', 'necklace', 10, { maxHp: 35 }, '一枚断剑的剑魄,夜里自己发冷光', { fixedMods: { qiRegen: 0.06 } }),
  t('r_zixia', '冢光戒', 'ring', 10, { attack: 5 }, '戒面泛着剑冢特有的幽蓝', { fixedMods: { critRate: 0.03 } }),
  t('tl_jianzhong', '剑冢符', 'talisman', 10, { maxHp: 25, attack: 3 }, '埋在剑冢多年的一枚护符', { fixedMods: { critDamage: 0.08 } }),

  // ---- 11 阶 · 雷泽 ----
  t('w_leizeqiang', '雷泽枪', 'weapon', 11, { attack: 15 }, '雷泽里淬过雷的长枪,枪尖有焦痕', {
    icon: 'wand',
    fixedMods: { speed: 0.05 }
  }),
  t('h_leiweng', '雷纹冠', 'head', 11, { defense: 6, maxHp: 24 }, '冠上雷纹一响,胆气就壮', { fixedMods: { breakthroughRate: 0.01 } }),
  t('b_leizezhi', '雷泽之袍', 'body', 11, { defense: 11, maxHp: 48 }, '袍上雷纹密布,雨落不沾', { fixedMods: { damageReduction: 0.04 } }),
  t('wr_yuleihu', '御雷护腕', 'wrist', 11, { attack: 5, defense: 5 }, '护腕里嵌着一截雷木', { fixedMods: { tribulationResist: 0.06 } }),
  t('bl_leizesuo', '雷泽索带', 'belt', 11, { defense: 5, maxHp: 40 }, '索带拧得紧,像一道雷绳', { fixedMods: { maxHpPct: 0.05 } }),
  t('bo_talei', '踏雷靴', 'boots', 11, { defense: 5, maxHp: 20 }, '踩过雷泽的靴,落地有微响', { fixedMods: { speed: 0.06 } }),
  t('n_leisui', '雷髓珠', 'necklace', 11, { maxHp: 35 }, '一枚雷髓凝珠,贴身时有麻意', { fixedMods: { qiRegen: 0.08 } }),
  t('r_leiyin', '雷引戒', 'ring', 11, { attack: 5 }, '引雷的戒指,雨天不敢戴', { fixedMods: { critRate: 0.03 } }),
  t('tl_leizefu', '雷泽符', 'talisman', 11, { maxHp: 25, attack: 3 }, '符纸上有雷纹,写符时纸都发烫', {
    fixedMods: { tribulationResist: 0.08 }
  }),

  // ---- 12 阶 · 昆仑雪岭 ----
  t('w_zhuxian', '雪岭长锋', 'weapon', 12, { attack: 17 }, '雪岭上磨出来的长锋,刃口冻着一线白', { fixedMods: { critRate: 0.04 } }),
  t('h_zijin', '紫雪冠', 'head', 12, { defense: 7, maxHp: 28 }, '冠上积着一层不化的紫雪', { fixedMods: { cultivationSpeed: 0.04 } }),
  t('b_xueling', '雪岭裘', 'body', 12, { defense: 11, maxHp: 48 }, '雪岭兽裘缝的道袍,暖而不重', { fixedMods: { maxHpPct: 0.05 } }),
  t('wr_xueling', '冰骨护腕', 'wrist', 12, { attack: 5, defense: 5 }, '雪兽骨裹着冰丝编成,冷得刺骨', { fixedMods: { defensePct: 0.04 } }),
  t('bl_kunlun', '昆仑带', 'belt', 12, { defense: 5, maxHp: 40 }, '昆仑石做的带扣,沉手', { fixedMods: { maxHpPct: 0.06 } }),
  t('bo_zhuixing', '踏雪履', 'boots', 12, { defense: 6, maxHp: 22 }, '履底不留脚印,雪上走过像没来过', { fixedMods: { speed: 0.06 } }),
  t('n_longhun', '冰髓坠', 'necklace', 12, { maxHp: 38, attack: 3 }, '一滴冰髓封在玉里,千年不化', { fixedMods: { attackPct: 0.04 } }),
  t('r_liuli', '寒魄戒', 'ring', 12, { attack: 6 }, '寒魄凝成的戒,戴上手指先凉一下', { fixedMods: { accuracy: 0.06 } }),
  t('tl_jinguang', '寒光符', 'talisman', 12, { maxHp: 30 }, '符上是雪岭的反光,看一眼都刺眼', { fixedMods: { damageReduction: 0.05 } }),

  // ---- 13 阶 · 荒古妖庭 ----
  t('w_yaoting', '妖庭戈', 'weapon', 13, { attack: 17 }, '荒古妖庭的仪戈,重得压手', {
    icon: 'axe',
    fixedMods: { armorPen: 0.05 }
  }),
  t('h_yaotingguan', '妖庭冠', 'head', 13, { defense: 7, maxHp: 28 }, '冠上雕着妖庭的图腾', { fixedMods: { attackPct: 0.05 } }),
  t('b_yaotingjia', '妖庭甲', 'body', 13, { defense: 11, maxHp: 48 }, '妖庭甲士的甲,一片压着一片', {
    fixedMods: { damageReduction: 0.05 }
  }),
  t('wr_jinwen', '荒骨护臂', 'wrist', 13, { attack: 5, defense: 5 }, '妖庭妖兽的骨磨成,护臂上有年轮似的纹', { fixedMods: { attackPct: 0.04 } }),
  t('bl_hujin', '虎筋腰带', 'belt', 13, { defense: 5, maxHp: 42 }, '虎妖之筋绞成,束上时腰背自生一股力'),
  t('bo_yaoting', '妖庭战靴', 'boots', 13, { defense: 6, maxHp: 22 }, '踏过妖庭石阶的战靴', { fixedMods: { attackPct: 0.05 } }),
  t('n_yaoting', '妖庭骨串', 'necklace', 13, { maxHp: 38 }, '妖庭祭司的骨串', { fixedMods: { lifesteal: 0.02 } }),
  t('r_yaoting', '妖庭环', 'ring', 13, { attack: 6 }, '妖庭的权环,内壁刻满细纹', { fixedMods: { luck: 0.04 } }),
  t('tl_yaoting', '妖庭符', 'talisman', 13, { maxHp: 30 }, '妖庭的旧符,朱砂是拿妖血调的', { fixedMods: { eventLuck: 0.08 } }),

  // ---- 14 阶 · 沉沙古城 ----
  t('w_chensha', '沉沙剑', 'weapon', 14, { attack: 17 }, '从沙底挖出的剑,剑鞘早烂了', { fixedMods: { critRate: 0.03 } }),
  t('h_gucheng', '古城冠', 'head', 14, { defense: 7, maxHp: 28 }, '古城王的冠,金子掺了沙', { fixedMods: { breakthroughRate: 0.015 } }),
  t('b_xingluo', '星罗法衣', 'body', 14, { defense: 12, maxHp: 55 }, '衣上星图与周天同转', { fixedMods: { qiRegen: 0.08 }, set: 's_xingdou' }),
  t('wr_shawen', '沙纹护腕', 'wrist', 14, { attack: 5, defense: 5 }, '沙纹护腕,沙粒钻不进去', { fixedMods: { counterRate: 0.05 } }),
  t('bl_gusha', '古沙带', 'belt', 14, { defense: 5, maxHp: 42 }, '带里缝着一层细沙,据说是古城的土', { fixedMods: { maxHpPct: 0.06 } }),
  t('bo_tasha', '踏沙靴', 'boots', 14, { defense: 6, maxHp: 22 }, '走过流沙的靴,脚下扎实', { fixedMods: { explorationSpeed: 0.08 } }),
  t('n_chensha', '沉沙坠', 'necklace', 14, { maxHp: 38 }, '坠子里的沙一直在慢慢下沉', { fixedMods: { qiRegen: 0.08 } }),
  t('r_qianji', '千机戒', 'ring', 14, { attack: 6, defense: 3 }, '千机暗藏,变化无穷', { fixedMods: { dropRate: 0.06 } }),
  t('tl_gucheng', '古城符', 'talisman', 14, { maxHp: 30 }, '古城墙缝里抠出来的一枚旧符', { fixedMods: { damageReduction: 0.05 } }),

  // ---- 15 阶 · 蜃楼幻海 ----
  t('w_shishen', '蜃影戟', 'weapon', 15, { attack: 18, maxHp: 15 }, '戟身随光变形,远看像另一件兵器', { icon: 'axe', fixedMods: { armorPen: 0.06 } }),
  t('h_shenguang', '蜃光冠', 'head', 15, { defense: 7, maxHp: 28 }, '冠上时有幻影流转,看着晃眼', { fixedMods: { accuracy: 0.04 } }),
  t('b_shenying', '蜃影衣', 'body', 15, { defense: 12, maxHp: 55 }, '衣色随光而变,远远看去像没人', { fixedMods: { dodgeRate: 0.04 } }),
  t('wr_xianjin', '海市护臂', 'wrist', 15, { attack: 6, defense: 6 }, '护臂上浮着一座海市,一晃就散', { fixedMods: { attackPct: 0.05 } }),
  t('bl_qiankun', '幻潮绦', 'belt', 15, { defense: 6, maxHp: 46 }, '绦上有潮声,系上便听见海', { fixedMods: { shieldOnStart: 0.06 } }),
  t('bo_taxu', '踏虚履', 'boots', 15, { defense: 6, maxHp: 22 }, '踩在蜃楼上,虚实难分', { fixedMods: { speed: 0.06 } }),
  t('n_shenzhu', '蜃珠坠', 'necklace', 15, { maxHp: 38 }, '珠里映着一座不存在的城', { fixedMods: { eventLuck: 0.08 } }),
  t('r_huanhai', '幻海戒', 'ring', 15, { attack: 6, defense: 3 }, '戴上看东西会慢半拍', { fixedMods: { accuracy: 0.05 } }),
  t('tl_taiyi', '幻海符', 'talisman', 15, { maxHp: 35 }, '符上画的是海市,看久了会走神', { fixedMods: { regenPerRound: 0.015 } }),

  // ---- 16 阶 · 九幽魔渊 ----
  t('w_jiuyou', '九幽魔刀', 'weapon', 16, { attack: 18 }, '魔渊里浸过的刀,刀身不反光', {
    icon: 'axe',
    fixedMods: { executeDamage: 0.1 }
  }),
  t('h_jiuxiao', '幽霄冠', 'head', 16, { defense: 8, maxHp: 32 }, '冠上刻着九幽的阶次,越往上看越黑', { fixedMods: { breakthroughRate: 0.02 } }),
  t('b_moyuan', '魔渊甲', 'body', 16, { defense: 12, maxHp: 55 }, '魔渊玄铁打的甲,冷得刺骨', { fixedMods: { damageReduction: 0.06 } }),
  t('wr_moyuan', '魔渊腕甲', 'wrist', 16, { attack: 6, defense: 6 }, '腕甲上刻着镇压的铭文', { fixedMods: { attackPct: 0.06 } }),
  t('bl_jiuyou', '九幽束', 'belt', 16, { defense: 6, maxHp: 46 }, '束带上缠着一缕魔气,系着便不散', { fixedMods: { lifesteal: 0.03 } }),
  t('bo_xukong', '踏幽步靴', 'boots', 16, { defense: 7, maxHp: 26 }, '踏幽而入,靴底不沾尘土', { fixedMods: { dodgeRate: 0.05 } }),
  t('n_hunyuan', '魔渊珠链', 'necklace', 16, { maxHp: 45 }, '珠子取自魔渊深处,黑得吸光', { fixedMods: { damageReduction: 0.05 } }),
  t('r_moyuan', '魔渊戒', 'ring', 16, { attack: 6, defense: 3 }, '戒面是一块魔渊黑晶', { fixedMods: { critDamage: 0.1 } }),
  t('tl_zhenmo', '镇魔符', 'talisman', 16, { maxHp: 35 }, '镇魔的旧符,符角已经卷了', { fixedMods: { lowHpDamage: 0.12 } }),

  // ---- 17 阶 · 星陨荒原 ----
  t('w_xingyun', '星陨枪', 'weapon', 17, { attack: 18 }, '枪尖嵌着陨铁,挥动时带星痕', {
    icon: 'wand',
    fixedMods: { speed: 0.06 }
  }),
  t('h_xingyun', '星陨冠', 'head', 17, { defense: 8, maxHp: 32 }, '冠上嵌满陨星碎屑', { fixedMods: { cultivationSpeed: 0.06 } }),
  t('b_yuntie', '陨铁甲', 'body', 17, { defense: 12, maxHp: 55 }, '陨铁打的甲,分量压人', { fixedMods: { defensePct: 0.06 } }),
  t('wr_yuntie', '陨铁护腕', 'wrist', 17, { attack: 6, defense: 6 }, '陨铁护腕上留着烧灼的纹', { fixedMods: { attackPct: 0.06 } }),
  t('bl_xingyun', '星陨带', 'belt', 17, { defense: 6, maxHp: 46 }, '带扣是整块陨石磨的', { fixedMods: { maxHpPct: 0.07 } }),
  t('bo_yunxing', '陨行靴', 'boots', 17, { defense: 7, maxHp: 26 }, '踏在荒原上,落地有声', { fixedMods: { attackPct: 0.06 } }),
  t('n_yunxingzhu', '陨星坠', 'necklace', 17, { maxHp: 45 }, '坠子里封着一粒还温的星尘', { fixedMods: { qiRegen: 0.1 } }),
  t('r_yuntie', '陨铁戒', 'ring', 17, { attack: 6, defense: 3 }, '陨铁戒,越戴越亮', { fixedMods: { critRate: 0.04 } }),
  t('tl_xingyun', '星陨符', 'talisman', 17, { maxHp: 35 }, '符上画着一条下坠的星轨', { fixedMods: { breakthroughRate: 0.02 } }),

  // ---- 18 阶 · 天外天 ----
  t('w_hongmeng', '鸿蒙剑', 'weapon', 18, { attack: 20 }, '开天辟地之气所化,剑意通神', { fixedMods: { damageBonus: 0.1 } }),
  t('h_tianwai', '天外冠', 'head', 18, { defense: 8, maxHp: 32 }, '天外之冠,戴之如置身星海', { fixedMods: { cultivationSpeed: 0.07 } }),
  t('b_zifu', '紫府道衣', 'body', 18, { defense: 14, maxHp: 62 }, '无形无相,劫火难焚', { fixedMods: { damageReduction: 0.08 } }),
  t('wr_tianwai', '天外护臂', 'wrist', 18, { attack: 6, defense: 6 }, '护臂上一道道云纹,像天外的风', { fixedMods: { attackPct: 0.06 } }),
  t('bl_tianwai', '天外绦', 'belt', 18, { defense: 6, maxHp: 46 }, '系上它,心里就静', { fixedMods: { maxHpPct: 0.07 } }),
  t('bo_tianwai', '天外履', 'boots', 18, { defense: 7, maxHp: 26 }, '履下无尘,像踩在云底', { fixedMods: { dodgeRate: 0.05 } }),
  t('n_tianwai', '天外坠', 'necklace', 18, { maxHp: 45 }, '坠子望进去是一整片天', { fixedMods: { qiRegen: 0.12 } }),
  t('r_xuanyuan', '玄元戒', 'ring', 18, { attack: 7, maxHp: 20 }, '古修随手所铸,指间长留一线真元', { fixedMods: { breakthroughRate: 0.03 } }),
  t('tl_dadao', '大道符', 'talisman', 18, { maxHp: 40 }, '符纹即道纹,观之可悟道', { fixedMods: { cultivationSpeed: 0.08 } }),

  // ---- 19 阶 · 仙人遗府 ----
  t('w_yifu', '遗府剑', 'weapon', 19, { attack: 20 }, '仙人遗府里取出的剑,剑上无尘', { fixedMods: { damageBonus: 0.08 } }),
  t('h_yifu', '遗府冠', 'head', 19, { defense: 8, maxHp: 32 }, '仙人的旧冠,轻得像没有', { fixedMods: { cultivationSpeed: 0.07 } }),
  t('b_yifu', '遗府仙袍', 'body', 19, { defense: 14, maxHp: 62 }, '遗府衣架上挂着的一件', { fixedMods: { dodgeRate: 0.05 } }),
  t('wr_yifu', '遗府腕甲', 'wrist', 19, { attack: 6, defense: 6 }, '腕甲内侧刻着仙篆', { fixedMods: { attackPct: 0.06 } }),
  t('bl_yifu', '遗府绦', 'belt', 19, { defense: 6, maxHp: 46 }, '绦带上串着几枚仙玉', { fixedMods: { maxHpPct: 0.08 } }),
  t('bo_yifu', '遗府履', 'boots', 19, { defense: 7, maxHp: 26 }, '履面不染一点灰', { fixedMods: { speed: 0.07 } }),
  t('n_yifu', '遗府玉坠', 'necklace', 19, { maxHp: 45 }, '一枚温润的旧玉,握着安心', { fixedMods: { qiRegen: 0.12 } }),
  t('r_yifu', '遗府仙戒', 'ring', 19, { attack: 7, maxHp: 20 }, '仙人的指环,内圈磨得发亮', { fixedMods: { luck: 0.06 } }),
  t('tl_yifu', '遗府符', 'talisman', 19, { maxHp: 40 }, '符还在,只是画符的人早已不在', { fixedMods: { breakthroughRate: 0.02 } }),

  // ---- 20 阶 · 鸿蒙裂隙 ----
  t('w_jiujie', '九劫剑', 'weapon', 20, { attack: 20 }, '历九重雷劫而不损,剑脊上犹有焦痕', { fixedMods: { armorPen: 0.06 } }),
  t('h_zichen', '紫宸冠', 'head', 20, { defense: 8, maxHp: 32 }, '冠上紫气如宸极不动,渡劫者赖以镇道心', {
    fixedMods: { breakthroughRate: 0.02 }
  }),
  t('b_taiqing', '太清法衣', 'body', 20, { defense: 14, maxHp: 62 }, '一袭素白,雷火过处只落下一层薄灰', { fixedMods: { maxHpPct: 0.06 } }),
  t('wr_jieyun', '劫云护腕', 'wrist', 20, { attack: 6, defense: 6 }, '腕上纹路如劫云翻涌,雷气近身便散', { fixedMods: { tribulationResist: 0.08 } }),
  t('bl_yunlei', '云雷绦', 'belt', 20, { defense: 6, maxHp: 46 }, '绦上云雷相逐,一系便有一层薄罡护身', { fixedMods: { shieldOnStart: 0.08 } }),
  t('bo_lingxu', '凌虚靴', 'boots', 20, { defense: 7, maxHp: 26 }, '鞋底薄如蝉翼,踏地却不着尘', { fixedMods: { dodgeRate: 0.05 } }),
  t('n_jiuzhuan', '九转珠', 'necklace', 20, { maxHp: 45 }, '九颗珠子串成一串,转动时气机自循', { fixedMods: { cultivationSpeed: 0.07 } }),
  t('r_ziyuan', '紫垣戒', 'ring', 20, { attack: 7, maxHp: 20 }, '戒面刻紫微垣星图,握之如握一线命数', { fixedMods: { luck: 0.05 } }),
  t('tl_yulei', '御雷符', 'talisman', 20, { maxHp: 40 }, '朱砂画的是雷部讳字,佩之则雷劫减三分', { fixedMods: { tribulationResist: 0.1 } }),

  // ============ 仙界(21-25 阶)============
  // 名字一律带本界印记(仙/云/玉/瑶/星/虚/太/罗/雷,见 core/realmNaming.spec)

  // ---- 21 阶 · 云海仙门 / 谪仙古渡 ----
  t('w_yunhan', '云汉剑', 'weapon', 21, { attack: 20 }, '飞升那夜云汉倒悬,剑气自天河而落', { fixedMods: { damageBonus: 0.09 } }),
  t('h_qiyun', '栖云冠', 'head', 21, { defense: 8, maxHp: 32 }, '冠中栖着一缕云气,神思历久不散', { fixedMods: { cultivationSpeed: 0.05 } }),
  t('b_nishang', '霓裳仙衣', 'body', 21, { defense: 14, maxHp: 62 }, '云霞织成,凡尘留下的焦痕自行褪去', { fixedMods: { dodgeRate: 0.04 } }),
  t('wr_yunying', '云英护腕', 'wrist', 21, { attack: 6, defense: 6 }, '腕上云英相击,出招先闻仙音', { fixedMods: { speed: 0.05 } }),
  t('bl_qingyun', '青云仙绦', 'belt', 21, { defense: 6, maxHp: 46 }, '一绦青气,系住初飞升时不肯散的道基', { fixedMods: { maxHpPct: 0.05 } }),
  t('bt_yunyou', '云游履', 'boots', 21, { defense: 7, maxHp: 26 }, '履下云生,行止皆随心意', { fixedMods: { explorationSpeed: 0.12 } }),
  t('n_yaochi', '瑶池玉坠', 'necklace', 21, { maxHp: 45 }, '瑶池水磨出的一枚玉,佩之如饮甘露', { fixedMods: { qiRegen: 0.1 } }),
  t('r_xingshu', '星枢戒', 'ring', 21, { attack: 7, maxHp: 20 }, '星枢一转,凶吉先知', { fixedMods: { luck: 0.06 } }),
  t('tl_guoguan', '过关仙篆', 'talisman', 21, { maxHp: 40 }, '篆上是仙门的通关字样,过此门者方称仙人', { fixedMods: { breakthroughRate: 0.03 } }),

  // ---- 22 阶 · 金阙玉京 / 星陨仙台 ----
  t('w_yujing', '玉京剑', 'weapon', 22, { attack: 20 }, '玉京天兵所佩,剑光冷白', { fixedMods: { damageBonus: 0.09 } }),
  t('h_yuque', '玉阙冠', 'head', 22, { defense: 8, maxHp: 32 }, '金阙里颁下的冠,规矩森严', { fixedMods: { damageReduction: 0.04 } }),
  t('b_xingyunxian', '星陨仙甲', 'body', 22, { defense: 14, maxHp: 62 }, '金阙天兵的甲,一片玉一片金', { fixedMods: { defensePct: 0.08 } }),
  t('wr_yujing', '玉京腕甲', 'wrist', 22, { attack: 6, defense: 6 }, '腕甲上錾着天兵的番号', { fixedMods: { attackPct: 0.06 } }),
  t('bl_xingyundai', '星陨玉带', 'belt', 22, { defense: 6, maxHp: 46 }, '玉带一系,气度自生', { fixedMods: { maxHpPct: 0.07 } }),
  t('bo_yujing', '玉京履', 'boots', 22, { defense: 7, maxHp: 26 }, '踏过玉京长阶的履', { fixedMods: { speed: 0.07 } }),
  t('n_xingtai', '星台坠', 'necklace', 22, { maxHp: 45 }, '仙台上拾的一枚陨星核', { fixedMods: { qiRegen: 0.12 } }),
  t('r_yujing', '玉京戒', 'ring', 22, { attack: 7, maxHp: 20 }, '戒面刻着玉京的方位', { fixedMods: { critRate: 0.04 } }),
  t('tl_xingtai', '星台篆', 'talisman', 22, { maxHp: 40 }, '仙台上悬着的一道旧篆', { fixedMods: { breakthroughRate: 0.03 } }),

  // ---- 23 阶 · 瑶池仙苑 / 不朽金渊 ----
  t('w_xianjun', '仙钧剑', 'weapon', 23, { attack: 20 }, '仙钧之气所铸,一剑分阴阳', { fixedMods: { damageBonus: 0.1 }, set: 's_xianjia' }),
  t('h_yuxu', '御虚冠', 'head', 23, { defense: 8, maxHp: 32 }, '冠上虚影流转,神念出窍亦不迷', {
    fixedMods: { cultivationSpeed: 0.06 },
    set: 's_xianjia'
  }),
  t('b_yunjin', '云锦仙袍', 'body', 23, { defense: 14, maxHp: 62 }, '云锦织就,风过不沾尘', {
    fixedMods: { dodgeRate: 0.04 },
    set: 's_xianjia'
  }),
  t('wr_xianlin', '仙鳞腕甲', 'wrist', 23, { attack: 6, defense: 6 }, '应龙脱鳞所制,坚而有灵', { fixedMods: { attackPct: 0.05 } }),
  t('bl_suiyu', '碎玉仙绦', 'belt', 23, { defense: 6, maxHp: 46 }, '万千仙玉碎而复合,束之如渊', { fixedMods: { maxHpPct: 0.06 } }),
  t('bt_xianyun', '踏云履', 'boots', 23, { defense: 7, maxHp: 26 }, '足不沾地,行于云上', { fixedMods: { explorationSpeed: 0.12 } }),
  t('n_xingmang', '星芒仙坠', 'necklace', 23, { maxHp: 45 }, '一颗小星坠在颈间,夜夜微光', { fixedMods: { qiRegen: 0.1 } }),
  t('r_xianji', '仙机戒', 'ring', 23, { attack: 7, maxHp: 20 }, '仙机流转,掐指知凶吉', { fixedMods: { luck: 0.06 } }),
  t('tl_xianzhuan', '仙篆', 'talisman', 23, { maxHp: 40 }, '一枚古仙篆,朱砂至今未褪', { fixedMods: { breakthroughRate: 0.03 } }),

  // ---- 24 阶 · 太乙雷池 / 玄机道场 ----
  t('w_taiyilei', '太乙雷剑', 'weapon', 24, { attack: 20 }, '雷池水淬过的剑,剑身带雷纹', { fixedMods: { damageBonus: 0.1 } }),
  t('h_leichi', '雷池冠', 'head', 24, { defense: 8, maxHp: 32 }, '雷池边捡的旧冠,戴久了不惧雷声', { fixedMods: { tribulationResist: 0.08 } }),
  t('b_leizepao', '雷池道袍', 'body', 24, { defense: 14, maxHp: 62 }, '雷池边晾过的道袍,不惹尘', { fixedMods: { dodgeRate: 0.05 } }),
  t('wr_leichi', '雷池腕甲', 'wrist', 24, { attack: 6, defense: 6 }, '腕甲里封着一滴雷池水', { fixedMods: { tribulationResist: 0.1 } }),
  t('bl_taiyiyu', '太乙玉绦', 'belt', 24, { defense: 6, maxHp: 46 }, '绦上串着九枚玉筹', { fixedMods: { maxHpPct: 0.08 } }),
  t('bo_xuanxu', '玄虚履', 'boots', 24, { defense: 7, maxHp: 26 }, '踏玄虚步的履,走位难测', { fixedMods: { dodgeRate: 0.06 } }),
  t('n_leichi', '雷池珠', 'necklace', 24, { maxHp: 45 }, '珠里一道雷,睡时听得见轻响', { fixedMods: { qiRegen: 0.12 } }),
  t('r_xuanxu', '玄虚戒', 'ring', 24, { attack: 7, maxHp: 20 }, '戒上机关一转,便知凶吉', { fixedMods: { accuracy: 0.08 } }),
  t('tl_taiyizhuan', '太乙符篆', 'talisman', 24, { maxHp: 40 }, '太乙救苦的符篆,一笔未断', { fixedMods: { breakthroughRate: 0.03 } }),

  // ---- 25 阶 · 大罗天阙 / 罗天星海 ----
  t('w_luotian', '罗天剑', 'weapon', 25, { attack: 20 }, '大罗天上的一柄,剑落无声', { fixedMods: { damageBonus: 0.1 } }),
  t('h_luotian', '罗天冠', 'head', 25, { defense: 8, maxHp: 32 }, '冠上星斗流转,如戴一片小天', { fixedMods: { cultivationSpeed: 0.08 } }),
  t('b_xinghai', '星海仙袍', 'body', 25, { defense: 14, maxHp: 62 }, '袍里像盛着一片星海', { fixedMods: { dodgeRate: 0.05 } }),
  t('wr_luotian', '罗天腕甲', 'wrist', 25, { attack: 6, defense: 6 }, '腕甲上錾着周天星度', { fixedMods: { attackPct: 0.06 } }),
  t('bl_xinghai', '星海玉绦', 'belt', 25, { defense: 6, maxHp: 46 }, '绦上串着九枚星砂', { fixedMods: { maxHpPct: 0.08 } }),
  t('bo_luotian', '罗天履', 'boots', 25, { defense: 7, maxHp: 26 }, '踏星而行,不留痕迹', { fixedMods: { speed: 0.08 } }),
  t('n_xinghai', '星海坠', 'necklace', 25, { maxHp: 45 }, '一粒星海里的沙,握久了会发亮', { fixedMods: { qiRegen: 0.14 } }),
  t('r_luotian', '罗天戒', 'ring', 25, { attack: 7, maxHp: 20 }, '戒里数着周天之数', { fixedMods: { critRate: 0.04 } }),
  t('tl_xinghai', '星海篆', 'talisman', 25, { maxHp: 40 }, '一道写在海潮上的旧篆', { fixedMods: { breakthroughRate: 0.03 } }),

  // ============ 神界(26-29 阶)============

  // ---- 26 阶 · 神域边陲 / 神迹荒原 ----
  t('w_tianguan', '天关神钺', 'weapon', 26, { attack: 20 }, '神兵天关下立着的那一柄,守关者才拔得动', { fixedMods: { armorPen: 0.1 } }),
  t('h_yunshen', '陨神盔', 'head', 26, { defense: 8, maxHp: 32 }, '从陨神战场捡回的盔,战意至今未散', { fixedMods: { damageReduction: 0.05 } }),
  t('b_shenwen', '神纹甲', 'body', 26, { defense: 14, maxHp: 62 }, '甲上神纹是法则刻的,刀兵落下如落虚处', { fixedMods: { damageReduction: 0.08 } }),
  t('wr_shenjun', '神军护腕', 'wrist', 26, { attack: 6, defense: 6 }, '神军制式护腕,列阵时千具同鸣', { fixedMods: { attackPct: 0.05 } }),
  t('bl_shenwangdai', '神王玉带', 'belt', 26, { defense: 6, maxHp: 46 }, '神王殿里取出的玉带,系之则威仪自生', { fixedMods: { maxHpPct: 0.06 } }),
  t('bt_yunshen', '陨神战靴', 'boots', 26, { defense: 7, maxHp: 26 }, '踏过的战场,没有第二个活人', { fixedMods: { speed: 0.08 } }),
  t('n_xianghuo', '香火神坠', 'necklace', 26, { maxHp: 45 }, '万神殿堂的香火凝成一坠,戴上便有一分信力', { fixedMods: { qiRegen: 0.1 } }),
  t('r_shenyin', '神印戒', 'ring', 26, { attack: 7, maxHp: 20 }, '一枚神印缩在指上,印之所指即是法度', { fixedMods: { attackPct: 0.06 } }),
  t('tl_dique', '帝阙符', 'talisman', 26, { maxHp: 40 }, '帝阙之下九千级天阶,此符可省九百级', { fixedMods: { breakthroughRate: 0.035 } }),

  // ---- 27 阶 · 神兵天关 / 陨神战场 ----
  t('w_shenbing', '神兵天钺', 'weapon', 27, { attack: 20 }, '天关神兵的钺,刃口卷了再铸', { fixedMods: { armorPen: 0.1 } }),
  t('h_yunshenkui', '陨神战盔', 'head', 27, { defense: 8, maxHp: 32 }, '盔上裂了一道口子,那是神留下的', {
    fixedMods: { damageReduction: 0.05 }
  }),
  t('b_shenbingjia', '神兵战甲', 'body', 27, { defense: 14, maxHp: 62 }, '天关制式的战甲,肩上铸着刀痕', { fixedMods: { damageReduction: 0.08 } }),
  t('wr_shenbing', '神兵腕环', 'wrist', 27, { attack: 6, defense: 6 }, '腕环相击,是天关换阵的暗号', { fixedMods: { counterRate: 0.08 } }),
  t('bl_yunshenshu', '陨神束带', 'belt', 27, { defense: 6, maxHp: 46 }, '束带挽着陨神战场的一缕战意', { fixedMods: { shieldOnStart: 0.1 } }),
  t('bo_tianguan', '天关神靴', 'boots', 27, { defense: 7, maxHp: 26 }, '守过天关的靴,靴底磨得极薄', { fixedMods: { speed: 0.08 } }),
  t('n_yunshengu', '陨神骨坠', 'necklace', 27, { maxHp: 45 }, '一截陨神的指骨,至今不冷', { fixedMods: { maxHpPct: 0.08 } }),
  t('r_tianguan', '天关神戒', 'ring', 27, { attack: 7, maxHp: 20 }, '天关守将的印戒,指节处磨平了', { fixedMods: { attackPct: 0.06 } }),
  t('tl_shenbing', '神兵符', 'talisman', 27, { maxHp: 40 }, '符上画着列阵的次序', { fixedMods: { breakthroughRate: 0.035 } }),

  // ---- 28 阶 · 神王圣殿 / 万神殿堂 ----
  t('w_shenge', '神戈', 'weapon', 28, { attack: 20 }, '神戈所指,众神俯首', { fixedMods: { armorPen: 0.1 }, set: 's_shenjia' }),
  t('h_shenmian', '神冕', 'head', 28, { defense: 8, maxHp: 32 }, '神冕加身,言出法随', {
    fixedMods: { damageReduction: 0.05 },
    set: 's_shenjia'
  }),
  t('b_shenkai', '神铠', 'body', 28, { defense: 14, maxHp: 62 }, '神金锻造,神域之火亦不能熔', {
    fixedMods: { damageReduction: 0.08 },
    set: 's_shenjia'
  }),
  t('wr_shenbi', '神臂环', 'wrist', 28, { attack: 6, defense: 6 }, '神环缠臂,举手有千钧之力', { fixedMods: { counterRate: 0.08 } }),
  t('bl_faze', '法则带', 'belt', 28, { defense: 6, maxHp: 46 }, '一条法则凝成的带,系则不坠', { fixedMods: { shieldOnStart: 0.1 } }),
  t('bt_shenxing', '神行靴', 'boots', 28, { defense: 7, maxHp: 26 }, '踏地生雷,万里一瞬', { fixedMods: { speed: 0.08 } }),
  t('n_shenxin', '神心坠', 'necklace', 28, { maxHp: 45 }, '一神陨落之心,至今犹温', { fixedMods: { maxHpPct: 0.08 } }),
  t('r_shenquan', '神权戒', 'ring', 28, { attack: 7, maxHp: 20 }, '戴上它,你便握有一分神权', { fixedMods: { attackPct: 0.06 } }),
  t('tl_shenzhao', '神诏', 'talisman', 28, { maxHp: 40 }, '一纸神诏,天地共遵', { fixedMods: { breakthroughRate: 0.035 } }),

  // ---- 29 阶 · 神帝天宫 / 帝阙天阶 ----
  t('w_dique', '帝阙神剑', 'weapon', 29, { attack: 20 }, '神帝天宫里的佩剑,剑鞘上无饰', { fixedMods: { damageBonus: 0.11 } }),
  t('h_dique', '帝阙冠', 'head', 29, { defense: 8, maxHp: 32 }, '帝阙的冠,压得住九天神威', { fixedMods: { cultivationSpeed: 0.08 } }),
  t('b_diquelong', '神帝龙袍', 'body', 29, { defense: 14, maxHp: 62 }, '袍上绣着神帝的龙,鳞片像活的', { fixedMods: { maxHpPct: 0.1 } }),
  t('wr_dique', '帝阙腕甲', 'wrist', 29, { attack: 6, defense: 6 }, '腕甲内侧是帝阙的族徽', { fixedMods: { attackPct: 0.06 } }),
  t('bl_shendi', '神帝玉带', 'belt', 29, { defense: 6, maxHp: 46 }, '玉带上的每一枚玉都是一次朝会的记数', { fixedMods: { maxHpPct: 0.09 } }),
  t('bo_dique', '帝阙履', 'boots', 29, { defense: 7, maxHp: 26 }, '走过九千级天阶的履', { fixedMods: { dodgeRate: 0.06 } }),
  t('n_shendi', '神帝坠', 'necklace', 29, { maxHp: 45 }, '坠中一帝威,佩之不敢直行', { fixedMods: { qiRegen: 0.14 } }),
  t('r_dique', '帝阙印戒', 'ring', 29, { attack: 7, maxHp: 20 }, '印戒落下,便是法度', { fixedMods: { attackPct: 0.06 } }),
  t('tl_diquetian', '帝阙天符', 'talisman', 29, { maxHp: 40 }, '天阶尽处的一道符,持之可省九百级', { fixedMods: { breakthroughRate: 0.04 } }),

  // ============ 混沌海(30-32 阶)============

  // ---- 30 阶 · 混沌之滨 / 真灵幽滩 ----
  t('w_hongmengren', '鸿蒙断刃', 'weapon', 30, { attack: 20 }, '开天那一斧余下的一截,一划便是生死界', { fixedMods: { damageBonus: 0.12 } }),
  t('h_zhenling', '真灵冠', 'head', 30, { defense: 8, maxHp: 32 }, '冠中一点真灵不昧,万劫不迷', { fixedMods: { cultivationSpeed: 0.08 } }),
  t('b_benyuan', '本源道袍', 'body', 30, { defense: 14, maxHp: 62 }, '以本源丝织成,刀兵加身如入无物', { fixedMods: { maxHpPct: 0.1 } }),
  t('wr_zhenling', '真灵腕环', 'wrist', 30, { attack: 6, defense: 6 }, '腕环转动时,自身真灵随之稳如磐石', { fixedMods: { attackPct: 0.06 } }),
  t('bl_kaidao', '开天道绦', 'belt', 30, { defense: 6, maxHp: 46 }, '开天之后余下的一缕道气,束之不觉其重', { fixedMods: { shieldOnStart: 0.1 } }),
  t('bt_shenmo', '神魔战靴', 'boots', 30, { defense: 7, maxHp: 26 }, '神魔一体的余威踏过,大地犹在震颤', { fixedMods: { speed: 0.08 } }),
  t('n_hundunzhu', '混沌珠坠', 'necklace', 30, { maxHp: 45 }, '珠里是一团未开的混沌', { fixedMods: { qiRegen: 0.14 } }),
  t('r_wuji', '无极戒', 'ring', 30, { attack: 7, maxHp: 20 }, '无极之数在戒中转动,无始无终', { fixedMods: { luck: 0.08 } }),
  t('tl_hongmengzhuan', '鸿蒙篆', 'talisman', 30, { maxHp: 40 }, '篆上鸿蒙初气未散,抚之如触天地之始', { fixedMods: { cultivationSpeed: 0.1 } }),

  // ---- 31 阶 · 神魔渊 / 神魔古祭 ----
  t('w_kaifu', '开天斧', 'weapon', 31, { attack: 20 }, '开天辟地的那一柄,余威万古不散', {
    fixedMods: { damageBonus: 0.12 },
    set: 's_hundunjia'
  }),
  t('h_hundunguan', '混沌冠', 'head', 31, { defense: 8, maxHp: 32 }, '冠中浑沌未分,一念可开', {
    fixedMods: { cultivationSpeed: 0.08 },
    set: 's_hundunjia'
  }),
  t('b_hundunyi', '混沌玄衣', 'body', 31, { defense: 14, maxHp: 62 }, '玄衣如虚,刀兵加身如入无物', {
    fixedMods: { damageReduction: 0.1 },
    set: 's_hundunjia'
  }),
  t('wr_hundunhuan', '混沌环', 'wrist', 31, { attack: 6, defense: 6 }, '环内自成一界,盈虚不定', { fixedMods: { attackPct: 0.06 } }),
  t('bl_daoyun', '道韵绦', 'belt', 31, { defense: 6, maxHp: 46 }, '一绦道韵,系住将散的本源', { fixedMods: { maxHpPct: 0.09 } }),
  t('bt_wuji', '无极履', 'boots', 31, { defense: 7, maxHp: 26 }, '履下无路,却处处是路', { fixedMods: { dodgeRate: 0.06 } }),
  t('n_benyuan', '本源坠', 'necklace', 31, { maxHp: 45 }, '一滴本源凝成的坠,望之如望万界之初', { fixedMods: { qiRegen: 0.14 } }),
  t('r_hundun', '混沌戒', 'ring', 31, { attack: 7, maxHp: 20 }, '戒指内里,是一方尚未演化的天地', { fixedMods: { luck: 0.08 } }),
  t('tl_daowen', '道文符', 'talisman', 31, { maxHp: 40 }, '符上是比道更早的那一笔', { fixedMods: { cultivationSpeed: 0.1 } }),

  // ---- 32 阶 · 鸿蒙本源 / 道祖悟道崖 ----
  t('w_benyuan', '本源剑', 'weapon', 32, { attack: 20 }, '以本源淬成,剑上没有一丝杂色', { fixedMods: { damageBonus: 0.12 } }),
  t('h_benyuan', '本源冠', 'head', 32, { defense: 8, maxHp: 32 }, '冠里悬着一点本源,望之如望万界之初', {
    fixedMods: { cultivationSpeed: 0.09 }
  }),
  t('b_benyuanshen', '本源神袍', 'body', 32, { defense: 14, maxHp: 62 }, '袍成于天地未分之时,不增不减', { fixedMods: { maxHpPct: 0.11 } }),
  t('wr_benyuan', '本源腕环', 'wrist', 32, { attack: 6, defense: 6 }, '腕环里盘着一缕本源,安静得没有声音', {
    fixedMods: { attackPct: 0.07 }
  }),
  t('bl_benyuan', '本源绦', 'belt', 32, { defense: 6, maxHp: 46 }, '束上它,散与不散都由你', { fixedMods: { maxHpPct: 0.1 } }),
  t('bo_benyuan', '本源履', 'boots', 32, { defense: 7, maxHp: 26 }, '履下无路无尘,只有最初的那一步', { fixedMods: { dodgeRate: 0.07 } }),
  t('n_hongmengzhu', '鸿蒙珠坠', 'necklace', 32, { maxHp: 45 }, '珠里鸿蒙未判,连光都还没有', { fixedMods: { qiRegen: 0.16 } }),
  t('r_daozu', '道祖印戒', 'ring', 32, { attack: 7, maxHp: 20 }, '悟道崖下捡的一枚旧印,落印处皆是道', { fixedMods: { attackPct: 0.07 } }),
  t('tl_daozuzhuan', '道祖真篆', 'talisman', 32, { maxHp: 40 }, '篆上只有一个字,看久了会忘了自己', { fixedMods: { breakthroughRate: 0.04 } }),
]

const BY_ID = new Map(EQUIPMENT_TEMPLATES.map(x => [x.id, x]))

export function equipmentTemplate(id: string): EquipmentTemplate | undefined {
  return BY_ID.get(id)
}

export const EQUIP_SLOT_NAMES: Record<EquipSlot, string> = {
  weapon: '武器',
  head: '头冠',
  body: '衣袍',
  wrist: '护腕',
  belt: '腰带',
  boots: '鞋履',
  necklace: '项链',
  ring: '戒指',
  artifact: '法宝',
  talisman: '灵符'
}
