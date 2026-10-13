/**
 * 功法悟道分支(Phase 31.0 A3 立架 · Phase 32.4 补全全书)
 *
 * 功法满级(learned[id] >= maxLevel)后可择一条悟道方向,
 * 改变该功法从满级起的成长方向(追加 perLevelMods 风格词条)。
 * 同一功法因此出现多个版本 —— 与"无职业 + 混合 Build"契合。
 * 分支一经选择不可更改(转世保留)。
 *
 * ## 分支给多少:锚在装备词条池上,不凭空定价
 *
 * data/affixes.ts 里每个词条都有一档最低值(如 attackPct 最低档 2%),把它记作一个
 * 「词条单位」。一条分支的份量 = 各词条值 ÷ 各自单位,再相加。按此口径本表的档位:
 *
 *   凡品 3.5 · 良品 4~5 · 精品 5~6 · 灵品 7~7.5 · 玄品 7.5~9 · 天品 11~12 · 仙品 14
 *
 * 同品质下辅修略低于主修;秘术满级只需 3 层,故与同品质主修持平而不超。
 * 两条硬约束由 gongfaBranch.spec.ts 守着:
 *   1. 分支给的任何词条值,不得超过同名词条在装备上能出的最大值 —— 悟道是一条路,不是一件神装。
 *   2. 同一功法各分支份量相当 —— 「择一」得是真选择,不能有一条明显是陷阱。
 *
 * ## 分支写什么:长在功法自己的性子上
 *
 * 每条分支都从该功法的立意与既有词条里长出来 —— 敛息诀避的是气机,所以它的悟道通向
 * 御劫与气运;向死而生诀本就吃残血,所以它一条走绝境爆发、一条走绝境续命。
 * 分支不是发词条的由头,而是把这部功法本来就在说的话说到底。
 */
import type { StatMods } from '@/types'
import { gongfaDef, gongfaMaxLevel } from './gongfa'

export interface GongfaBranchDef {
  /** 所属功法 */
  gongfaId: string
  id: string
  name: string
  desc: string
  /** 选此分支后追加的词条(以满级为基准一次性追加) */
  mods: StatMods
}

function b(gongfaId: string, id: string, name: string, desc: string, mods: StatMods): GongfaBranchDef {
  return { gongfaId, id, name, desc, mods }
}

export const GONGFA_BRANCHES: GongfaBranchDef[] = [
  // ---- 主修:太玄引气诀(凡品) ----
  b('m_taixuan', 'b_taixuan_sha', '杀伐', '太玄入杀道,攻伐更烈', { attackPct: 0.1, damageBonus: 0.05 }),
  b('m_taixuan', 'b_taixuan_shou', '守御', '太玄入守道,护体更坚', { defensePct: 0.1, maxHpPct: 0.05 }),
  b('m_taixuan', 'b_taixuan_guiyi', '归一', '万法归一,气机更纯', { cultivationSpeed: 0.06, qiRegen: 0.06 }),

  // ---- 主修:青木长生功(良品·木) ----
  b('m_qingmu', 'b_qingmu_sheng', '生生', '木气长生,愈战愈盛', { maxHpPct: 0.08, regenPerRound: 0.01 }),
  b('m_qingmu', 'b_qingmu_lian', '缠连', '藤蔓缠敌,先机在我', { speed: 0.05, attackPct: 0.04 }),

  // ---- 主修:离火焚天诀(良品·火) ----
  b('m_lihuo', 'b_lihuo_fen', '焚天', '离火更炽,出招更狠', { damageBonus: 0.08, critRate: 0.03 }),
  b('m_lihuo', 'b_lihuo_xu', '续焰', '火尽不熄,攻守兼备', { attackPct: 0.05, defensePct: 0.05 }),

  // ---- 主修:玄水凝真经(良品·水) ----
  b('m_xuanshui', 'b_xuanshui_ning', '凝真', '水凝成真,静者难摧', { defensePct: 0.09, damageReduction: 0.04 }),
  b('m_xuanshui', 'b_xuanshui_rou', '化柔', '以柔卸力,借势还之', { dodgeRate: 0.05, counterRate: 0.1 }),
  b('m_xuanshui', 'b_xuanshui_run', '润物', '润物无声,气机自涌', { qiRegen: 0.12, cultivationSpeed: 0.06 }),

  // ---- 主修:庚金剑典(精品·金) ----
  b('m_gengjin', 'b_gengjin_feng', '锋锐', '剑走极锋,一击断金', { critRate: 0.04, critDamage: 0.16 }),
  b('m_gengjin', 'b_gengjin_po', '破军', '剑压千军,甲胄如纸', { armorPen: 0.12, attackPct: 0.06 }),
  b('m_gengjin', 'b_gengjin_poWang', '破妄', '剑照虚妄,幻影无所遁形', { accuracy: 0.06, attackPct: 0.05 }),
  b('m_gengjin', 'b_gengjin_yi', '剑意', '剑气纵横,一发不止', { comboRate: 0.08, comboDamage: 0.3, attackPct: 0.05 }),

  // ---- 主修:厚土不动明王功(精品·土) ----
  b('m_houtu', 'b_houtu_budong', '不动', '山岳不移,伤我者自伤', { counterRate: 0.12, counterDamage: 0.4, defensePct: 0.05 }),
  b('m_houtu', 'b_houtu_zaiwu', '载物', '厚德载物,身如大地', { maxHpPct: 0.12, regenPerRound: 0.02 }),
  b('m_houtu', 'b_houtu_zhenyue', '镇岳', '山岳压顶,一击定身', { stunRate: 0.06, attackPct: 0.05, defensePct: 0.045 }),

  // ---- 主修:紫霄神雷诀(灵品·雷) ----
  b('m_zixiao', 'b_zixiao_ji', '疾雷', '雷行至疾,先声夺人;开局一合更重', { speed: 0.1, firstStrike: 0.4 }),
  b('m_zixiao', 'b_zixiao_guan', '贯霄', '一雷贯顶,连珠不绝', { comboRate: 0.12, comboDamage: 0.5, attackPct: 0.04 }),
  b('m_zixiao', 'b_zixiao_cui', '淬体', '以雷淬体,劫火难伤', { attackPct: 0.08, maxHpPct: 0.06, tribulationResist: 0.08 }),

  // ---- 主修:罡风渡虚法(灵品·风) ----
  b('m_gangfeng', 'b_gangfeng_du', '渡虚', '身入虚空,锋刃难及', { dodgeRate: 0.08, damageReduction: 0.07 }),
  b('m_gangfeng', 'b_gangfeng_cheng', '乘风', '御风万里,行踪无定', {
    explorationSpeed: 0.16,
    speed: 0.06,
    eventLuck: 0.08
  }),
  b('m_gangfeng', 'b_gangfeng_ren', '风刃', '罡风成刃,千重叠加', { comboRate: 0.1, attackPct: 0.07, speed: 0.06 }),

  // ---- 主修:玄冰道典(灵品·冰) ----
  b('m_xuanbing', 'b_xuanbing_feng', '封灵', '冰封气机,敌不得动', { stunRate: 0.09, defensePct: 0.09, damageReduction: 0.03 }),
  b('m_xuanbing', 'b_xuanbing_liuli', '琉璃', '冰体琉璃,罡壳自生', { shieldOnStart: 0.15, shieldPower: 0.2, maxHpPct: 0.06 }),
  b('m_xuanbing', 'b_xuanbing_tong', '通明', '道心通明,劫数亦寒', {
    tribulationResist: 0.15,
    breakthroughRate: 0.03,
    cultivationSpeed: 0.045
  }),

  // ---- 主修:大光明普照经(玄品·光) ----
  b('m_guangming', 'b_guangming_pu', '普照', '光华护体,伤者自愈', { maxHpPct: 0.15, regenPerRound: 0.03, overhealShield: 0.3 }),
  b('m_guangming', 'b_guangming_bi', '辟易', '光盛则诸邪辟易', { fullHpDamage: 0.3, attackPct: 0.09, damageReduction: 0.03 }),
  b('m_guangming', 'b_guangming_zheng', '证道', '光明证道,前路自开', {
    breakthroughRate: 0.05,
    cultivationSpeed: 0.09,
    lifespanPct: 0.02
  }),

  // ---- 主修:幽冥噬魂录(玄品·暗) ----
  b('m_youming', 'b_youming_shi', '噬魂', '饮血自补,战久不衰', { lifesteal: 0.09, attackPct: 0.07, maxHpPct: 0.03 }),
  b('m_youming', 'b_youming_duo', '夺魄', '残命者,必死其手', { executeDamage: 0.4, armorPen: 0.14, attackPct: 0.03 }),
  b('m_youming', 'b_youming_xie', '入邪', '以命换命,濒死更狂', { lowHpDamage: 0.6, lowHpReduction: 0.3, lifesteal: 0.04 }),

  // ---- 主修:混沌一气功(天品·混沌) ----
  b('m_hundun', 'b_hundun_hua', '化形', '一气化形,四象俱全', {
    attackPct: 0.09,
    defensePct: 0.09,
    maxHpPct: 0.09,
    speed: 0.05
  }),
  b('m_hundun', 'b_hundun_gui', '归元', '万法归元,道基自厚', {
    cultivationSpeed: 0.15,
    qiRegen: 0.16,
    breakthroughRate: 0.03
  }),
  b('m_hundun', 'b_hundun_kai', '开天', '混沌开天,一击破界', { attackPct: 0.12, armorPen: 0.16, critDamage: 0.16 }),

  // ---- 辅修:龟灵吐纳术(凡品) ----
  b('s_tuna', 'b_tuna_mian', '绵长', '气息绵长,修行不辍', { cultivationSpeed: 0.06, qiRegen: 0.06 }),
  b('s_tuna', 'b_tuna_yang', '养元', '吐纳养元,寿数自延', { lifespanPct: 0.04, maxHpPct: 0.045 }),

  // ---- 辅修:百炼锻体术(凡品) ----
  b('s_lianti', 'b_lianti_tie', '铁身', '皮糙肉厚,刀兵难入', { maxHpPct: 0.06, damageReduction: 0.03 }),
  b('s_lianti', 'b_lianti_lu', '炉火', '肉身为炉,愈锻愈利', { attackPct: 0.05, defensePct: 0.03 }),

  // ---- 辅修:御风步(良品) ----
  b('s_yufeng', 'b_yufeng_ji', '疾影', '影如惊鸿,先手更近,避锋亦巧', { speed: 0.06, dodgeRate: 0.04 }),
  b('s_yufeng', 'b_yufeng_suo', '缩地', '踏风缩地,山川尺寸', { explorationSpeed: 0.12, eventLuck: 0.05 }),

  // ---- 辅修:敛息诀(良品) ----
  b('s_lianxi', 'b_lianxi_cang', '藏形', '形迹俱隐,锋刃落空', { dodgeRate: 0.05, damageReduction: 0.03 }),
  b('s_lianxi', 'b_lianxi_bi', '避劫', '气机不显,天数难寻', { tribulationResist: 0.1, luck: 0.04 }),

  // ---- 辅修:聚灵阵法初解(良品) ----
  b('s_juling', 'b_juling_ju', '聚元', '阵纹更密,灵气奔涌', { qiRegen: 0.12, cultivationSpeed: 0.03 }),
  b('s_juling', 'b_juling_dun', '化盾', '灵气外放,结阵护身', { shieldOnStart: 0.1, shieldPower: 0.16 }),

  // ---- 辅修:明心见性篇(精品) ----
  b('s_mingxin', 'b_mingxin_guan', '观心', '战中悟道,所获倍之', { expGain: 0.16, cultivationSpeed: 0.03 }),
  b('s_mingxin', 'b_mingxin_xing', '见性', '本性既明,小进阶自开,败则少损;大关天劫,不由此悟', { breakthroughRate: 0.03, breakRefund: 0.1 }),

  // ---- 辅修:铁骨铮铮功(精品) ----
  b('s_tiegu', 'b_tiegu_xuan', '玄铁', '骨坚如铁,万击不摧', { defensePct: 0.09, damageReduction: 0.04 }),
  b('s_tiegu', 'b_tiegu_zhe', '宁折', '宁折不弯,血尽犹立', { lowHpReduction: 0.3, lowHpDamage: 0.3 }),

  // ---- 辅修:灵犀一指(精品) ----
  b('s_lingxi', 'b_lingxi_zhao', '犀照', '灵犀愈明,出手必中', { critRate: 0.035, critDamage: 0.12 }),
  b('s_lingxi', 'b_lingxi_zhi', '一指', '一指断脉,甲不能御', { critDamage: 0.24, armorPen: 0.08 }),

  // ---- 辅修:不动如山章(精品) ----
  b('s_budong', 'b_budong_ke', '罡壳', '盾罡愈厚,开战即立', { shieldOnStart: 0.15, maxHpPct: 0.06 }),
  b('s_budong', 'b_budong_feng', '盾锋', '以盾为锋,罡在势盛', { shieldPower: 0.24, overhealShield: 0.6 }),

  // ---- 辅修:点石成金术(灵品) ----
  b('s_dianshi', 'b_dianshi_jin', '点金', '点石成金,战胜则石来;锤炼更省,祭炼不与', { spiritStoneGain: 0.2, forgeDiscount: 0.1 }),
  b('s_dianshi', 'b_dianshi_sha', '淘沙', '沙里淘珍,时有意外', { dropRate: 0.12, doubleDropRate: 0.1, luck: 0.02 }),

  // ---- 辅修:龟息养寿功(灵品) ----
  b('s_guixi', 'b_guixi_shou', '养寿', '息心止念,寿与天齐', { lifespanPct: 0.08, maxHpPct: 0.06 }),
  b('s_guixi', 'b_guixi_xi', '息元', '龟息不绝,伤处自愈', { regenPerRound: 0.03, maxHpPct: 0.06, overhealShield: 0.3 }),

  // ---- 辅修:周天星辰图(玄品) ----
  b('s_zhoutian', 'b_zhoutian_zhou', '周天', '星辰周行,灵气不竭', { qiRegen: 0.2, cultivationSpeed: 0.075 }),
  b('s_zhoutian', 'b_zhoutian_su', '列宿', '窍如列宿,运数自明', {
    cultivationSpeed: 0.12,
    breakthroughRate: 0.025,
    luck: 0.02
  }),

  // ---- 辅修:万剑归宗图(玄品) ----
  b('s_wanjian', 'b_wanjian_chao', '朝宗', '万剑齐出,连绵不绝', { comboRate: 0.12, comboDamage: 0.5, attackPct: 0.035 }),
  b('s_wanjian', 'b_wanjian_gui', '归一', '万剑归一,一剑破万法', { attackPct: 0.09, armorPen: 0.08, critDamage: 0.08 }),

  // ---- 秘术:天眼通(精品) ----
  b('x_tianyan', 'b_tianyan_ji', '窥机', '天眼开处,历练际遇自至', { eventLuck: 0.15, luck: 0.05 }),
  b('x_tianyan', 'b_tianyan_bao', '照宝', '宝气入眼,所获不空', { dropRate: 0.12, doubleDropRate: 0.12 }),

  // ---- 秘术:金刚不坏身(灵品) ----
  b('x_jingang', 'b_jingang_buhuai', '不坏', '法身金刚,万法难伤', { damageReduction: 0.08, defensePct: 0.09 }),
  b('x_jingang', 'b_jingang_bumie', '不灭', '血尽而身不灭', { lowHpReduction: 0.35, regenPerRound: 0.025, maxHpPct: 0.03 }),

  // ---- 秘术:剑心通明(灵品) ----
  b('x_jianxin', 'b_jianxin_che', '澄澈', '剑心无瑕,一击中的', { critRate: 0.045, critDamage: 0.2 }),
  b('x_jianxin', 'b_jianxin_ji', '先机', '料敌于先,开局一合如雷', { firstStrike: 0.4, speed: 0.09 }),

  // ---- 秘术:向死而生诀(灵品) ----
  b('x_xiangsi', 'b_xiangsi_si', '死地', '入死地,则势不可挡', { lowHpDamage: 0.6, lowHpReduction: 0.3 }),
  b('x_xiangsi', 'b_xiangsi_sheng', '后生', '向死求生,伤敌自活', {
    lifesteal: 0.08,
    lowHpReduction: 0.2,
    regenPerRound: 0.01
  }),

  // ---- 秘术:天罡反震诀(灵品) ----
  b('x_fanzhen', 'b_fanzhen_zhen', '反震', '来力愈猛,还之愈重', { counterRate: 0.15, counterDamage: 0.6, attackPct: 0.02 }),
  b('x_fanzhen', 'b_fanzhen_gang', '天罡', '罡气护身,反震不绝', { damageReduction: 0.06, counterRate: 0.1, defensePct: 0.06 }),

  // ---- 秘术:一气化三清(玄品) ----
  b('x_sanqing', 'b_sanqing_hua', '化三', '一气化三,日夜不辍', { cultivationSpeed: 0.18, qiRegen: 0.1 }),
  b('x_sanqing', 'b_sanqing_he', '合一', '三清归一,身兼众长', {
    cultivationSpeed: 0.09,
    attackPct: 0.05,
    defensePct: 0.045,
    maxHpPct: 0.045
  }),

  // ---- 秘术:斡旋造化(天品) ----
  b('x_woxuan', 'b_woxuan_wo', '斡旋', '小进阶或可移数,败则修为少损;大关天数,不可窃改', { breakthroughRate: 0.06, breakRefund: 0.2, luck: 0.02 }),
  b('x_woxuan', 'b_woxuan_qie', '窃化', '窃天地造化,劫数分润', {
    tribulationResist: 0.25,
    breakthroughRate: 0.04,
    lifespanPct: 0.04
  }),

  // ---- 秘术:逆天改命经(仙品) ----
  b('x_nitian', 'b_nitian_gai', '改命', '命数握于己手', { luck: 0.12, breakthroughRate: 0.05, lifespanPct: 0.06 }),
  b('x_nitian', 'b_nitian_ni', '逆天', '天要我死,我偏不死', {
    tribulationResist: 0.3,
    lowHpReduction: 0.35,
    lifespanPct: 0.09
  }),
  b('x_nitian', 'b_nitian_wo', '由我', '我命由我,道途自开', { cultivationSpeed: 0.18, expGain: 0.2, breakRefund: 0.15 }),

  // ---- 仙界功法(仙品) ----
  // 主修:御虚仙典
  b('m_yuxu', 'b_yuxu_kong', '空明', '御虚凌空,气机自足', { cultivationSpeed: 0.2, qiRegen: 0.2, damageReduction: 0.1 }),
  b('m_yuxu', 'b_yuxu_feng', '仙锋', '仙光化刃,无坚不摧', { attackPct: 0.16, critDamage: 0.4, armorPen: 0.12 }),
  b('m_yuxu', 'b_yuxu_ti', '仙体', '仙躯不坏,绵延自愈', { maxHpPct: 0.2, defensePct: 0.18, regenPerRound: 0.05 }),
  // 辅修:仙灵淬体术
  b('s_xianling', 'b_xianling_gu', '固本', '仙灵固本,根骨愈坚', { maxHpPct: 0.24, defensePct: 0.2 }),
  b('s_xianling', 'b_xianling_yu', '愈体', '仙灵润体,伤处自愈', { regenPerRound: 0.06, damageReduction: 0.12, maxHpPct: 0.12 }),
  // 秘术:仙机通玄
  b('x_xianji', 'b_xianji_ji', '窥机', '仙机在握,历练际遇自来,装备亦易现', { luck: 0.15, eventLuck: 0.2, dropRate: 0.15 }),
  b('x_xianji', 'b_xianji_ying', '撷珍', '洞悉天机,装备更易现世,战胜则灵石盈囊', { dropRate: 0.25, spiritStoneGain: 0.35, luck: 0.1 }),

  // ---- 神界功法(神品) ----
  // 主修:神霄九变
  b('m_shenxiao', 'b_shenxiao_lei', '雷变', '九变归雷,一击焚天', { attackPct: 0.22, critDamage: 0.5, armorPen: 0.16 }),
  b('m_shenxiao', 'b_shenxiao_shen', '神变', '通神入化,气机不绝', { cultivationSpeed: 0.26, qiRegen: 0.24, breakthroughRate: 0.05 }),
  b('m_shenxiao', 'b_shenxiao_ti', '体变', '化身神躯,万法难伤', { maxHpPct: 0.3, defensePct: 0.3, damageReduction: 0.12 }),
  // 辅修:神炼不灭身
  b('s_shenlianti', 'b_shenlianti_bu', '不灭', '神躯不灭,历劫不磨', { maxHpPct: 0.3, defensePct: 0.24, damageReduction: 0.12 }),
  b('s_shenlianti', 'b_shenlianti_yu', '愈神', '神火自愈,血尽复生', { regenPerRound: 0.06, maxHpPct: 0.2, damageReduction: 0.1 }),
  // 主修:混元无极经
  b('m_hunyuan', 'b_hunyuan_hua', '化形', '混元化形,四象俱足', { attackPct: 0.24, defensePct: 0.24, maxHpPct: 0.24 }),
  b('m_hunyuan', 'b_hunyuan_gui', '归元', '万法归元,道基自厚', { cultivationSpeed: 0.3, qiRegen: 0.28, breakthroughRate: 0.06 }),
  b('m_hunyuan', 'b_hunyuan_kai', '开天', '无极开天,一击破界', { attackPct: 0.28, armorPen: 0.2, critDamage: 0.6 }),
  // 辅修:混沌体术
  b('s_hundunti', 'b_hundunti_gu', '固本', '混沌磐身,万击不摇', { maxHpPct: 0.3, defensePct: 0.3 }),
  b('s_hundunti', 'b_hundunti_ren', '润身', '身化混沌,伤处自弥', { regenPerRound: 0.06, maxHpPct: 0.2, damageReduction: 0.1 }),
  // 秘术:神机衍数
  b('x_shenji', 'b_shenji_ce', '测算', '推演算尽,器物成色自高,战胜则石来', { luck: 0.15, dropRate: 0.25, spiritStoneGain: 0.35 }),
  b('x_shenji', 'b_shenji_yan', '验天', '验于天时,同程妖踪更密,兵器更易现世', { dropRate: 0.2, explorationSpeed: 0.25, luck: 0.1 }),
  // 秘术:道音玄章
  b('x_daoyin', 'b_daoyin_ming', '明道', '道音入耳,修行不辍', { cultivationSpeed: 0.3, qiRegen: 0.28, breakthroughRate: 0.06 }),
  b('x_daoyin', 'b_daoyin_wu', '悟道', '闻音悟道,一日千里', { cultivationSpeed: 0.28, expGain: 0.28, luck: 0.12 }),

  // ---- 渡劫:九霄渡劫经(人间界末,补该境空白) ----
  b('m_dujie', 'b_dujie_lei', '雷罚', '雷气入杀,劫雷加身', { attackPct: 0.2, damageBonus: 0.05 }),
  b('m_dujie', 'b_dujie_cui', '淬体', '以雷淬骨,劫火不伤', { maxHpPct: 0.2, damageReduction: 0.1 }),

  // ---- 太乙:太乙金华(仙界,补该境空白) ----
  b('x_taiyi', 'b_taiyi_shou', '守中', '守中致虚,道心更明', { cultivationSpeed: 0.3, breakthroughRate: 0.05 }),
  b('x_taiyi', 'b_taiyi_guang', '回光', '回光照物,历练际遇自明,如镜现影', { luck: 0.15, eventLuck: 0.15, qiRegen: 0.2 }),

  // ---- 大罗:大罗天章(仙界,补该境空白) ----
  b('m_daluo', 'b_daluo_zhen', '归真', '万法归真,一击破妄', { attackPct: 0.3, damageBonus: 0.1 }),
  b('m_daluo', 'b_daluo_zhang', '天章', '天章护体,动静如法', { maxHpPct: 0.3, dodgeRate: 0.12 }),

  // ---- 神将:神将兵符(神界,补该境空白) ----
  b('s_shenjiang', 'b_shenjiang_fa', '天罚', '受符行刑,攻势更烈', { attackPct: 0.3, critRate: 0.08, damageBonus: 0.15 }),
  b('s_shenjiang', 'b_shenjiang_zhen', '军律', '结阵自守,受击愈稳', { defensePct: 0.3, damageReduction: 0.15, maxHpPct: 0.3 }),

  // ======== 第二轮扩功法(ISS-198):人间界后段 + 仙界/神界/混沌海逐境补足 ========
  // 门槛规则与上一批一致:每条分支的份量以装备词条最低档为单位折算,
  // 同品质档位不低于此前的均值(判据见 gongfaBranch.spec「份量随品质递增」),
  // 同一部功法的两条路份量相当(比值 ≤2)。

  // ---- 炼虚:太虚炼神篇 ----
  b('m_taixu', 'b_taixu_lian', '炼神', '炼神不辍,气机自循', { cultivationSpeed: 0.12, qiRegen: 0.12, defensePct: 0.06 }),
  b('m_taixu', 'b_taixu_huan', '还虚', '形还于虚,伤不著身', { defensePct: 0.15, damageReduction: 0.06, maxHpPct: 0.03 }),
  // ---- 合体:形神合一诀 ----
  b('s_xingshen', 'b_xingshen_yi', '合一', '形与神合,伤处自弥', { maxHpPct: 0.18, defensePct: 0.09, regenPerRound: 0.03 }),
  b('s_xingshen', 'b_xingshen_ning', '凝形', '身如凝铁,万击不移', { defensePct: 0.12, maxHpPct: 0.15, damageReduction: 0.06 }),
  // ---- 大乘:无量寿光经 ----
  b('m_wuliang', 'b_wuliang_shou', '寿光', '光寿同长,劫来愈坚', { cultivationSpeed: 0.12, lifespanPct: 0.1, maxHpPct: 0.09 }),
  b('m_wuliang', 'b_wuliang_ming', '明照', '一光照彻,气机自涌', { cultivationSpeed: 0.09, maxHpPct: 0.12, qiRegen: 0.2 }),
  // ---- 大乘:菩提明镜功 ----
  b('s_puti', 'b_puti_jing', '明镜', '镜上无尘,福祸先知', { expGain: 0.12, breakthroughRate: 0.04, luck: 0.1 }),
  b('s_puti', 'b_puti_wu', '悟禅', '一悟一禅,道基自厚', { cultivationSpeed: 0.12, breakthroughRate: 0.05, expGain: 0.12 }),
  // ---- 渡劫:九霄劫印 ----
  b('x_jiuxiao', 'b_jiuxiao_yin', '劫印', '以劫为印,印出则雷散', { tribulationResist: 0.2, damageReduction: 0.1, lowHpReduction: 0.3 }),
  b('x_jiuxiao', 'b_jiuxiao_yinlei', '引雷', '引劫入体,反劈其敌', { attackPct: 0.14, tribulationResist: 0.15, speed: 0.06 }),
  // ---- 真仙:仙光护体诀 ----
  b('s_xianguang', 'b_xianguang_hu', '护体', '仙光成壁,先折其锋', {
    shieldOnStart: 0.2,
    shieldPower: 0.24,
    damageReduction: 0.11,
    defensePct: 0.12
  }),
  b('s_xianguang', 'b_xianguang_zhao', '光照', '光及周身,伤处自愈', { maxHpPct: 0.18, regenPerRound: 0.04, damageReduction: 0.12 }),
  // ---- 玄仙:玄仙御气经 ----
  b('m_xuanxian', 'b_xuanxian_yu', '御气', '御气而行,一息千里', { cultivationSpeed: 0.18, qiRegen: 0.24, speed: 0.12 }),
  b('m_xuanxian', 'b_xuanxian_ti', '淬体', '气淬其身,内外俱坚', { cultivationSpeed: 0.15, defensePct: 0.18, maxHpPct: 0.15 }),
  // ---- 金仙:金阙玉章 ----
  b('m_jinque', 'b_jinque_jin', '金性', '金性入剑,一斩无回', { attackPct: 0.18, damageBonus: 0.12, critRate: 0.03 }),
  b('m_jinque', 'b_jinque_yu', '玉章', '玉章镇身,万法不侵', { defensePct: 0.21, maxHpPct: 0.18, damageReduction: 0.06 }),
  // ---- 太乙:太乙救苦经 ----
  b('m_taiyijiu', 'b_taiyi_jiu', '救苦', '苦海之中,一念自起', { maxHpPct: 0.24, regenPerRound: 0.05, lowHpReduction: 0.3 }),
  b('m_taiyijiu', 'b_taiyi_du', '渡厄', '厄临不惊,劫来愈稳', { tribulationResist: 0.25, damageReduction: 0.12, maxHpPct: 0.15 }),
  // ---- 大罗:罗天星辰诀 ----
  b('s_luotian', 'b_luotian_xing', '星辰', '星光照眼,虚影无所遁', { accuracy: 0.1, critRate: 0.06, critDamage: 0.4 }),
  b('s_luotian', 'b_luotian_luo', '罗天', '罗天垂网,一发不止', { attackPct: 0.14, damageBonus: 0.15, comboRate: 0.18 }),
  // ---- 神人:藐姑射神章 ----
  b('x_miaogushe', 'b_miaogushe_shen', '神凝', '神凝不散,锋刃难及', { damageReduction: 0.15, maxHpPct: 0.27, dodgeRate: 0.08 }),
  b('x_miaogushe', 'b_miaogushe_you', '游世', '游乎四海之外,来去无踪', { speed: 0.2, dodgeRate: 0.12, damageReduction: 0.14 }),
  // ---- 神将:天关神兵诀 ----
  b('m_tianguan', 'b_tianguan_bing', '神兵', '神兵在握,甲胄如纸', { attackPct: 0.3, armorPen: 0.2, critDamage: 0.16 }),
  b('m_tianguan', 'b_tianguan_guan', '守关', '一夫当关,万军莫开', { defensePct: 0.3, maxHpPct: 0.3, shieldPower: 0.16 }),
  // ---- 神王:神王御极经 ----
  b('m_shenwang', 'b_shenwang_yu', '御极', '御极临下,一击定局', { attackPct: 0.3, damageBonus: 0.2, executeDamage: 0.1 }),
  b('m_shenwang', 'b_shenwang_wang', '王权', '王权在身,身即法度', { defensePct: 0.3, maxHpPct: 0.3 }),
  // ---- 神帝:神帝临尘章 ----
  b('m_shendi', 'b_shendi_lin', '临尘', '帝临尘世,言出法随', { attackPct: 0.3, speed: 0.2, stunRate: 0.06 }),
  b('m_shendi', 'b_shendi_ze', '垂泽', '帝泽垂身,伤处自生', { cultivationSpeed: 0.28, maxHpPct: 0.3, regenPerRound: 0.04 }),
  // ---- 混沌真灵:真灵不昧诀 ----
  b('s_zhenling', 'b_zhenling_bu', '不昧', '真灵不昧,万劫不迷', { cultivationSpeed: 0.24, breakthroughRate: 0.06, luck: 0.15 }),
  b('s_zhenling', 'b_zhenling_ling', '守灵', '守住一点真灵,身自不散', { maxHpPct: 0.3, damageReduction: 0.15, qiRegen: 0.16 }),
  // ---- 混沌神魔:神魔开天经 ----
  b('m_shenmo', 'b_shenmo_kai', '开天', '以身开界,一击断世', { attackPct: 0.3, critRate: 0.07 }),
  b('m_shenmo', 'b_shenmo_mo', '神魔', '神魔一体,气血两旺', { maxHpPct: 0.3, attackPct: 0.24 }),
  // ---- 混沌道祖:道祖本源经 ----
  b('m_daozu', 'b_daozu_ben', '本源', '追本溯源,气机自归', { cultivationSpeed: 0.32, qiRegen: 0.28, breakthroughRate: 0.05 }),
  b('m_daozu', 'b_daozu_dao', '道祖', '道生一,一化万', { attackPct: 0.3, defensePct: 0.21 })
]

const BY_ID = new Map(GONGFA_BRANCHES.map(b => [b.id, b]))

export function gongfaBranchDef(id: string): GongfaBranchDef | undefined {
  return BY_ID.get(id)
}

export function branchesFor(gongfaId: string): GongfaBranchDef[] {
  return GONGFA_BRANCHES.filter(b => b.gongfaId === gongfaId)
}

/**
 * 该功法此刻是否真能悟道。
 *
 * 满级只是前提,还须确有歧路可择 —— 判据集中在此,界面提示与实际可选项不会分叉。
 * 全书功法现已尽数写有分支,但这道判断仍不能省:日后若新增一部尚未配分支的功法,
 * 它就该老老实实显示「圆满」,而不是挂出一个点开即空的「待悟道」。
 */
export function canEnlighten(gongfaId: string, level: number): boolean {
  const def = gongfaDef(gongfaId)
  if (!def) return false
  return level >= gongfaMaxLevel(def) && branchesFor(gongfaId).length > 0
}
